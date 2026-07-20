import React, {useState, useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {AppUsageSession} from './AppUsageScreen';
import {
  consolidateSessionsByApp,
  dedupeSessions,
  formatAppLabel,
  formatDuration,
} from './AppUsageUtils';
import {ColorPalette} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

interface Props {
  sessions: AppUsageSession[];
}

type Timeframe = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export function AppUsageReports({sessions}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [timeframe, setTimeframe] = useState<Timeframe>('DAILY');

  const filteredSessions = useMemo(() => {
    const now = Date.now();
    const msInDay = 24 * 60 * 60 * 1000;
    let cutoff = 0;
    if (timeframe === 'DAILY') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      cutoff = today.getTime();
    } else if (timeframe === 'WEEKLY') {
      cutoff = now - 7 * msInDay;
    } else {
      cutoff = now - 30 * msInDay;
    }
    return dedupeSessions(sessions.filter(s => s.startTime >= cutoff));
  }, [sessions, timeframe]);

  const totalUsage = useMemo(
    () => filteredSessions.reduce((sum, s) => sum + Math.max(0, s.durationSeconds || 0), 0),
    [filteredSessions],
  );

  // Average over days that actually have activity (not empty calendar days)
  const avgDailyUsage = useMemo(() => {
    if (filteredSessions.length === 0) return 0;
    const days = new Set(
      filteredSessions.map(s => {
        const d = new Date(s.startTime);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      }),
    );
    return totalUsage / Math.max(1, days.size);
  }, [filteredSessions, totalUsage]);

  const categoryStats = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSessions.forEach(s => {
      const cat = s.category && s.category !== 'Other' ? s.category : guessCategory(s);
      map[cat] = (map[cat] || 0) + Math.max(0, s.durationSeconds || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredSessions]);

  const aggregatedApps = useMemo(
    () => consolidateSessionsByApp(filteredSessions),
    [filteredSessions],
  );

  const topApps = aggregatedApps.slice(0, 5);
  const bottomApps = useMemo(() => {
    const topPkgs = new Set(topApps.map(a => a.packageName));
    const rest = aggregatedApps.filter(
      a => !topPkgs.has(a.packageName) && a.durationSeconds >= 5,
    );
    // If everything is in top 5, show the shortest of the top set instead of clones
    const pool = rest.length > 0 ? rest : [...aggregatedApps].reverse();
    return pool.slice(-5).reverse().slice(0, 5);
  }, [aggregatedApps, topApps]);

  const hourlyStats = useMemo(() => {
    const hours = new Array(24).fill(0);
    filteredSessions.forEach(s => {
      const start = s.startTime;
      const end = Math.max(s.endTime || start, start);
      const duration = Math.max(0, s.durationSeconds || (end - start) / 1000);
      if (duration <= 0) return;
      // Split duration across hours proportionally (not all into start hour)
      let remaining = duration;
      let cursor = start;
      while (remaining > 0 && cursor < end) {
        const hourEnd = new Date(cursor);
        hourEnd.setMinutes(59, 59, 999);
        const sliceEnd = Math.min(end, hourEnd.getTime() + 1);
        const sliceSec = Math.max(0, (sliceEnd - cursor) / 1000);
        const take = Math.min(remaining, sliceSec || remaining);
        hours[new Date(cursor).getHours()] += take;
        remaining -= take;
        cursor = sliceEnd;
        if (sliceSec <= 0) break;
      }
    });
    return hours;
  }, [filteredSessions]);
  const maxHourly = Math.max(...hourlyStats, 1);
  const chartHeight = 100;

  const showLeastUsed = aggregatedApps.length >= 8;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.filterRow}>
        {(['DAILY', 'WEEKLY', 'MONTHLY'] as Timeframe[]).map(tf => (
          <TouchableOpacity
            key={tf}
            style={[styles.filterBtn, timeframe === tf && styles.filterBtnActive]}
            onPress={() => setTimeframe(tf)}>
            <Text style={[styles.filterText, timeframe === tf && styles.filterTextActive]}>
              {tf.charAt(0) + tf.slice(1).toLowerCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.overviewCards}>
        <View style={styles.overviewCard}>
          <Text style={styles.overviewTitle}>Total Usage</Text>
          <Text style={styles.overviewValue}>{formatDuration(totalUsage)}</Text>
        </View>
        <View style={styles.overviewCard}>
          <Text style={styles.overviewTitle}>Daily Average</Text>
          <Text style={styles.overviewValue}>{formatDuration(avgDailyUsage)}</Text>
          <Text style={styles.overviewHint}>Active days only</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hourly Usage</Text>
        {totalUsage === 0 ? (
          <Text style={styles.emptyInline}>No usage in this period.</Text>
        ) : (
          <View style={[styles.chartContainer, {height: chartHeight + 18}]}>
            {hourlyStats.map((val, index) => {
              const barH = Math.max(val > 0 ? 4 : 2, (val / maxHourly) * chartHeight);
              return (
                <View key={index} style={styles.barWrapper}>
                  <View style={[styles.bar, {height: barH}]} />
                  <Text style={styles.barLabel}>{index % 4 === 0 ? `${index}h` : ''}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Usage by Category</Text>
        {categoryStats.length === 0 ? (
          <Text style={styles.emptyInline}>No category data yet.</Text>
        ) : (
          categoryStats.map(([cat, duration]) => {
            const percentage = totalUsage > 0 ? (duration / totalUsage) * 100 : 0;
            return (
              <View key={cat} style={styles.categoryRow}>
                <View style={styles.categoryHeader}>
                  <Text style={styles.categoryName} numberOfLines={1}>
                    {cat}
                  </Text>
                  <Text style={styles.categoryDuration}>{formatDuration(duration)}</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, {width: `${Math.min(100, percentage)}%`}]} />
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Most Used Apps</Text>
        {topApps.length === 0 ? (
          <Text style={styles.emptyInline}>No apps in this period.</Text>
        ) : (
          topApps.map((app, index) => (
            <View key={app.packageName} style={styles.appRow}>
              <Text style={styles.appName} numberOfLines={1}>
                {index + 1}. {formatAppLabel(app.appName, app.packageName)}
              </Text>
              <Text style={styles.appDuration}>{formatDuration(app.durationSeconds)}</Text>
            </View>
          ))
        )}
      </View>

      {showLeastUsed ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Least Used Apps</Text>
          {bottomApps.map(app => (
            <View key={`least_${app.packageName}`} style={styles.appRow}>
              <Text style={styles.appName} numberOfLines={1}>
                {formatAppLabel(app.appName, app.packageName)}
              </Text>
              <Text style={styles.appDuration}>{formatDuration(app.durationSeconds)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function guessCategory(s: AppUsageSession): string {
  const n = `${s.appName || ''} ${s.packageName || ''}`.toLowerCase();
  if (/whatsapp|telegram|instagram|facebook|twitter|snapchat|discord|signal/.test(n)) {
    return 'Social';
  }
  if (/youtube|netflix|hotstar|prime|spotify|music|video/.test(n)) return 'Media';
  if (/chrome|firefox|brave|browser|safari/.test(n)) return 'Browser';
  if (/gmail|outlook|slack|teams|docs|office|notion|mail/.test(n)) return 'Productivity';
  if (/maps|uber|ola|rapido|navi/.test(n)) return 'Maps';
  if (/game|pubg|freefire|candy|clash/.test(n)) return 'Game';
  if (/camera|gallery|photos|image/.test(n)) return 'Image';
  return s.category || 'Other';
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.bg},
    scrollContent: {padding: 16, paddingBottom: 40},
    filterRow: {
      flexDirection: 'row',
      marginBottom: 16,
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 4,
    },
    filterBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 6,
    },
    filterBtnActive: {backgroundColor: colors.sky},
    filterText: {color: colors.textSecondary, fontWeight: '600', fontSize: 13},
    filterTextActive: {color: '#ffffff', fontWeight: 'bold'},
    overviewCards: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    overviewCard: {
      width: '48%',
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.skySoft,
    },
    overviewTitle: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 4,
      textTransform: 'uppercase',
    },
    overviewValue: {color: colors.sky, fontSize: 20, fontWeight: 'bold'},
    overviewHint: {color: colors.textMuted, fontSize: 10, marginTop: 4},
    section: {
      marginBottom: 20,
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    sectionTitle: {color: colors.textPrimary, fontSize: 18, fontWeight: 'bold', marginBottom: 16},
    emptyInline: {color: colors.textSecondary, fontSize: 13},
    chartContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    barWrapper: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-end',
      height: '100%',
    },
    bar: {
      width: '60%',
      backgroundColor: colors.sky,
      borderRadius: 2,
    },
    barLabel: {color: colors.textMuted, fontSize: 9, marginTop: 4, height: 14},
    categoryRow: {marginBottom: 12},
    categoryHeader: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4},
    categoryName: {color: colors.textBody, fontSize: 14, fontWeight: '500', flex: 1, paddingRight: 8},
    categoryDuration: {color: colors.sky, fontSize: 14, fontWeight: 'bold'},
    progressBarBg: {
      height: 8,
      backgroundColor: colors.borderSoft,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressBarFill: {height: '100%', backgroundColor: colors.sky, borderRadius: 4},
    appRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
    },
    appName: {color: colors.textBody, fontSize: 15, flex: 1, paddingRight: 8},
    appDuration: {color: colors.sky, fontSize: 15, fontWeight: '600'},
  });
}

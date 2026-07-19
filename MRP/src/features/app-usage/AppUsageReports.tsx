import React, {useState, useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {AppUsageSession} from './AppUsageScreen';
import {formatDuration} from './AppUsageUtils';
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

  // Filter Data
  const filteredSessions = useMemo(() => {
    const now = Date.now();
    const msInDay = 24 * 60 * 60 * 1000;

    let cutoff = 0;
    if (timeframe === 'DAILY') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      cutoff = today.getTime();
    } else if (timeframe === 'WEEKLY') {
      cutoff = now - (7 * msInDay);
    } else if (timeframe === 'MONTHLY') {
      cutoff = now - (30 * msInDay);
    }

    return sessions.filter(s => s.startTime >= cutoff);
  }, [sessions, timeframe]);

  // General Stats
  let totalUsage = 0;
  filteredSessions.forEach(s => totalUsage += s.durationSeconds);

  const daysInPeriod = timeframe === 'DAILY' ? 1 : (timeframe === 'WEEKLY' ? 7 : 30);
  const avgDailyUsage = totalUsage / daysInPeriod;

  // Group by category
  const categoryStats: Record<string, number> = {};
  filteredSessions.forEach(s => {
    const cat = s.category || 'Other';
    if (!categoryStats[cat]) categoryStats[cat] = 0;
    categoryStats[cat] += s.durationSeconds;
  });
  const sortedCategories = Object.entries(categoryStats).sort((a, b) => b[1] - a[1]);

  // Aggregate by app for Most/Least Used (not raw sessions)
  const aggregatedApps = useMemo(() => {
    const byPkg: Record<string, {appName: string; durationSeconds: number; startTime: number}> = {};
    filteredSessions.forEach(s => {
      if (!byPkg[s.packageName]) {
        byPkg[s.packageName] = {
          appName: s.appName,
          durationSeconds: 0,
          startTime: s.startTime,
        };
      }
      byPkg[s.packageName].durationSeconds += s.durationSeconds;
      if (s.startTime > byPkg[s.packageName].startTime) {
        byPkg[s.packageName].startTime = s.startTime;
      }
    });
    return Object.values(byPkg).sort((a, b) => b.durationSeconds - a.durationSeconds);
  }, [filteredSessions]);

  const topApps = aggregatedApps.slice(0, 5);
  const bottomApps = [...aggregatedApps].reverse().slice(0, 5);

  // Hourly Usage Array
  const hourlyStats = new Array(24).fill(0);
  filteredSessions.forEach(s => {
    const hour = new Date(s.startTime).getHours();
    hourlyStats[hour] += s.durationSeconds;
  });
  const maxHourly = Math.max(...hourlyStats, 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      
      {/* Timeframe Selector */}
      <View style={styles.filterRow}>
        {(['DAILY', 'WEEKLY', 'MONTHLY'] as Timeframe[]).map(tf => (
          <TouchableOpacity 
            key={tf}
            style={[styles.filterBtn, timeframe === tf && styles.filterBtnActive]}
            onPress={() => setTimeframe(tf)}
          >
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
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hourly Usage</Text>
        <View style={styles.chartContainer}>
          {hourlyStats.map((val, index) => {
            const h = (val / maxHourly) * 100;
            return (
              <View key={index} style={styles.barWrapper}>
                <View style={[styles.bar, {height: `${h}%`}]} />
                <Text style={styles.barLabel}>{index % 4 === 0 ? `${index}h` : ''}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Usage by Category</Text>
        {sortedCategories.map(([cat, duration]) => {
          const percentage = totalUsage > 0 ? (duration / totalUsage) * 100 : 0;
          return (
            <View key={cat} style={styles.categoryRow}>
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryName} numberOfLines={1}>{cat}</Text>
                <Text style={styles.categoryDuration}>{formatDuration(duration)}</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, {width: `${percentage}%`}]} />
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Most Used Apps</Text>
        {topApps.map((app, index) => (
          <View key={index} style={styles.appRow}>
            <Text style={styles.appName} numberOfLines={1}>{index + 1}. {app.appName}</Text>
            <Text style={styles.appDuration}>{formatDuration(app.durationSeconds)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Least Used Apps</Text>
        {bottomApps.map((app, index) => (
          <View key={index} style={styles.appRow}>
            <Text style={styles.appName} numberOfLines={1}>{app.appName}</Text>
            <Text style={styles.appDuration}>{formatDuration(app.durationSeconds)}</Text>
          </View>
        ))}
      </View>

    </ScrollView>
  );
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
    filterTextActive: {color: colors.bg, fontWeight: 'bold'},
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
    section: {
      marginBottom: 20,
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    sectionTitle: {color: colors.textPrimary, fontSize: 18, fontWeight: 'bold', marginBottom: 16},
    chartContainer: {
      flexDirection: 'row',
      height: 120,
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingTop: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    barWrapper: {
      flex: 1,
      alignItems: 'center',
      height: '100%',
      justifyContent: 'flex-end',
    },
    bar: {
      width: '60%',
      backgroundColor: colors.sky,
      borderRadius: 2,
      minHeight: 2,
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

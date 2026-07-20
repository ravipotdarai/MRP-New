import React, {useMemo, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {AppUsageSession, UnifiedEvent} from './AppUsageScreen';
import {aggregateAppStats, formatAppName, formatDuration, rankBatteryImpact} from './AppUsageUtils';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {ColorPalette} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

interface Props {
  sessions: AppUsageSession[];
  events: UnifiedEvent[];
  photos?: any[];
  mrpBattery?: any;
  onRefresh: () => void;
}

type ImpactPeriod = 'TODAY' | '7D';

export function AppUsageDashboard({sessions, events, photos, mrpBattery, onRefresh}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [impactPeriod, setImpactPeriod] = useState<ImpactPeriod>('TODAY');

  // Get Today's Start Time
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const weekStartMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // Deduplicate sessions by packageName + startTime to prevent duplicates
  const uniqueSessions = useMemo(() => {
    const seen = new Set<string>();
    const unique: AppUsageSession[] = [];
    sessions.forEach(s => {
      const key = `${s.packageName}_${s.startTime}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    });
    return unique;
  }, [sessions]);

  // Aggregate stats - ALL sessions (not filtered by date). Memoized to avoid
  // recomputing (and re-logging) on every render.
  // NOTE: on-demand usage sessions (UsageStatsManager.queryEvents) carry no
  // battery level, so we no longer compute an "average battery" — that value
  // was always 0 and misleading. Instead we surface "Apps Used Today".
  const {totalScreenTime, longestSession, appsUsedToday, todayDistance} = useMemo(() => {
    let totalScreenTime = 0;
    let longestSession = 0;
    const todayPackages = new Set<string>();

    uniqueSessions.forEach(s => {
      // Screen time for "today" only — sessions overlapping today
      if (s.endTime >= todayStartMs || s.startTime >= todayStartMs) {
        const overlapStart = Math.max(s.startTime, todayStartMs);
        const overlapEnd = s.endTime;
        if (overlapEnd > overlapStart) {
          totalScreenTime += (overlapEnd - overlapStart) / 1000;
        }
      }
      if (s.durationSeconds > longestSession) longestSession = s.durationSeconds;
      if (s.startTime >= todayStartMs) todayPackages.add(s.packageName);
    });

    const appsUsedToday = todayPackages.size;

    // Haversine Distance Calculator
    const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLon = (lon2 - lon1) * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const todayEvents = events.filter(e => e.timestamp >= todayStartMs);
    let todayDistance = 0;
    const locationEvents = todayEvents
      .filter(e => e.latitude != null && e.longitude != null)
      .sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 1; i < locationEvents.length; i++) {
      const prev = locationEvents[i - 1];
      const curr = locationEvents[i];
      todayDistance += getDistanceFromLatLonInKm(prev.latitude!, prev.longitude!, curr.latitude!, curr.longitude!);
    }

    return {totalScreenTime, longestSession, appsUsedToday, todayDistance};
  }, [sessions, events, todayStartMs]);

  const {sortedApps, mostUsedApp, currentApp} = useMemo(() => aggregateAppStats(sessions), [sessions]);

  const batteryImpact = useMemo(() => {
    const since = impactPeriod === 'TODAY' ? todayStartMs : weekStartMs;
    return rankBatteryImpact(sessions, since, 10);
  }, [sessions, impactPeriod, todayStartMs, weekStartMs]);

  const openSystemBattery = async () => {
    try {
      const ok = await (mrpmModule as any).openSystemBatteryUsage?.();
      if (!ok) {
        Alert.alert(
          'Could not open Battery',
          'Open Settings → Battery → Battery usage to see official power stats.',
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not open system Battery Usage');
    }
  };

  // Aggregate Events
  const todayEvents = events.filter(e => e.timestamp >= todayStartMs);
  const unlocksToday = todayEvents.filter(e => e.type === 'SCREEN_UNLOCK').length;
  // "Photos captured today" comes from the real photo list (file timestamps),
  // not from event.photoPath — timeline entries generally don't carry a photoPath.
  const photosToday = (photos || []).filter(p => {
    const ts = Number(p.timestamp) || Number(p.createdAt) || 0;
    return ts >= todayStartMs;
  }).length;
  const pendingSync = events.filter(e => e.syncStatus === 'PENDING').length;

  // Render Widget
  const renderWidget = (title: string, value: string, subtitle?: string) => (
    <View style={styles.widget}>
      <Text style={styles.widgetTitle}>{title}</Text>
      <Text style={styles.widgetValue}>{value}</Text>
      {subtitle && <Text style={styles.widgetSubtitle}>{subtitle}</Text>}
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.sky} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>App Usage Overview</Text>
      </View>

      {/* MRP screen time (foreground only — not energy) */}
      {mrpBattery && (
        <LinearGradient
          colors={[colors.emeraldSoft, colors.emeraldSoft]}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={styles.mrpBatteryCard}>
          <Text style={styles.mrpBatteryTitle}>MRP Screen Time</Text>
          <Text style={styles.mrpBatteryText}>{mrpBattery.batteryUsageText}</Text>
          <Text style={styles.mrpBatterySubtitle}>Foreground time · last 24 hours</Text>
        </LinearGradient>
      )}

      {/* Apps Used Today Card (replaces the old "Total Battery" card — on-demand
          usage sessions carry no battery level, so an average was always 0). */}
      <LinearGradient
        colors={[colors.skySoft, colors.skySoft]}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
        style={styles.totalBatteryCard}>
        <Text style={styles.totalBatteryTitle}>Apps Used Today</Text>
        <Text style={styles.totalBatteryText}>{appsUsedToday}</Text>
        <Text style={styles.totalBatterySubtitle}>Unique apps launched</Text>
      </LinearGradient>

      <View style={styles.grid}>
        {renderWidget("Screen Time", formatDuration(totalScreenTime), "Total today")}
        {renderWidget("Most Used", mostUsedApp ? formatAppName(mostUsedApp.appName) : "None", mostUsedApp ? formatDuration(mostUsedApp.duration) : "")}
        {renderWidget("Longest Session", formatDuration(longestSession), "Single sitting")}
        {renderWidget("Current App", currentApp ? formatAppName(currentApp.appName) : "None", currentApp ? formatDuration(currentApp.durationSeconds) : "Session")}
        {renderWidget("Unlocks", unlocksToday.toString(), "Today")}
        {renderWidget("Distance", `${todayDistance.toFixed(2)} km`, "Estimated today")}
        {renderWidget("Photos", photosToday.toString(), "Captured today")}
        {renderWidget("Pending Sync", pendingSync.toString(), "Events waiting")}
      </View>

      <View style={styles.section}>
        <View style={styles.impactHeader}>
          <Text style={[styles.sectionTitle, {marginBottom: 0}]}>Battery Impact</Text>
          <View style={styles.impactToggle}>
            {(['TODAY', '7D'] as ImpactPeriod[]).map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.impactChip, impactPeriod === p && styles.impactChipActive]}
                onPress={() => setImpactPeriod(p)}>
                <Text
                  style={[
                    styles.impactChipText,
                    impactPeriod === p && styles.impactChipTextActive,
                  ]}>
                  {p === 'TODAY' ? 'Today' : '7 days'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Text style={styles.impactDisclaimer}>
          Estimated from screen time share — not mAh. Open system Battery for official power
          use (including services).
        </Text>
        {batteryImpact.apps.length === 0 ? (
          <Text style={styles.impactEmpty}>No app usage in this period.</Text>
        ) : (
          <View style={styles.appList}>
            {batteryImpact.apps.map((app, index) => (
              <View key={app.packageName} style={styles.impactRow}>
                <View style={styles.appRank}>
                  <Text style={styles.appRankText}>{index + 1}</Text>
                </View>
                <View style={styles.impactInfo}>
                  <View style={styles.impactTop}>
                    <Text style={styles.appName} numberOfLines={1}>
                      {app.appName}
                    </Text>
                    <Text style={styles.impactPct}>{Math.round(app.impactPercent)}%</Text>
                  </View>
                  <Text style={styles.appStats}>{formatDuration(app.durationSeconds)}</Text>
                  <View style={styles.impactBarBg}>
                    <View
                      style={[
                        styles.impactBarFill,
                        {width: `${Math.min(100, app.impactPercent)}%`},
                      ]}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
        <TouchableOpacity style={styles.systemBatteryBtn} onPress={openSystemBattery}>
          <Text style={styles.systemBatteryBtnText}>Open system Battery Usage</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Most Used Apps</Text>
        <View style={styles.appList}>
          {sortedApps.slice(0, 5).map((app, index) => (
            <View key={app.packageName} style={styles.appItem}>
              <View style={styles.appRank}>
                <Text style={styles.appRankText}>{index + 1}</Text>
              </View>
              <View style={styles.appInfo}>
                <Text style={styles.appName}>{formatAppName(app.appName)}</Text>
                <Text style={styles.appStats}>{formatDuration(app.duration)}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dashboard Notes</Text>
        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            • Distance tracking requires continuous GPS polling which is currently battery-intensive. Only point-in-time locations are logged with events.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scrollContent: {
      padding: 16,
    },
    header: {
      marginBottom: 16,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: 'bold',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    widget: {
      backgroundColor: colors.surface,
      width: '48%',
      padding: 16,
      borderRadius: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    widgetTitle: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    widgetValue: {
      color: colors.sky,
      fontSize: 20,
      fontWeight: 'bold',
    },
    widgetSubtitle: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
    section: {
      marginTop: 16,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 12,
    },
    impactHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    impactToggle: {flexDirection: 'row', gap: 6},
    impactChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    impactChipActive: {
      backgroundColor: colors.amberSoft,
      borderColor: colors.amber,
    },
    impactChipText: {fontSize: 12, fontWeight: '600', color: colors.textSecondary},
    impactChipTextActive: {color: colors.amber},
    impactDisclaimer: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
      marginBottom: 12,
    },
    impactEmpty: {color: colors.textSecondary, fontSize: 13, marginBottom: 8},
    impactRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 14,
    },
    impactInfo: {flex: 1},
    impactTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    impactPct: {fontSize: 13, fontWeight: '800', color: colors.amber, marginLeft: 8},
    impactBarBg: {
      height: 6,
      backgroundColor: colors.borderSubtle,
      borderRadius: 3,
      marginTop: 6,
      overflow: 'hidden',
    },
    impactBarFill: {
      height: '100%',
      backgroundColor: colors.amber,
      borderRadius: 3,
    },
    systemBatteryBtn: {
      marginTop: 4,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    systemBatteryBtnText: {color: colors.sky, fontWeight: '700', fontSize: 14},
    mrpBatteryCard: {
      padding: 16,
      borderRadius: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.emeraldSoft,
      alignItems: 'center',
    },
    mrpBatteryTitle: {
      color: colors.emerald,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
    },
    mrpBatteryText: {
      color: colors.emerald,
      fontSize: 24,
      fontWeight: 'bold',
    },
    mrpBatterySubtitle: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 4,
    },
    totalBatteryCard: {
      padding: 16,
      borderRadius: 12,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.skySoft,
      alignItems: 'center',
    },
    totalBatteryTitle: {
      color: colors.sky,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
    },
    totalBatteryText: {
      color: colors.skyDark,
      fontSize: 28,
      fontWeight: 'bold',
    },
    totalBatterySubtitle: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 4,
    },
    appList: {
      gap: 8,
    },
    appItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      padding: 12,
      borderRadius: 10,
    },
    appRank: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    appRankText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: 'bold',
    },
    appInfo: {
      flex: 1,
    },
    appName: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    appStats: {
      color: colors.textMuted,
      fontSize: 12,
    },
    noteCard: {
      backgroundColor: colors.surfaceAlt,
      padding: 16,
      borderRadius: 8,
      borderLeftWidth: 3,
      borderLeftColor: colors.amber,
    },
    noteText: {
      color: colors.textBody,
      fontSize: 14,
      lineHeight: 20,
    },
  });
}

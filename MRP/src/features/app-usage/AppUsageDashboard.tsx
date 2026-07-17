import React from 'react';
import {View, Text, StyleSheet, ScrollView, RefreshControl} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {AppUsageSession, UnifiedEvent} from './AppUsageScreen';

interface Props {
  sessions: AppUsageSession[];
  events: UnifiedEvent[];
  mrpBattery?: any;
  onRefresh: () => void;
}

export function AppUsageDashboard({sessions, events, mrpBattery, onRefresh}: Props) {
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
  };

  console.log('[AppUsageDashboard] START - Sessions:', sessions.length, 'Events:', events.length, 'MRP Battery:', mrpBattery);

  // Get Today's Start Time
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  console.log('[AppUsageDashboard] Total sessions:', sessions.length);
  console.log('[AppUsageDashboard] Sessions:', sessions);

  // Aggregate stats - ALL sessions (not filtered by date)
  let totalScreenTime = 0;
  let longestSession = 0;
  const appStats: Record<string, {appName: string; duration: number; battery: number}> = {};

  sessions.forEach(s => {
    console.log('[AppUsageDashboard] Session:', s.appName, s.durationSeconds, 'startTime:', s.startTime);
    totalScreenTime += s.durationSeconds;
    if (s.durationSeconds > longestSession) longestSession = s.durationSeconds;

    if (!appStats[s.packageName]) {
      appStats[s.packageName] = {appName: s.appName, duration: 0, battery: 0};
    }
    appStats[s.packageName].duration += s.durationSeconds;
    if (s.batteryLevel) {
      appStats[s.packageName].battery += s.batteryLevel;
    }
  });

  console.log('[AppUsageDashboard] Total screen time:', totalScreenTime, 'Sorted apps:', Object.keys(appStats).length);

  const sortedApps = Object.entries(appStats)
    .map(([pkg, data]) => ({packageName: pkg, ...data}))
    .sort((a, b) => b.duration - a.duration);

  const mostUsedApp = sortedApps.length > 0 ? sortedApps[0] : null;
  const currentApp = sessions.length > 0 ? sessions[sessions.length - 1] : null;

  // Aggregate Events
  const todayEvents = events.filter(e => e.timestamp >= todayStartMs);
  const unlocksToday = todayEvents.filter(e => e.type === 'DEVICE_UNLOCK').length;
  const photosToday = todayEvents.filter(e => e.type === 'PHOTO_CAPTURED' || e.type === 'INTRUDER_SELFIE').length;
  const pendingSync = events.filter(e => e.syncStatus === 'PENDING').length;

  // Calculate total battery usage from all apps
  const totalBattery = Object.values(appStats).reduce((sum, app) => sum + app.battery, 0);
  const avgBattery = totalBattery > 0 ? Math.round(totalBattery / sessions.length) : 0;

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

  let todayDistance = 0;
  const locationEvents = todayEvents
    .filter(e => e.latitude != null && e.longitude != null)
    .sort((a, b) => a.timestamp - b.timestamp);

  for (let i = 1; i < locationEvents.length; i++) {
    const prev = locationEvents[i - 1] as any;
    const curr = locationEvents[i] as any;
    todayDistance += getDistanceFromLatLonInKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
  }

  // Render Widget
  const formatAppName = (name: string) => {
    if (!name) return 'Unknown';
    if (name.includes('.')) {
      const parts = name.split('.');
      let lastPart = parts[parts.length - 1];
      if (lastPart.length < 3 && parts.length > 1) {
        lastPart = parts[parts.length - 2];
      }
      return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
    }
    return name;
  };

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
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#38bdf8" />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>App Usage Overview</Text>
      </View>

      {/* MRP Battery Card */}
      {mrpBattery && (
        <LinearGradient
          colors={['rgba(16, 185, 129, 0.15)', 'rgba(5, 150, 105, 0.1)']}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 1}}
          style={styles.mrpBatteryCard}>
          <Text style={styles.mrpBatteryTitle}>MRP Battery Usage</Text>
          <Text style={styles.mrpBatteryText}>{mrpBattery.batteryUsageText}</Text>
          <Text style={styles.mrpBatterySubtitle}>During last 24 hours</Text>
        </LinearGradient>
      )}

      {/* Total Battery Card */}
      <LinearGradient
        colors={['rgba(59, 130, 246, 0.15)', 'rgba(37, 99, 235, 0.1)']}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}
        style={styles.totalBatteryCard}>
        <Text style={styles.totalBatteryTitle}>Total Battery</Text>
        <Text style={styles.totalBatteryText}>{avgBattery}%</Text>
        <Text style={styles.totalBatterySubtitle}>Average last 24 hours</Text>
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
        <Text style={styles.sectionTitle}>Most Used Apps (Battery)</Text>
        <View style={styles.appList}>
          {sortedApps.slice(0, 5).map((app, index) => (
            <View key={app.packageName} style={styles.appItem}>
              <View style={styles.appRank}>
                <Text style={styles.appRankText}>{index + 1}</Text>
              </View>
              <View style={styles.appInfo}>
                <Text style={styles.appName}>{formatAppName(app.appName)}</Text>
                <Text style={styles.appStats}>{formatDuration(app.duration)} • {app.battery}%</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  widget: {
    backgroundColor: '#1e293b',
    width: '48%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  widgetTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  widgetValue: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: 'bold',
  },
  widgetSubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  mrpBatteryCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    alignItems: 'center',
  },
  mrpBatteryTitle: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  mrpBatteryText: {
    color: '#6ee7b7',
    fontSize: 24,
    fontWeight: 'bold',
  },
  mrpBatterySubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  totalBatteryCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    alignItems: 'center',
  },
  totalBatteryTitle: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  totalBatteryText: {
    color: '#60a5fa',
    fontSize: 28,
    fontWeight: 'bold',
  },
  totalBatterySubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  appList: {
    gap: 8,
  },
  appItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 10,
  },
  appRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  appRankText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  appInfo: {
    flex: 1,
  },
  appName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  appStats: {
    color: '#64748b',
    fontSize: 12,
  },
  noteCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  noteText: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 20,
  },
});

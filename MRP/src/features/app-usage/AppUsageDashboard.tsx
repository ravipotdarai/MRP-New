import React from 'react';
import {View, Text, StyleSheet, ScrollView, RefreshControl} from 'react-native';
import {AppUsageSession, UnifiedEvent} from './AppUsageScreen';

interface Props {
  sessions: AppUsageSession[];
  events: UnifiedEvent[];
  onRefresh: () => void;
}

export function AppUsageDashboard({sessions, events, onRefresh}: Props) {
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
  };

  // Get Today's Start Time
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  // Aggregate stats
  let totalScreenTime = 0;
  let longestSession = 0;
  const appStats: Record<string, {appName: string; duration: number}> = {};

  sessions.forEach(s => {
    if (s.startTime >= todayStartMs) {
      totalScreenTime += s.durationSeconds;
      if (s.durationSeconds > longestSession) longestSession = s.durationSeconds;

      if (!appStats[s.packageName]) {
        appStats[s.packageName] = {appName: s.appName, duration: 0};
      }
      appStats[s.packageName].duration += s.durationSeconds;
    }
  });

  const sortedApps = Object.values(appStats).sort((a, b) => b.duration - a.duration);
  const mostUsedApp = sortedApps.length > 0 ? sortedApps[0] : null;

  const currentApp = sessions.length > 0 ? sessions[sessions.length - 1] : null;

  // Aggregate Events
  const todayEvents = events.filter(e => e.timestamp >= todayStartMs);
  const unlocksToday = todayEvents.filter(e => e.type === 'DEVICE_UNLOCK').length;
  const photosToday = todayEvents.filter(e => e.type === 'PHOTO_CAPTURED' || e.type === 'INTRUDER_SELFIE').length;
  const pendingSync = events.filter(e => e.syncStatus === 'PENDING').length;

  // Haversine Distance Calculator
  const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    return R * c; // Distance in km
  };

  let todayDistance = 0;
  // Sort today's events chronologically to calculate distance
  const locationEvents = todayEvents
    // @ts-ignore
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
        <Text style={styles.headerTitle}>Today's Overview</Text>
      </View>

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

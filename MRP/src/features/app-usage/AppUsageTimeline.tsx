import React from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {AppUsageSession, UnifiedEvent} from './AppUsageScreen';

interface Props {
  sessions: AppUsageSession[];
  events: UnifiedEvent[];
}

type TimelineItem = 
  | { type: 'SESSION', data: AppUsageSession, timestamp: number }
  | { type: 'EVENT', data: UnifiedEvent, timestamp: number };

export function AppUsageTimeline({sessions, events}: Props) {
  // Merge and sort
  const items: TimelineItem[] = [
    ...sessions.map(s => ({type: 'SESSION' as const, data: s, timestamp: s.startTime})),
    ...events.map(e => ({type: 'EVENT' as const, data: e, timestamp: e.timestamp}))
  ].sort((a, b) => b.timestamp - a.timestamp); // newest first

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs}h ${mins % 60}m`;
    return `${mins}m`;
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'DEVICE_UNLOCK': return '🔓';
      case 'DEVICE_LOCK': return '🔒';
      case 'PHOTO_CAPTURED': return '📸';
      case 'WIFI_CONNECTED': return '📶';
      case 'WIFI_DISCONNECTED': return '📵';
      default: return '⚡';
    }
  };

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Interleaved Timeline</Text>
      
      <View style={styles.timeline}>
        {items.map((item, index) => {
          if (item.type === 'SESSION') {
            const s = item.data;
            return (
              <View key={`s_${s.startTime}_${index}`} style={styles.timelineItem}>
                <View style={styles.timeColumn}>
                  <Text style={styles.timeText}>{formatTime(s.startTime)}</Text>
                </View>
                <View style={styles.lineColumn}>
                  <View style={[styles.dot, {backgroundColor: '#3b82f6'}]} />
                  {index < items.length - 1 && <View style={styles.line} />}
                </View>
                <View style={styles.contentColumn}>
                  <View style={styles.sessionCard}>
                    <Text style={styles.sessionName}>📱 {formatAppName(s.appName)}</Text>
                    <Text style={styles.sessionDuration}>{formatDuration(s.durationSeconds)}</Text>
                  </View>
                </View>
              </View>
            );
          } else {
            const e = item.data;
            return (
              <View key={`e_${e.id}_${index}`} style={styles.timelineItem}>
                <View style={styles.timeColumn}>
                  <Text style={styles.timeText}>{formatTime(e.timestamp)}</Text>
                </View>
                <View style={styles.lineColumn}>
                  <View style={[styles.dot, {backgroundColor: '#f59e0b'}]} />
                  {index < items.length - 1 && <View style={styles.line} />}
                </View>
                <View style={styles.contentColumn}>
                  <View style={styles.eventCard}>
                    <Text style={styles.eventName}>{getEventIcon(e.type)} {e.type.replace(/_/g, ' ')}</Text>
                    {e.description && <Text style={styles.eventDesc}>{e.description}</Text>}
                  </View>
                </View>
              </View>
            );
          }
        })}
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
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  timeline: {
    flexDirection: 'column',
  },
  timelineItem: {
    flexDirection: 'row',
  },
  timeColumn: {
    width: 60,
    alignItems: 'flex-end',
    paddingRight: 12,
    paddingTop: 2,
  },
  timeText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  lineColumn: {
    width: 20,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
    zIndex: 10,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: -8,
    marginBottom: -4,
  },
  contentColumn: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 24,
  },
  sessionCard: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  sessionName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  sessionDuration: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  eventCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  eventName: {
    color: '#fbbf24',
    fontSize: 14,
    fontWeight: 'bold',
  },
  eventDesc: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
});

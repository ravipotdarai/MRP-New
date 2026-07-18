import React, {useMemo} from 'react';
import {View, Text, StyleSheet, FlatList} from 'react-native';
import {AppUsageSession, UnifiedEvent} from './AppUsageScreen';
import {formatAppName, formatDuration} from './AppUsageUtils';

interface Props {
  sessions: AppUsageSession[];
  events: UnifiedEvent[];
}

type TimelineItem =
  | {type: 'SESSION'; data: AppUsageSession; timestamp: number}
  | {type: 'EVENT'; data: UnifiedEvent; timestamp: number};

// Cap the number of items rendered to keep the JS thread responsive.
const MAX_ITEMS = 200;

export function AppUsageTimeline({sessions, events}: Props) {
  // Deduplicate sessions by packageName + startTime
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

  // Merge and sort (newest first), capped to MAX_ITEMS
  const items: TimelineItem[] = useMemo(() => {
    const merged: TimelineItem[] = [
      ...uniqueSessions.map(s => ({type: 'SESSION' as const, data: s, timestamp: s.startTime})),
      ...events.map(e => ({type: 'EVENT' as const, data: e, timestamp: e.timestamp})),
    ].sort((a, b) => b.timestamp - a.timestamp);
    return merged.slice(0, MAX_ITEMS);
  }, [uniqueSessions, events]);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'DEVICE_UNLOCK':
        return '🔓';
      case 'DEVICE_LOCK':
        return '🔒';
      case 'PHOTO_CAPTURED':
        return '📸';
      case 'WIFI_CONNECTED':
        return '📶';
      case 'WIFI_DISCONNECTED':
        return '📵';
      default:
        return '⚡';
    }
  };

  const renderItem = ({item, index}: {item: TimelineItem; index: number}) => {
    const isLast = index === items.length - 1;
    if (item.type === 'SESSION') {
      const s = item.data;
      return (
        <View key={`s_${s.startTime}_${index}`} style={styles.timelineItem}>
          <View style={styles.timeColumn}>
            <Text style={styles.timeText}>{formatTime(s.startTime)}</Text>
          </View>
          <View style={styles.lineColumn}>
            <View style={[styles.dot, {backgroundColor: '#3b82f6'}]} />
            {!isLast && <View style={styles.line} />}
          </View>
          <View style={styles.contentColumn}>
            <View style={styles.sessionCard}>
              <Text style={styles.sessionName} numberOfLines={1}>📱 {formatAppName(s.appName)}</Text>
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
            {!isLast && <View style={styles.line} />}
          </View>
          <View style={styles.contentColumn}>
            <View style={styles.eventCard}>
              <Text style={styles.eventName}>{getEventIcon(e.type)} {e.type ? e.type.replace(/_/g, ' ') : 'Event'}</Text>
              {e.description ? <Text style={styles.eventDesc}>{e.description}</Text> : null}
            </View>
          </View>
        </View>
      );
    }
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      data={items}
      keyExtractor={(item, index) =>
        item.type === 'SESSION'
          ? `s_${(item.data as AppUsageSession).startTime}_${index}`
          : `e_${(item.data as UnifiedEvent).id}_${index}`
      }
      renderItem={renderItem}
      ListHeaderComponent={
        <Text style={styles.title}>
          Interleaved Timeline{items.length >= MAX_ITEMS ? ` (showing latest ${MAX_ITEMS})` : ''}
        </Text>
      }
      ListEmptyComponent={
        <Text style={styles.emptyText}>No activity recorded yet.</Text>
      }
      initialNumToRender={20}
      maxToRenderPerBatch={20}
      windowSize={7}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
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
    flex: 1,
    paddingRight: 8,
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

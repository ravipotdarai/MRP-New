import React, {useMemo} from 'react';
import {View, Text, StyleSheet, FlatList} from 'react-native';
import {AppUsageSession, UnifiedEvent} from './AppUsageScreen';
import {
  formatAppLabel,
  formatDuration,
  mergeOverlappingSessions,
} from './AppUsageUtils';
import {ColorPalette} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

interface Props {
  sessions: AppUsageSession[];
  events: UnifiedEvent[];
}

type TimelineItem =
  | {type: 'SESSION'; data: AppUsageSession; timestamp: number}
  | {type: 'EVENT'; data: UnifiedEvent; timestamp: number};

const MAX_ITEMS = 200;

/**
 * Chronological interleaved timeline (recent apps + security events),
 * with overlapping/duplicate app sessions merged so the same app
 * does not appear as repeated rows for one continuous use.
 */
export function AppUsageTimeline({sessions, events}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Group duplicate / overlapping sessions per package before listing
  const uniqueSessions = useMemo(
    () => mergeOverlappingSessions(sessions),
    [sessions],
  );

  const items: TimelineItem[] = useMemo(() => {
    const seenEvents = new Set<string>();
    const uniqueEvents = events.filter(e => {
      const key = e.id || `${e.type}_${e.timestamp}`;
      if (seenEvents.has(key)) return false;
      seenEvents.add(key);
      return true;
    });

    const merged: TimelineItem[] = [
      ...uniqueSessions.map(s => ({
        type: 'SESSION' as const,
        data: s,
        timestamp: s.startTime,
      })),
      ...uniqueEvents.map(e => ({
        type: 'EVENT' as const,
        data: e,
        timestamp: e.timestamp,
      })),
    ].sort((a, b) => b.timestamp - a.timestamp);

    return merged.slice(0, MAX_ITEMS);
  }, [uniqueSessions, events]);

  const formatTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '--:--';
    }
  };

  const formatDay = (ts: number, prevTs?: number) => {
    try {
      const d = new Date(ts);
      if (prevTs != null) {
        const p = new Date(prevTs);
        if (
          d.getFullYear() === p.getFullYear() &&
          d.getMonth() === p.getMonth() &&
          d.getDate() === p.getDate()
        ) {
          return null;
        }
      }
      const today = new Date();
      if (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      ) {
        return 'Today';
      }
      return d.toLocaleDateString([], {month: 'short', day: 'numeric'});
    } catch {
      return null;
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'SCREEN_UNLOCK':
        return '🔓';
      case 'SCREEN_LOCK':
        return '🔒';
      case 'WRONG_PASSWORD':
        return '🚨';
      case 'WRONG_BIOMETRIC':
        return '👆';
      case 'UNLOCK_FAILED':
        return '⚠️';
      case 'SIM_REMOVED':
      case 'SIM_INSERTED':
        return '📱';
      case 'FACTORY_RESET':
        return '💣';
      case 'AIRPLANE_MODE_TOGGLE':
        return '✈️';
      case 'WIFI_TOGGLE':
        return '📶';
      case 'MOBILE_DATA_TOGGLE':
        return '📡';
      case 'HOTSPOT_TOGGLE':
        return '🔥';
      case 'USB_CONNECTED':
        return '💻';
      case 'DEVICE_BOOT':
        return '🔄';
      case 'APP_INSTALLED':
      case 'APP_UPDATED':
        return '📦';
      case 'APP_MISUSE':
        return '📵';
      case 'POSTURE_ALERT':
        return '🛡️';
      default:
        return '⚡';
    }
  };

  const renderItem = ({item, index}: {item: TimelineItem; index: number}) => {
    const isLast = index === items.length - 1;
    const prevTs = index > 0 ? items[index - 1].timestamp : undefined;
    const dayLabel = formatDay(item.timestamp, prevTs);

    const timeRail = (ts: number) => (
      <View style={styles.timeColumn}>
        {dayLabel ? <Text style={styles.dayText}>{dayLabel}</Text> : null}
        <Text style={styles.timeText} numberOfLines={1}>
          {formatTime(ts)}
        </Text>
      </View>
    );

    if (item.type === 'SESSION') {
      const s = item.data;
      return (
        <View style={styles.timelineItem}>
          {timeRail(s.startTime)}
          <View style={styles.lineColumn}>
            <View style={[styles.dot, {backgroundColor: colors.sky}]} />
            {!isLast && <View style={styles.line} />}
          </View>
          <View style={styles.contentColumn}>
            <View style={styles.sessionCard}>
              <Text style={styles.sessionName} numberOfLines={1}>
                📱 {formatAppLabel(s.appName, s.packageName)}
              </Text>
              <Text style={styles.sessionDuration}>
                {formatDuration(s.durationSeconds)}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    const e = item.data;
    return (
      <View style={styles.timelineItem}>
        {timeRail(e.timestamp)}
        <View style={styles.lineColumn}>
          <View style={[styles.dot, {backgroundColor: colors.amber}]} />
          {!isLast && <View style={styles.line} />}
        </View>
        <View style={styles.contentColumn}>
          <View style={styles.eventCard}>
            <Text style={styles.eventName}>
              {getEventIcon(e.type)} {e.type ? e.type.replace(/_/g, ' ') : 'Event'}
            </Text>
            {e.description ? <Text style={styles.eventDesc}>{e.description}</Text> : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      data={items}
      keyExtractor={(item, index) =>
        item.type === 'SESSION'
          ? `s_${(item.data as AppUsageSession).packageName}_${(item.data as AppUsageSession).startTime}_${(item.data as AppUsageSession).endTime}`
          : `e_${(item.data as UnifiedEvent).id || (item.data as UnifiedEvent).timestamp}_${index}`
      }
      renderItem={renderItem}
      ListHeaderComponent={
        <Text style={styles.title}>
          Interleaved Timeline
          {items.length >= MAX_ITEMS ? ` (showing latest ${MAX_ITEMS})` : ''}
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

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 20,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: 'center',
      marginTop: 40,
    },
    timelineItem: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    timeColumn: {
      width: 78,
      alignItems: 'flex-start',
      paddingRight: 8,
      paddingTop: 2,
    },
    dayText: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
      marginBottom: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    timeText: {
      color: colors.sky,
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    lineColumn: {
      width: 18,
      alignItems: 'center',
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginTop: 6,
      zIndex: 10,
    },
    line: {
      width: 2,
      flex: 1,
      backgroundColor: colors.borderSoft,
      marginTop: -6,
      marginBottom: -4,
    },
    contentColumn: {
      flex: 1,
      paddingLeft: 10,
      paddingBottom: 20,
      minWidth: 0,
    },
    sessionCard: {
      backgroundColor: colors.surface,
      padding: 12,
      borderRadius: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.skySoft,
    },
    sessionName: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '500',
      flex: 1,
      paddingRight: 8,
    },
    sessionDuration: {
      color: colors.sky,
      fontSize: 14,
      fontWeight: 'bold',
    },
    eventCard: {
      backgroundColor: colors.amberSoft,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.amberSoft,
    },
    eventName: {
      color: colors.amber,
      fontSize: 14,
      fontWeight: 'bold',
    },
    eventDesc: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 4,
    },
  });
}

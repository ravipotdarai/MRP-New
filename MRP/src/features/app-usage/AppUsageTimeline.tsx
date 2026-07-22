import React, {useMemo} from 'react';
import {View, Text, StyleSheet, FlatList} from 'react-native';
import {AppUsageSession} from './AppUsageScreen';
import {
  formatAppLabel,
  formatDuration,
  mergeOverlappingSessions,
} from './AppUsageUtils';
import {ColorPalette} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';

interface Props {
  sessions: AppUsageSession[];
  /** Kept for call-site compatibility; security events are not shown here. */
  events?: unknown[];
}

const MAX_ITEMS = 200;

/**
 * App-only chronological timeline (no security / monitoring events).
 * Overlapping sessions for the same package are merged.
 */
export function AppUsageTimeline({sessions}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const items = useMemo(() => {
    const merged = mergeOverlappingSessions(sessions)
      .slice()
      .sort((a, b) => b.startTime - a.startTime);
    return merged.slice(0, MAX_ITEMS);
  }, [sessions]);

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

  const renderItem = ({item, index}: {item: AppUsageSession; index: number}) => {
    const isLast = index === items.length - 1;
    const prevTs = index > 0 ? items[index - 1].startTime : undefined;
    const dayLabel = formatDay(item.startTime, prevTs);

    return (
      <View style={styles.timelineItem}>
        <View style={styles.timeColumn}>
          {dayLabel ? <Text style={styles.dayText}>{dayLabel}</Text> : null}
          <Text style={styles.timeText} numberOfLines={1}>
            {formatTime(item.startTime)}
          </Text>
        </View>
        <View style={styles.lineColumn}>
          <View style={[styles.dot, {backgroundColor: colors.sky}]} />
          {!isLast && <View style={styles.line} />}
        </View>
        <View style={styles.contentColumn}>
          <View style={styles.sessionCard}>
            <Text style={styles.sessionName} numberOfLines={1}>
              {formatAppLabel(item.appName, item.packageName)}
            </Text>
            <Text style={styles.sessionDuration}>
              {formatDuration(item.durationSeconds)}
            </Text>
            {item.category && item.category !== 'Other' ? (
              <Text style={styles.sessionMeta} numberOfLines={1}>
                {item.category}
              </Text>
            ) : null}
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
        `s_${item.packageName}_${item.startTime}_${item.endTime}_${index}`
      }
      renderItem={renderItem}
      ListHeaderComponent={
        <Text style={styles.title}>
          App Timeline
          {items.length >= MAX_ITEMS ? ` (showing latest ${MAX_ITEMS})` : ''}
        </Text>
      }
      ListEmptyComponent={
        <Text style={styles.emptyText}>No app usage recorded yet.</Text>
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
    },
    timelineItem: {
      flexDirection: 'row',
      minHeight: 56,
    },
    timeColumn: {
      width: 64,
      paddingTop: 2,
      paddingRight: 8,
    },
    dayText: {
      color: colors.sky,
      fontSize: 10,
      fontWeight: '700',
      marginBottom: 2,
    },
    timeText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    lineColumn: {
      width: 16,
      alignItems: 'center',
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginTop: 4,
    },
    line: {
      flex: 1,
      width: 2,
      backgroundColor: colors.borderSoft,
      marginTop: 4,
    },
    contentColumn: {
      flex: 1,
      paddingBottom: 14,
      paddingLeft: 8,
    },
    sessionCard: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    sessionName: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: '700',
    },
    sessionDuration: {
      color: colors.sky,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 4,
    },
    sessionMeta: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
  });
}

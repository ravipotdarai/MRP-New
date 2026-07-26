import React, {useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Animated,
  PanResponder,
  type GestureResponderEvent,
} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {LiveMapPoint, buildCircleMapUris, pinStyle} from './circleMapUrls';

type Props = {
  points: LiveMapPoint[];
  title?: string;
};

function touchDistance(e: GestureResponderEvent): number | null {
  const touches = e.nativeEvent.touches;
  if (!touches || touches.length < 2) return null;
  const a = touches[0];
  const b = touches[1];
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Static map with pinch-to-zoom (P7-3) + open in OSM. */
export function CircleLiveMap({points, title = 'Live map'}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const uris = useMemo(() => buildCircleMapUris(points), [points]);
  const [uriIndex, setUriIndex] = useState(0);
  const uri = uris[uriIndex] ?? null;

  const scale = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);
  const startDist = useRef(0);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: e => (e.nativeEvent.touches?.length || 0) >= 2,
      onPanResponderGrant: e => {
        startDist.current = touchDistance(e) || 0;
      },
      onPanResponderMove: e => {
        const d = touchDistance(e);
        if (!d || !startDist.current) return;
        const next = Math.min(3, Math.max(1, lastScale.current * (d / startDist.current)));
        scale.setValue(next);
      },
      onPanResponderRelease: () => {
        scale.stopAnimation(v => {
          lastScale.current = Math.min(3, Math.max(1, v));
          Animated.spring(scale, {
            toValue: lastScale.current,
            useNativeDriver: true,
            friction: 7,
          }).start();
        });
      },
    }),
  ).current;

  if (points.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          No live points yet. Turn Share ON after mutual consent (requires Google Sign-In + Firebase
          RTDB).
        </Text>
      </View>
    );
  }

  const openMaps = () => {
    const p = points[0];
    Linking.openURL(
      `https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=15/${p.latitude}/${p.longitude}`,
    ).catch(() => {});
  };

  const resetZoom = () => {
    lastScale.current = 1;
    Animated.spring(scale, {toValue: 1, useNativeDriver: true, friction: 7}).start();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.hint}>Pinch zoom · long-press reset</Text>
      </View>
      {uri ? (
        <View style={styles.mapClip} {...pan.panHandlers}>
          <TouchableOpacity activeOpacity={0.95} onPress={openMaps} onLongPress={resetZoom}>
            <Animated.View style={{transform: [{scale}]}}>
              <Image
                source={{uri}}
                style={styles.map}
                resizeMode="cover"
                onError={() => {
                  if (uriIndex + 1 < uris.length) setUriIndex(uriIndex + 1);
                }}
              />
            </Animated.View>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.legend}>
        {points.map(p => {
          const style = pinStyle(p.colorIndex);
          return (
            <View key={p.id} style={styles.legendRow}>
              <View style={[styles.dot, {backgroundColor: style.hex}]} />
              <Text style={styles.legendText} numberOfLines={1}>
                {p.displayName}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {marginBottom: spacing.md},
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    title: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    hint: {fontSize: 11, color: colors.textMuted},
    mapClip: {
      width: '100%',
      height: 200,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    map: {
      width: '100%',
      height: 200,
    },
    legend: {marginTop: spacing.sm, gap: 6},
    legendRow: {flexDirection: 'row', alignItems: 'center'},
    dot: {width: 10, height: 10, borderRadius: 5, marginRight: 8},
    legendText: {fontSize: 13, color: colors.textBody, flex: 1},
    empty: {
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: spacing.md,
    },
    emptyText: {fontSize: 13, color: colors.textMuted, lineHeight: 18},
  });
}

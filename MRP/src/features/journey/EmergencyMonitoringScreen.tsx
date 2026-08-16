import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {useFocusEffect} from '@react-navigation/native';
import {TravelDayMap} from './TravelDayMap';

type Props = {onUpgrade?: () => void};

type TrailPoint = {
  latitude: number;
  longitude: number;
  t: number;
  label?: string;
  speed?: number;
  motion?: string;
};

const PLAYBACK_SPEEDS = [0.5, 1, 2, 4, 8, 16] as const;
type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coordsOf(e: any): {latitude: number; longitude: number} | null {
  const lat = asNum(e?.location?.latitude) ?? asNum(e?.latitude) ?? asNum(e?.lat);
  const lng = asNum(e?.location?.longitude) ?? asNum(e?.longitude) ?? asNum(e?.lng);
  if (lat == null || lng == null) return null;
  if (lat === 0 && lng === 0) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {latitude: lat, longitude: lng};
}

function haversineKm(
  a: {latitude: number; longitude: number},
  b: {latitude: number; longitude: number},
): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function loadTrailDays(): Promise<string[]> {
  const bridge = mrpmModule as any;
  if (typeof bridge.getGpsTrailDays === 'function') {
    const days = await bridge.getGpsTrailDays();
    if (Array.isArray(days) && days.length) return days;
  }
  const timeline = await bridge.getTimeline?.();
  const rows = Array.isArray(timeline) ? timeline : [];
  const set = new Set<string>();
  for (const e of rows) {
    const c = coordsOf(e);
    if (!c) continue;
    const t = Date.parse(e.timestamp) || Number(e.timestamp) || 0;
    if (t) set.add(dayKey(t));
  }
  return [...set].sort().reverse();
}

async function loadPointsForDay(day: string): Promise<{points: TrailPoint[]; dense: boolean}> {
  const bridge = mrpmModule as any;
  const pts: TrailPoint[] = [];
  let dense = false;

  if (typeof bridge.getGpsTrailForDay === 'function') {
    const trail = await bridge.getGpsTrailForDay(day);
    if (Array.isArray(trail) && trail.length) {
      dense = true;
      for (const p of trail) {
        const lat = asNum(p.latitude);
        const lng = asNum(p.longitude);
        const t = asNum(p.t) ?? 0;
        if (lat == null || lng == null) continue;
        if (!lat && !lng) continue;
        pts.push({
          latitude: lat,
          longitude: lng,
          t,
          speed: asNum(p.speed) ?? undefined,
          motion: p.motion,
          label: 'GPS',
        });
      }
    }
  }

  if (pts.length < 2) {
    const timeline = await bridge.getTimeline?.();
    const rows = Array.isArray(timeline) ? timeline : [];
    for (const e of rows) {
      const c = coordsOf(e);
      if (!c) continue;
      const t = Date.parse(e.timestamp) || Number(e.timestamp) || 0;
      if (dayKey(t) !== day) continue;
      pts.push({
        latitude: c.latitude,
        longitude: c.longitude,
        t,
        label: String(e.event_type || e.eventType || 'EVENT'),
      });
    }
  }

  pts.sort((a, b) => a.t - b.t);
  const deduped: TrailPoint[] = [];
  for (const p of pts) {
    const last = deduped[deduped.length - 1];
    if (last && last.t === p.t && last.latitude === p.latitude && last.longitude === p.longitude) {
      continue;
    }
    deduped.push(p);
  }

  if (!deduped.length && day === dayKey(Date.now()) && typeof bridge.getCurrentLocationWithAddress === 'function') {
    try {
      const loc = await bridge.getCurrentLocationWithAddress(false);
      const lat = asNum(loc?.latitude);
      const lng = asNum(loc?.longitude);
      if (lat != null && lng != null && (lat || lng)) {
        deduped.push({
          latitude: lat,
          longitude: lng,
          t: Date.now(),
          label: 'Last fix',
        });
      }
    } catch {
      // ignore
    }
  }

  return {points: deduped, dense};
}

export function EmergencyMonitoringScreen({onUpgrade: _onUpgrade}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [points, setPoints] = useState<TrailPoint[]>([]);
  const [dense, setDense] = useState(false);
  const [playIdx, setPlayIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [scrubW, setScrubW] = useState(1);

  const refresh = useCallback(async (pickDay?: string | null) => {
    setLoading(true);
    setPlaying(false);
    try {
      const today = dayKey(Date.now());
      const keys = await loadTrailDays();
      const ordered = keys.includes(today) ? keys : [today, ...keys];
      setDays(ordered);
      const pick =
        pickDay && ordered.includes(pickDay)
          ? pickDay
          : ordered.includes(today)
            ? today
            : ordered[0] || today;
      setSelected(pick);
      const {points: pts, dense: isDense} = await loadPointsForDay(pick);
      setPoints(pts);
      setDense(isDense);
      setPlayIdx(0);
    } catch {
      const today = dayKey(Date.now());
      setDays([today]);
      setSelected(today);
      setPoints([]);
      setDense(false);
      setPlayIdx(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!playing || points.length < 2) return;
    const stepMs = Math.max(40, Math.round(350 / speed));
    const id = setInterval(() => {
      setPlayIdx(i => {
        if (i >= points.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, stepMs);
    return () => clearInterval(id);
  }, [playing, points.length, speed]);

  const seekFromX = (x: number) => {
    if (points.length < 2) return;
    const pct = Math.min(1, Math.max(0, x / Math.max(1, scrubW)));
    setPlaying(false);
    setPlayIdx(Math.round(pct * (points.length - 1)));
  };

  if (loading) {
    return (
      <View style={[styles.wrap, styles.center]}>
        <ActivityIndicator color={colors.sky} />
        <Text style={styles.muted}>Loading travel…</Text>
      </View>
    );
  }

  const lastIdx = Math.max(0, points.length - 1);
  const head = points[Math.min(playIdx, lastIdx)];
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    dist += haversineKm(points[i - 1], points[i]);
  }
  const canPlay = points.length >= 2;
  const progress = lastIdx > 0 ? playIdx / lastIdx : 0;

  const onPlay = () => {
    if (!canPlay) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (playIdx >= lastIdx) {
      setPlayIdx(0);
    }
    setPlaying(true);
  };

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Text style={styles.lead}>
          {points.length
            ? 'Pinch or use + / − to zoom. Orange line is the travelled path; red marker follows Play.'
            : 'No GPS yet for this day. Keep monitoring on while you move.'}
        </Text>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.dayRow}>
          {days.length === 0 && <Text style={styles.muted}>No GPS days yet.</Text>}
          {days.map(d => (
            <Pressable
              key={d}
              style={[styles.dayChip, selected === d && styles.dayChipOn]}
              onPress={() => void refresh(d)}>
              <Text style={[styles.dayChipText, selected === d && styles.dayChipTextOn]}>{d}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.stat}>
          {dense ? 'GPS trail' : 'Timeline'} · {points.length} pts
          {head ? ` · ${playIdx + 1}/${points.length}` : ''} · {dist.toFixed(2)} km
          {head ? ` · ${new Date(head.t).toLocaleTimeString()}` : ''}
        </Text>
      </View>

      {points.length ? (
        <View style={styles.mapWrap}>
          <TravelDayMap points={points} playIdx={playIdx} />
        </View>
      ) : (
        <View style={[styles.map, styles.center]}>
          <Text style={styles.muted}>No map yet — waiting for GPS</Text>
        </View>
      )}

      <ScrollView
        style={styles.bottom}
        contentContainerStyle={styles.bottomPad}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled">
        <View style={styles.controls} collapsable={false}>
          <Pressable
            style={({pressed}) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={() => {
              setPlaying(false);
              setPlayIdx(0);
            }}
            disabled={!points.length}>
            <Text style={styles.primaryBtnText}>Start</Text>
          </Pressable>
          <Pressable
            style={({pressed}) => [styles.secondaryBtn, pressed && styles.pressed, !canPlay && styles.disabled]}
            onPress={() => {
              setPlaying(false);
              setPlayIdx(i => Math.max(0, i - 1));
            }}
            disabled={!canPlay}>
            <Text style={styles.secondaryBtnText}>− Step</Text>
          </Pressable>
          <Pressable
            style={({pressed}) => [styles.primaryBtn, pressed && styles.pressed, !canPlay && styles.disabled]}
            onPress={onPlay}
            disabled={!canPlay}>
            <Text style={styles.primaryBtnText}>{playing ? 'Pause' : 'Play'}</Text>
          </Pressable>
          <Pressable
            style={({pressed}) => [styles.secondaryBtn, pressed && styles.pressed, !canPlay && styles.disabled]}
            onPress={() => {
              setPlaying(false);
              setPlayIdx(i => Math.min(lastIdx, i + 1));
            }}
            disabled={!canPlay}>
            <Text style={styles.secondaryBtnText}>Step +</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>Play speed</Text>
        <View style={styles.speedRow}>
          {PLAYBACK_SPEEDS.map(s => (
            <Pressable
              key={s}
              style={[styles.speedChip, speed === s && styles.speedChipOn]}
              onPress={() => setSpeed(s)}>
              <Text style={[styles.speedChipText, speed === s && styles.speedChipTextOn]}>{s}×</Text>
            </Pressable>
          ))}
        </View>

        <View
          style={styles.scrubber}
          collapsable={false}
          onLayout={e => setScrubW(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => canPlay}
          onMoveShouldSetResponder={() => canPlay}
          onResponderGrant={e => seekFromX(e.nativeEvent.locationX)}
          onResponderMove={e => seekFromX(e.nativeEvent.locationX)}>
          <View style={[styles.scrubFill, {width: `${Math.round(progress * 100)}%`}]} />
          <View style={[styles.scrubThumb, {left: `${Math.round(progress * 100)}%`}]} />
        </View>
        {!canPlay ? (
          <Text style={styles.muted}>Need at least two GPS points to play the day.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {padding: spacing.lg, paddingBottom: spacing.xxl},
    root: {flex: 1, backgroundColor: colors.bg},
    top: {paddingHorizontal: spacing.lg, paddingTop: spacing.sm},
    mapWrap: {flex: 1, marginHorizontal: spacing.lg, marginVertical: 8, minHeight: 280},
    bottom: {maxHeight: 220},
    bottomPad: {paddingHorizontal: spacing.lg, paddingBottom: spacing.md},
    center: {alignItems: 'center', justifyContent: 'center', minHeight: 160},
    lead: {fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.sm},
    section: {fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.sm},
    dayRow: {marginVertical: spacing.sm, maxHeight: 44},
    dayChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 8,
      backgroundColor: colors.surface,
    },
    dayChipOn: {borderColor: colors.sky, backgroundColor: colors.skySoft},
    dayChipText: {fontSize: 13, color: colors.textBody, fontWeight: '600'},
    dayChipTextOn: {color: colors.textPrimary},
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    muted: {fontSize: 13, color: colors.textMuted, marginTop: 8},
    stat: {fontSize: 14, color: colors.textBody, marginBottom: 4},
    map: {
      flex: 1,
      minHeight: 280,
      marginHorizontal: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    controls: {flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md},
    primaryBtn: {
      backgroundColor: colors.sky,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: radius.md,
      marginRight: 8,
      marginBottom: 8,
    },
    primaryBtnText: {color: '#fff', fontWeight: '800', fontSize: 14},
    secondaryBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      marginRight: 8,
      marginBottom: 8,
    },
    secondaryBtnText: {color: colors.textPrimary, fontWeight: '700', fontSize: 14},
    pressed: {opacity: 0.7},
    disabled: {opacity: 0.4},
    speedRow: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 8},
    speedChip: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginRight: 8,
      marginBottom: 8,
      backgroundColor: colors.surface,
    },
    speedChipOn: {borderColor: colors.sky, backgroundColor: colors.skySoft},
    speedChipText: {fontSize: 13, fontWeight: '700', color: colors.textBody},
    speedChipTextOn: {color: colors.textPrimary},
    scrubber: {
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: spacing.sm,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    scrubFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: colors.skySoft,
    },
    scrubThumb: {
      position: 'absolute',
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.sky,
      marginLeft: -8,
      top: 5,
    },
  });
}

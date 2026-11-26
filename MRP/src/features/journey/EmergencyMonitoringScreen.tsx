import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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

/** Quiet live refresh while Travel is open on today. */
const LIVE_POLL_MS = 3_000;

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

  // Always append / extend with latest fix for today so the path stays live.
  if (day === dayKey(Date.now()) && typeof bridge.getCurrentLocationWithAddress === 'function') {
    try {
      const loc = await bridge.getCurrentLocationWithAddress(false);
      const lat = asNum(loc?.latitude);
      const lng = asNum(loc?.longitude);
      if (lat != null && lng != null && (lat || lng)) {
        const last = deduped[deduped.length - 1];
        const moved =
          !last ||
          Math.abs(last.latitude - lat) > 0.00005 ||
          Math.abs(last.longitude - lng) > 0.00005;
        if (!deduped.length) {
          deduped.push({
            latitude: lat,
            longitude: lng,
            t: Date.now(),
            label: 'Last fix',
          });
        } else if (moved) {
          deduped.push({
            latitude: lat,
            longitude: lng,
            t: Date.now(),
            label: 'Live',
          });
        } else {
          last.latitude = lat;
          last.longitude = lng;
          last.t = Date.now();
        }
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
  /** Today: draw from this index forward (session), not the whole day dump. */
  const [sessionAnchor, setSessionAnchor] = useState<number | null>(null);
  const [liveMode, setLiveMode] = useState(true);
  const selectedRef = useRef<string | null>(null);
  const playingRef = useRef(false);
  const liveModeRef = useRef(true);
  const sessionAnchorRef = useRef<number | null>(null);
  selectedRef.current = selected;
  playingRef.current = playing;
  liveModeRef.current = liveMode;
  sessionAnchorRef.current = sessionAnchor;

  const refresh = useCallback(async (pickDay?: string | null, quiet = false) => {
    if (!quiet) {
      setLoading(true);
      setPlaying(false);
    }
    try {
      const today = dayKey(Date.now());
      const keys = await loadTrailDays();
      const ordered = keys.includes(today) ? keys : [today, ...keys];
      setDays(ordered);
      const pick =
        pickDay && ordered.includes(pickDay)
          ? pickDay
          : quiet && selectedRef.current && ordered.includes(selectedRef.current)
            ? selectedRef.current
            : ordered.includes(today)
              ? today
              : ordered[0] || today;
      setSelected(pick);
      const {points: pts, dense: isDense} = await loadPointsForDay(pick);
      setPoints(pts);
      setDense(isDense);

      if (pick === today) {
        if (!quiet || sessionAnchorRef.current == null) {
          // Live session starts at current tip — path grows as you move.
          const anchor = Math.max(0, pts.length - 1);
          setSessionAnchor(anchor);
          sessionAnchorRef.current = anchor;
          setLiveMode(true);
          liveModeRef.current = true;
          setPlayIdx(0);
        } else if (!playingRef.current && liveModeRef.current) {
          const from = sessionAnchorRef.current;
          setPlayIdx(Math.max(0, pts.length - 1 - from));
        }
      } else if (!quiet) {
        setSessionAnchor(null);
        sessionAnchorRef.current = null;
        setLiveMode(false);
        liveModeRef.current = false;
        // Past day: show full travelled path; use Start/Play to scrub.
        setPlayIdx(Math.max(0, pts.length - 1));
      }
    } catch {
      if (!quiet) {
        const today = dayKey(Date.now());
        setDays([today]);
        setSelected(today);
        setPoints([]);
        setDense(false);
        setPlayIdx(0);
        setSessionAnchor(null);
        setLiveMode(true);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSessionAnchor(null);
      sessionAnchorRef.current = null;
      setLiveMode(true);
      void refresh();
      const bridge = mrpmModule as any;
      if (typeof bridge.getCurrentLocationWithAddress === 'function') {
        void bridge.getCurrentLocationWithAddress(true).catch(() => {});
      }
      const id = setInterval(() => {
        const today = dayKey(Date.now());
        if (selectedRef.current !== today) return;
        void refresh(today, true);
        if (typeof bridge.getCurrentLocationWithAddress === 'function') {
          void bridge.getCurrentLocationWithAddress(true).catch(() => {});
        }
      }, LIVE_POLL_MS);
      return () => clearInterval(id);
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

  const today = dayKey(Date.now());
  const isToday = selected === today;
  const followingLive = isToday && liveMode && !playing;
  const mapPoints = useMemo(() => {
    if (!followingLive || sessionAnchor == null) return points;
    return points.slice(Math.min(sessionAnchor, Math.max(0, points.length - 1)));
  }, [points, followingLive, sessionAnchor]);
  const mapPlayIdx = followingLive
    ? Math.max(0, mapPoints.length - 1)
    : Math.min(playIdx, Math.max(0, points.length - 1));

  const seekFromX = (x: number) => {
    if (points.length < 2) return;
    const pct = Math.min(1, Math.max(0, x / Math.max(1, scrubW)));
    setLiveMode(false);
    liveModeRef.current = false;
    setPlaying(false);
    setPlayIdx(Math.round(pct * (points.length - 1)));
  };

  const enterDayReplay = useCallback(() => {
    setLiveMode(false);
    liveModeRef.current = false;
  }, []);

  const onPlay = () => {
    if (points.length < 2) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    enterDayReplay();
    if (playIdx >= points.length - 1) {
      setPlayIdx(0);
    }
    setPlaying(true);
  };

  const goLive = () => {
    setPlaying(false);
    setLiveMode(true);
    liveModeRef.current = true;
    const anchor = sessionAnchor ?? Math.max(0, points.length - 1);
    if (sessionAnchor == null) {
      setSessionAnchor(anchor);
      sessionAnchorRef.current = anchor;
    }
    setPlayIdx(Math.max(0, points.length - 1 - anchor));
  };

  if (loading) {
    return (
      <View style={[styles.wrap, styles.center]}>
        <ActivityIndicator color={colors.sky} />
        <Text style={styles.muted}>Loading travel…</Text>
      </View>
    );
  }

  const lastIdx = Math.max(0, mapPoints.length - 1);
  const head = mapPoints[Math.min(mapPlayIdx, lastIdx)];
  let dist = 0;
  for (let i = 1; i < mapPoints.length; i++) {
    dist += haversineKm(mapPoints[i - 1], mapPoints[i]);
  }
  const canPlay = points.length >= 2;
  const progress =
    followingLive
      ? 1
      : points.length > 1
        ? playIdx / (points.length - 1)
        : 0;

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Text style={styles.lead}>
          {mapPoints.length
            ? followingLive
              ? 'Live: pinch or +/− to zoom, drag to pan. Blue line grows as you move. Fit recenters.'
              : 'Day replay: path grows with Play. Pinch to zoom. Tap Live to track travel again.'
            : 'Waiting for GPS — keep monitoring on while you move.'}
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
              onPress={() => {
                if (d === today) {
                  setSessionAnchor(null);
                  sessionAnchorRef.current = null;
                  setLiveMode(true);
                }
                void refresh(d);
              }}>
              <Text style={[styles.dayChipText, selected === d && styles.dayChipTextOn]}>{d}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.stat}>
          {followingLive ? 'Live' : dense ? 'GPS trail' : 'Timeline'} · {mapPoints.length} pts
          {head ? ` · ${mapPlayIdx + 1}/${mapPoints.length}` : ''} · {dist.toFixed(2)} km
          {head ? ` · ${new Date(head.t).toLocaleTimeString()}` : ''}
        </Text>
      </View>

      {mapPoints.length ? (
        <View style={styles.mapWrap}>
          <TravelDayMap
            points={mapPoints}
            playIdx={mapPlayIdx}
            follow={followingLive}
          />
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
          {isToday ? (
            <Pressable
              style={({pressed}) => [
                followingLive ? styles.primaryBtn : styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
              onPress={goLive}>
              <Text
                style={
                  followingLive ? styles.primaryBtnText : styles.secondaryBtnText
                }>
                Live
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={({pressed}) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={() => {
              enterDayReplay();
              setPlaying(false);
              setPlayIdx(0);
            }}
            disabled={!points.length}>
            <Text style={styles.primaryBtnText}>Start</Text>
          </Pressable>
          <Pressable
            style={({pressed}) => [styles.secondaryBtn, pressed && styles.pressed, !canPlay && styles.disabled]}
            onPress={() => {
              enterDayReplay();
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
              enterDayReplay();
              setPlaying(false);
              setPlayIdx(i => Math.min(points.length - 1, i + 1));
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
    mapWrap: {flex: 1.4, marginHorizontal: spacing.md, marginVertical: 6, minHeight: 320},
    bottom: {maxHeight: 180},
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

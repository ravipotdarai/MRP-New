import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {useEntitlements} from '../../services/entitlements/EntitlementProvider';
import {PaywallModal} from '../subscription/PaywallModal';
import mrpmModule from '../../shared/hooks/useNativeBridge';
import {useFocusEffect} from '@react-navigation/native';

type Props = {onUpgrade?: () => void};

type TrailPoint = {
  latitude: number;
  longitude: number;
  t: number;
  label?: string;
  speed?: number;
  motion?: string;
};

function dayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function staticMapUri(pts: TrailPoint[]): string | null {
  if (!pts.length) return null;
  const last = pts[pts.length - 1];
  const path = pts
    .slice(0, 120)
    .map(p => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`)
    .join('|');
  return (
    `https://staticmap.openstreetmap.de/staticmap.php` +
    `?center=${last.latitude},${last.longitude}` +
    `&zoom=13&size=720x360&maptype=mapnik` +
    `&markers=${last.latitude},${last.longitude},red-pushpin` +
    (path ? `&path=weight:4|color:0xe85d04ff|${path}` : '')
  );
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
    const lat = e?.location?.latitude;
    const lng = e?.location?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!lat && !lng) continue;
    const t = Date.parse(e.timestamp) || Number(e.timestamp) || 0;
    if (t) set.add(dayKey(t));
  }
  return [...set].sort().reverse();
}

async function loadPointsForDay(day: string): Promise<{points: TrailPoint[]; dense: boolean}> {
  const bridge = mrpmModule as any;
  if (typeof bridge.getGpsTrailForDay === 'function') {
    const trail = await bridge.getGpsTrailForDay(day);
    if (Array.isArray(trail) && trail.length) {
      return {
        dense: true,
        points: trail
          .map(p => ({
            latitude: p.latitude,
            longitude: p.longitude,
            t: p.t,
            speed: p.speed,
            motion: p.motion,
            label: 'GPS',
          }))
          .sort((a, b) => a.t - b.t),
      };
    }
  }
  const timeline = await bridge.getTimeline?.();
  const rows = Array.isArray(timeline) ? timeline : [];
  const pts: TrailPoint[] = [];
  for (const e of rows) {
    const lat = e?.location?.latitude;
    const lng = e?.location?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!lat && !lng) continue;
    const t = Date.parse(e.timestamp) || Number(e.timestamp) || 0;
    if (dayKey(t) !== day) continue;
    pts.push({
      latitude: lat,
      longitude: lng,
      t,
      label: String(e.event_type || e.eventType || 'EVENT'),
    });
  }
  pts.sort((a, b) => a.t - b.t);
  return {points: pts, dense: false};
}

/**
 * Hub Premium+ — local dense GPS trail + sparse timeline fallback.
 */
export function EmergencyMonitoringScreen({onUpgrade}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {canUseFeature} = useEntitlements();
  const unlocked = canUseFeature('journey.playback');

  const [paywall, setPaywall] = useState(false);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [points, setPoints] = useState<TrailPoint[]>([]);
  const [dense, setDense] = useState(false);
  const [playIdx, setPlayIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  const refresh = useCallback(async (pickDay?: string | null) => {
    setLoading(true);
    try {
      const keys = await loadTrailDays();
      setDays(keys);
      const pick = pickDay && keys.includes(pickDay) ? pickDay : keys[0] || null;
      setSelected(pick);
      if (pick) {
        const {points: pts, dense: isDense} = await loadPointsForDay(pick);
        setPoints(pts);
        setDense(isDense);
        setPlayIdx(0);
      } else {
        setPoints([]);
        setDense(false);
      }
    } catch {
      setDays([]);
      setPoints([]);
      setDense(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (unlocked) void refresh();
    }, [unlocked, refresh]),
  );

  useEffect(() => {
    if (!playing || points.length < 2) return;
    const id = setInterval(() => {
      setPlayIdx(i => {
        if (i >= points.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, dense ? 120 : 700);
    return () => clearInterval(id);
  }, [playing, points.length, dense]);

  if (!unlocked) {
    return (
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Premium required</Text>
          <Text style={styles.body}>
            Emergency monitoring / journey playback is a Premium+ feature. Dense GPS syncs to Drive
            for the web investigation desk.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => (onUpgrade ? onUpgrade() : setPaywall(true))}>
            <Text style={styles.primaryBtnText}>View subscriptions</Text>
          </TouchableOpacity>
        </View>
        <PaywallModal
          visible={paywall}
          message="Journey playback needs Premium or higher."
          onClose={() => setPaywall(false)}
          onUpgrade={() => {
            setPaywall(false);
            onUpgrade?.();
          }}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.wrap, styles.center]}>
        <ActivityIndicator color={colors.sky} />
        <Text style={styles.muted}>Loading journey days…</Text>
      </View>
    );
  }

  const head = points[Math.min(playIdx, Math.max(0, points.length - 1))];
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    dist += haversineKm(points[i - 1], points[i]);
  }
  const mapUri = staticMapUri(points.slice(0, playIdx + 1));

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Text style={styles.lead}>
        {dense
          ? 'Dense on-device GPS trail for this day.'
          : 'Sparse timeline GPS — move with monitoring on to build dense trail.'}
      </Text>

      <Text style={styles.section}>Days with GPS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayRow}>
        {days.length === 0 && <Text style={styles.muted}>No GPS days yet.</Text>}
        {days.map(d => (
          <TouchableOpacity
            key={d}
            style={[styles.dayChip, selected === d && styles.dayChipOn]}
            onPress={() => {
              setPlaying(false);
              void refresh(d);
            }}>
            <Text style={[styles.dayChipText, selected === d && styles.dayChipTextOn]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.card}>
        <Text style={styles.stat}>Source: {dense ? 'Dense GPS trail' : 'Timeline events'}</Text>
        <Text style={styles.stat}>Points: {points.length}</Text>
        <Text style={styles.stat}>Distance: {dist.toFixed(2)} km</Text>
        {head && (
          <Text style={styles.stat}>
            Playhead: {new Date(head.t).toLocaleTimeString()} · {head.label}
            {head.speed != null ? ` · ${(head.speed * 3.6).toFixed(0)} km/h` : ''}
          </Text>
        )}
      </View>

      {mapUri ? (
        <Image source={{uri: mapUri}} style={styles.map} resizeMode="cover" />
      ) : (
        <View style={[styles.map, styles.center]}>
          <Text style={styles.muted}>No map trail</Text>
        </View>
      )}

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            setPlayIdx(0);
            setPlaying(false);
          }}>
          <Text style={styles.primaryBtnText}>Start</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => setPlaying(p => !p)}
          disabled={points.length < 2}>
          <Text style={styles.primaryBtnText}>{playing ? 'Pause' : 'Play'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => setPlayIdx(i => Math.min(points.length - 1, i + 1))}
          disabled={points.length < 2}>
          <Text style={styles.secondaryBtnText}>Step →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm},
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
    title: {fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm},
    body: {fontSize: 15, lineHeight: 22, color: colors.textBody, marginBottom: spacing.md},
    muted: {fontSize: 13, color: colors.textMuted, marginTop: 8},
    stat: {fontSize: 14, color: colors.textBody, marginBottom: 4},
    map: {
      width: '100%',
      height: 220,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    controls: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md},
    primaryBtn: {
      backgroundColor: colors.sky,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radius.md,
    },
    primaryBtnText: {color: '#fff', fontWeight: '800', fontSize: 14},
    secondaryBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    secondaryBtnText: {color: colors.textPrimary, fontWeight: '700', fontSize: 14},
  });
}

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Image,
  ActivityIndicator,
} from 'react-native';
import {ColorPalette, spacing, radius} from '../../shared/theme';
import {useTheme} from '../../shared/ThemeContext';
import {LiveMapPoint, pinStyle} from './circleMapUrls';

type Props = {
  points: LiveMapPoint[];
  title?: string;
  fallbackCenter?: {latitude: number; longitude: number} | null;
};

type TrailPoint = {latitude: number; longitude: number; atMs: number};
type BBox = {west: number; south: number; east: number; north: number};

const MAX_TRAIL = 180;
const MIN_MOVE_DEG = 0.00008;
const MAP_HEIGHT = 300;
/** Request size (px) for the static map image. */
const IMG_W = 720;
const IMG_H = 420;

function haversineLike(
  a: {latitude: number; longitude: number},
  b: {latitude: number; longitude: number},
): number {
  const dLat = a.latitude - b.latitude;
  const dLng = a.longitude - b.longitude;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function buildBBox(
  pts: {latitude: number; longitude: number}[],
  fallback: {latitude: number; longitude: number},
): BBox {
  if (pts.length === 0) {
    const pad = 0.012;
    return {
      west: fallback.longitude - pad,
      east: fallback.longitude + pad,
      south: fallback.latitude - pad,
      north: fallback.latitude + pad,
    };
  }
  let west = pts[0].longitude;
  let east = pts[0].longitude;
  let south = pts[0].latitude;
  let north = pts[0].latitude;
  for (const p of pts) {
    west = Math.min(west, p.longitude);
    east = Math.max(east, p.longitude);
    south = Math.min(south, p.latitude);
    north = Math.max(north, p.latitude);
  }
  const lngPad = Math.max((east - west) * 0.35, 0.004);
  const latPad = Math.max((north - south) * 0.35, 0.004);
  // Keep a usable aspect for the image box
  const midLat = (south + north) / 2;
  const midLng = (west + east) / 2;
  let w = east - west + lngPad * 2;
  let h = north - south + latPad * 2;
  const targetAspect = IMG_W / IMG_H;
  if (w / h > targetAspect) {
    h = w / targetAspect;
  } else {
    w = h * targetAspect;
  }
  return {
    west: midLng - w / 2,
    east: midLng + w / 2,
    south: midLat - h / 2,
    north: midLat + h / 2,
  };
}

function project(
  lat: number,
  lng: number,
  bbox: BBox,
  width: number,
  height: number,
): {x: number; y: number} {
  const x = ((lng - bbox.west) / (bbox.east - bbox.west)) * width;
  const y = ((bbox.north - lat) / (bbox.north - bbox.south)) * height;
  return {x, y};
}

/** ArcGIS World Street Map export — no API key, works in RN Image. */
function buildMapUrl(bbox: BBox): string {
  const bboxParam = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
  return (
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/export' +
    `?bbox=${encodeURIComponent(bboxParam)}` +
    '&bboxSR=4326&imageSR=4326' +
    `&size=${IMG_W},${IMG_H}` +
    '&format=png&transparent=false&f=image'
  );
}

/**
 * Native Image map (ArcGIS tiles) + overlay markers/paths.
 * Avoids Google Maps key issues and WebView+ScrollView height collapse.
 */
export function CircleLiveMap({
  points,
  title = 'Live map',
  fallbackCenter = null,
}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const trailsRef = useRef<Record<string, TrailPoint[]>>({});
  const [trails, setTrails] = useState<Record<string, TrailPoint[]>>({});
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState<string | null>(null);
  const [layoutW, setLayoutW] = useState(0);

  useEffect(() => {
    if (points.length === 0) return;
    let changed = false;
    const next = {...trailsRef.current};
    for (const p of points) {
      const pt: TrailPoint = {
        latitude: p.latitude,
        longitude: p.longitude,
        atMs: p.atMs ?? Date.now(),
      };
      const prev = next[p.id] ?? [];
      const last = prev[prev.length - 1];
      if (!last) {
        next[p.id] = [pt];
        changed = true;
        continue;
      }
      if (haversineLike(last, pt) < MIN_MOVE_DEG && Math.abs(pt.atMs - last.atMs) < 5000) {
        next[p.id] = [...prev.slice(0, -1), pt];
        changed = true;
        continue;
      }
      next[p.id] = [...prev, pt].slice(-MAX_TRAIL);
      changed = true;
    }
    if (changed) {
      trailsRef.current = next;
      setTrails(next);
    }
  }, [points]);

  const fallback = fallbackCenter || {latitude: 18.52, longitude: 73.85};

  const allPts = useMemo(() => {
    const list: {latitude: number; longitude: number}[] = points.map(p => ({
      latitude: p.latitude,
      longitude: p.longitude,
    }));
    for (const id of Object.keys(trails)) {
      for (const t of trails[id] ?? []) {
        list.push({latitude: t.latitude, longitude: t.longitude});
      }
    }
    return list;
  }, [points, trails]);

  const bbox = useMemo(() => buildBBox(allPts, fallback), [allPts, fallback]);
  const mapUrl = useMemo(() => buildMapUrl(bbox), [bbox]);

  useEffect(() => {
    setImgLoading(true);
    setImgError(null);
  }, [mapUrl]);

  const openExternal = () => {
    const p = points[0] ?? fallbackCenter;
    if (!p) return;
    const lat = 'latitude' in p ? p.latitude : (p as LiveMapPoint).latitude;
    const lng = 'longitude' in p ? p.longitude : (p as LiveMapPoint).longitude;
    Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`).catch(() => {});
  };

  const drawW = layoutW > 0 ? layoutW : IMG_W;
  const drawH = MAP_HEIGHT;

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title} · map + path</Text>
        <TouchableOpacity onPress={openExternal} hitSlop={8}>
          <Text style={styles.link}>Open in Google Maps</Text>
        </TouchableOpacity>
      </View>

      <View
        style={styles.mapClip}
        collapsable={false}
        onLayout={e => setLayoutW(e.nativeEvent.layout.width)}>
        <Image
          source={{uri: mapUrl}}
          style={styles.mapImage}
          resizeMode="cover"
          onLoadStart={() => setImgLoading(true)}
          onLoad={() => {
            setImgLoading(false);
            setImgError(null);
          }}
          onError={() => {
            setImgLoading(false);
            setImgError('Map image failed to load');
          }}
        />

        {layoutW > 0
          ? Object.keys(trails).map(id => {
              const trail = trails[id] ?? [];
              if (trail.length < 2) return null;
              const color =
                pinStyle(points.find(p => p.id === id)?.colorIndex ?? 0).hex;
              const segments: React.ReactNode[] = [];
              for (let i = 1; i < trail.length; i++) {
                const a = project(trail[i - 1].latitude, trail[i - 1].longitude, bbox, drawW, drawH);
                const b = project(trail[i].latitude, trail[i].longitude, bbox, drawW, drawH);
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len < 1) continue;
                const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                segments.push(
                  <View
                    key={`${id}-${i}`}
                    style={{
                      position: 'absolute',
                      left: (a.x + b.x) / 2 - len / 2,
                      top: (a.y + b.y) / 2 - 2,
                      width: len,
                      height: 4,
                      backgroundColor: color,
                      opacity: 0.9,
                      borderRadius: 2,
                      transform: [{rotate: `${angle}deg`}],
                    }}
                  />,
                );
              }
              return <React.Fragment key={`trail-${id}`}>{segments}</React.Fragment>;
            })
          : null}

        {layoutW > 0
          ? points.map(p => {
              const {x, y} = project(p.latitude, p.longitude, bbox, drawW, drawH);
              const color = pinStyle(p.colorIndex).hex;
              return (
                <View
                  key={p.id}
                  style={[
                    styles.marker,
                    {
                      left: x - 8,
                      top: y - 8,
                      backgroundColor: color,
                    },
                  ]}
                />
              );
            })
          : null}

        {imgLoading ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color={colors.sky} />
            <Text style={styles.loadingText}>Loading map…</Text>
          </View>
        ) : null}
        {imgError ? (
          <View style={styles.errorOverlay} pointerEvents="none">
            <Text style={styles.errorText}>{imgError}</Text>
          </View>
        ) : null}
      </View>

      {points.length > 0 ? (
        <View style={styles.legend}>
          {points.map(p => {
            const style = pinStyle(p.colorIndex);
            const trailLen = trails[p.id]?.length ?? 0;
            return (
              <View key={p.id} style={styles.legendRow}>
                <View style={[styles.dot, {backgroundColor: style.hex}]} />
                <Text style={styles.legendText} numberOfLines={1}>
                  {p.displayName}
                  {trailLen > 1 ? ` · path ${trailLen} pts` : ''}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.hint}>
          Waiting for live points… Turn Share ON after mutual consent.
        </Text>
      )}
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
      fontSize: 12,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      flex: 1,
      marginRight: 8,
    },
    link: {fontSize: 12, color: colors.sky, fontWeight: '700'},
    mapClip: {
      width: '100%',
      height: MAP_HEIGHT,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: '#c5d4e0',
      borderWidth: 1,
      borderColor: colors.border,
      position: 'relative',
    },
    mapImage: {
      width: '100%',
      height: MAP_HEIGHT,
      backgroundColor: '#c5d4e0',
    },
    marker: {
      position: 'absolute',
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: '#fff',
      zIndex: 2,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(197,212,224,0.55)',
      gap: 8,
      zIndex: 3,
    },
    loadingText: {fontSize: 12, color: colors.textMuted, fontWeight: '600'},
    errorOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      backgroundColor: 'rgba(254,242,242,0.92)',
      zIndex: 3,
    },
    errorText: {fontSize: 13, color: '#991b1b', textAlign: 'center'},
    legend: {marginTop: spacing.sm, gap: 6},
    legendRow: {flexDirection: 'row', alignItems: 'center'},
    dot: {width: 10, height: 10, borderRadius: 5, marginRight: 8},
    legendText: {fontSize: 13, color: colors.textBody, flex: 1},
    hint: {marginTop: spacing.sm, fontSize: 12, color: colors.textMuted, lineHeight: 17},
  });
}

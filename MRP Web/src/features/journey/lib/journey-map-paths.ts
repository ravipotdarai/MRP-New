import type { GpsPoint, InterpolatedPose } from "../types";
import { splitPathByTime } from "./routing/navigable-trail";
import type { PathMode } from "../components/journey-map-types";

/** Break only true teleports. Sparse timeline samples are often km apart — a low threshold hid paths. */
export const TRAIL_MAX_JUMP_M = 25_000;

export function flattenRoadLegs(roadLegs: [number, number][][]): [number, number][] {
  const flat: [number, number][] = [];
  for (const leg of roadLegs) {
    if (!flat.length) flat.push(...leg);
    else flat.push(...leg.slice(1));
  }
  return flat;
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Split a path into continuous legs so teleport jumps are not drawn as one line. */
export function splitTrailSegments(
  path: [number, number][],
  maxJumpM = TRAIL_MAX_JUMP_M,
): [number, number][][] {
  if (path.length < 2) return path.length ? [path] : [];
  const legs: [number, number][][] = [];
  let cur: [number, number][] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const next = path[i];
    const d = haversineMeters(
      { lat: prev[0], lng: prev[1] },
      { lat: next[0], lng: next[1] },
    );
    if (d > maxJumpM) {
      if (cur.length >= 2) legs.push(cur);
      cur = [next];
    } else {
      cur.push(next);
    }
  }
  if (cur.length >= 2) legs.push(cur);
  // Never drop the trail: if every gap exceeded the threshold, draw the full path.
  if (!legs.length && path.length >= 2) return [path];
  return legs;
}

/**
 * Bounds points for fitBounds — drops far outliers that would zoom the map to a continent.
 */
export function fitPathPoints(path: [number, number][]): [number, number][] {
  if (path.length <= 2) return path;
  const lats = path.map((p) => p[0]).sort((a, b) => a - b);
  const lngs = path.map((p) => p[1]).sort((a, b) => a - b);
  const p = (arr: number[], q: number) => {
    const i = Math.min(arr.length - 1, Math.max(0, Math.floor(q * (arr.length - 1))));
    return arr[i];
  };
  const lat0 = p(lats, 0.05);
  const lat1 = p(lats, 0.95);
  const lng0 = p(lngs, 0.05);
  const lng1 = p(lngs, 0.95);
  const padLat = Math.max(0.002, (lat1 - lat0) * 0.15);
  const padLng = Math.max(0.002, (lng1 - lng0) * 0.15);
  const minLat = lat0 - padLat;
  const maxLat = lat1 + padLat;
  const minLng = lng0 - padLng;
  const maxLng = lng1 + padLng;
  const core = path.filter(
    ([lat, lng]) => lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng,
  );
  return core.length >= 2 ? core : path;
}

/** High-contrast travelled-path colors (casing + stroke). */
export const TRAIL_STYLE = {
  casing: { color: "#0f172a", weight: 10, opacity: 0.55 },
  stroke: { color: "#2563eb", weight: 6, opacity: 0.95 },
  remaining: { color: "#64748b", weight: 5, opacity: 0.55, dashArray: "8 10" as const },
  roads: { color: "#16a34a", weight: 6, opacity: 0.95 },
  gpsBoth: { color: "#2563eb", weight: 4, opacity: 0.7 },
};

export function resolvePathDisplay(
  pathMode: PathMode,
  gpsPath: [number, number][],
  roadFlat: [number, number][],
  points: GpsPoint[],
  pose: InterpolatedPose | null,
) {
  const hasRoads = roadFlat.length >= 2;
  const showRoads = (pathMode === "roads" || pathMode === "both") && hasRoads;
  /** GPS overlay: always for gps/both; fallback when roads not ready. */
  const showGps =
    pathMode === "gps" || pathMode === "both" || (pathMode === "roads" && !hasRoads);

  const playPath: GpsPoint[] = (() => {
    if (showRoads && pathMode === "roads") {
      const t0 = points[0]?.t ?? 0;
      const t1 = points[points.length - 1]?.t ?? t0 + 1;
      const span = Math.max(1, t1 - t0);
      return roadFlat.map(([lat, lng], i) => ({
        t: t0 + (span * i) / Math.max(1, roadFlat.length - 1),
        lat,
        lng,
      }));
    }
    return points;
  })();

  const fullPath: [number, number][] =
    showRoads && pathMode === "roads" ? roadFlat : gpsPath;

  const { completed, remaining } =
    playPath.length > 1
      ? splitPathByTime(playPath, pose?.t ?? playPath[0].t, pose?.lat, pose?.lng)
      : { completed: fullPath, remaining: [] as [number, number][] };

  const displayLegs = splitTrailSegments(fullPath);
  const completedLegs = splitTrailSegments(completed);
  const remainingLegs = splitTrailSegments(remaining);
  const gpsLegs = splitTrailSegments(gpsPath);

  return {
    showGps,
    showRoads,
    hasRoads,
    playPath,
    fullPath,
    completed,
    remaining,
    displayLegs,
    completedLegs,
    remainingLegs,
    gpsLegs,
    fitPoints: fitPathPoints(fullPath.length >= 2 ? fullPath : gpsPath),
  };
}

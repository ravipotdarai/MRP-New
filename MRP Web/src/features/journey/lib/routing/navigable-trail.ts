/**
 * Build a road-following trail from raw GPS samples (OSRM match + pair fallback).
 * Playback should keep original GPS timestamps; map polylines may use road geometry.
 */

import type { GpsPoint } from "../../types";
import { getDefaultRoutingProvider } from "./osrm-provider";
import type { LatLng, RouteResult, RoutingProvider } from "./types";

const CHUNK = 80;
const MIN_STEP_M = 18;
const MAX_GAP_M = 800;
/** Max implied speed between samples (~120 km/h). Faster = teleport / bad join. */
const MAX_SPEED_MS = 33;
/** Don't stitch segments after long idle with meaningful move. */
const MAX_IDLE_MS = 12 * 60_000;
/** Sparse trails: skip match API (stitches junk + destroys times). */
const SPARSE_COUNT = 40;
const SPARSE_MEDIAN_GAP_MS = 45_000;

export type NavigableTrail = {
  /** Road samples for map playhead split when dense; prefer GPS for sparse playback. */
  points: GpsPoint[];
  /** Full road path for map polylines [lat, lng] (may include gaps as separate legs). */
  path: [number, number][];
  /** Disjoint road legs — do not connect across teleports. */
  pathLegs: [number, number][][];
  source: "osrm" | "raw";
  routedSegments: number;
  failedSegments: number;
};

function haversineM(a: LatLng, b: LatLng): number {
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

function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(((b.lng - a.lng) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  const x =
    Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
    Math.sin((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.cos(((b.lng - a.lng) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Thin GPS for routing: keep spacing + long time gaps (stops). */
export function thinForRouting(points: GpsPoint[], minStepM = MIN_STEP_M): GpsPoint[] {
  if (points.length <= 2) return [...points];
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const out: GpsPoint[] = [sorted[0]];
  for (let i = 1; i < sorted.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    const d = haversineM(prev, cur);
    const dt = cur.t - prev.t;
    if (d >= minStepM || dt >= 90_000) out.push(cur);
  }
  const last = sorted[sorted.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function isSparseTrail(points: GpsPoint[]): boolean {
  if (points.length < 2) return true;
  if (points.length < SPARSE_COUNT) return true;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    gaps.push(Math.max(0, points[i].t - points[i - 1].t));
  }
  gaps.sort((a, b) => a - b);
  const mid = gaps[Math.floor(gaps.length / 2)] ?? 0;
  return mid >= SPARSE_MEDIAN_GAP_MS;
}

/** True when two samples belong to the same continuous trip. */
export function shouldBridge(a: GpsPoint, b: GpsPoint): boolean {
  const d = haversineM(a, b);
  const dtMs = Math.max(1, b.t - a.t);
  const speed = d / (dtMs / 1000);
  if (d > MAX_GAP_M) return false;
  if (speed > MAX_SPEED_MS) return false;
  if (dtMs > MAX_IDLE_MS && d > 120) return false;
  return true;
}

function stampRoadGeometry(
  geometry: LatLng[],
  t0: number,
  t1: number,
  template: GpsPoint,
): GpsPoint[] {
  if (geometry.length === 0) return [];
  if (geometry.length === 1) {
    return [
      {
        ...template,
        t: t0,
        lat: geometry[0].lat,
        lng: geometry[0].lng,
        h: template.h ?? 0,
      },
    ];
  }
  const dists: number[] = [0];
  for (let i = 1; i < geometry.length; i++) {
    dists.push(dists[i - 1] + haversineM(geometry[i - 1], geometry[i]));
  }
  const total = dists[dists.length - 1] || 1;
  const span = Math.max(1, t1 - t0);
  return geometry.map((g, i) => {
    const u = dists[i] / total;
    const next = geometry[Math.min(i + 1, geometry.length - 1)];
    return {
      t: t0 + span * u,
      lat: g.lat,
      lng: g.lng,
      s: template.s,
      h: bearingDeg(g, next),
      a: template.a,
      alt: template.alt,
      b: template.b,
      n: template.n,
      g: template.g,
      m: template.m ?? "drive",
    };
  });
}

function straightSegment(a: GpsPoint, b: GpsPoint): GpsPoint[] {
  return stampRoadGeometry(
    [
      { lat: a.lat, lng: a.lng },
      { lat: b.lat, lng: b.lng },
    ],
    a.t,
    b.t,
    a,
  );
}

async function routePair(
  provider: RoutingProvider,
  a: GpsPoint,
  b: GpsPoint,
  signal?: AbortSignal,
): Promise<{ coords: LatLng[]; ok: boolean }> {
  const d = haversineM(a, b);
  if (d < 8) {
    return { coords: [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }], ok: true };
  }
  if (!shouldBridge(a, b)) {
    return { coords: [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }], ok: false };
  }
  const routed = await provider.route(a, b, signal);
  if (routed?.coordinates?.length) {
    return { coords: routed.coordinates, ok: true };
  }
  return { coords: [{ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }], ok: false };
}

type ChunkResult = {
  points: GpsPoint[];
  legs: [number, number][][];
  routed: number;
  failed: number;
};

async function pairWiseChunk(
  provider: RoutingProvider,
  chunk: GpsPoint[],
  signal?: AbortSignal,
): Promise<ChunkResult> {
  const out: GpsPoint[] = [];
  const legs: [number, number][][] = [];
  let routed = 0;
  let failed = 0;

  for (let i = 0; i < chunk.length - 1; i++) {
    const a = chunk[i];
    const b = chunk[i + 1];
    if (!shouldBridge(a, b)) {
      failed++;
      if (!out.length) out.push(a);
      out.push(b);
      continue;
    }
    const { coords, ok } = await routePair(provider, a, b, signal);
    if (ok) routed++;
    else failed++;
    const seg = stampRoadGeometry(coords, a.t, b.t, a);
    const legPath = coords.map((c) => [c.lat, c.lng] as [number, number]);
    if (legPath.length >= 2) legs.push(legPath);
    if (out.length) out.push(...seg.slice(1));
    else out.push(...seg);
  }
  return { points: out, legs, routed, failed };
}

async function matchChunk(
  provider: RoutingProvider,
  chunk: GpsPoint[],
  signal?: AbortSignal,
  preferMatch = true,
): Promise<ChunkResult> {
  if (chunk.length < 2) {
    return {
      points: chunk,
      legs: chunk.length ? [[[chunk[0].lat, chunk[0].lng]]] : [],
      routed: 0,
      failed: 0,
    };
  }

  // Sparse / vault trails: pair-wise only (match stitches unrelated jumps).
  if (!preferMatch || isSparseTrail(chunk) || chunk.length < 8) {
    return pairWiseChunk(provider, chunk, signal);
  }

  // Break chunk at teleports before match
  const subChunks: GpsPoint[][] = [];
  let cur: GpsPoint[] = [chunk[0]];
  for (let i = 1; i < chunk.length; i++) {
    if (shouldBridge(chunk[i - 1], chunk[i])) {
      cur.push(chunk[i]);
    } else {
      if (cur.length) subChunks.push(cur);
      cur = [chunk[i]];
    }
  }
  if (cur.length) subChunks.push(cur);

  if (subChunks.length > 1 || subChunks.some((s) => s.length < 8)) {
    return pairWiseChunk(provider, chunk, signal);
  }

  const match = await provider.match(
    chunk.map((p) => ({ lat: p.lat, lng: p.lng })),
    signal,
  );

  if (match && match.coordinates.length >= 2) {
    // Stamp using original GPS endpoint times only for the whole leg —
    // callers must not replace sparse playback with these points.
    const stamped = stampRoadGeometry(
      match.coordinates,
      chunk[0].t,
      chunk[chunk.length - 1].t,
      chunk[0],
    );
    const leg = match.coordinates.map((c) => [c.lat, c.lng] as [number, number]);
    return { points: stamped, legs: [leg], routed: 1, failed: 0 };
  }

  return pairWiseChunk(provider, chunk, signal);
}

export type NavigableProgress = {
  path: [number, number][];
  pathLegs: [number, number][][];
  points: GpsPoint[];
  done: boolean;
  source: "osrm" | "raw";
  routedSegments: number;
  failedSegments: number;
};

function flattenLegs(legs: [number, number][][]): [number, number][] {
  const path: [number, number][] = [];
  for (const leg of legs) {
    if (leg.length < 2) continue;
    if (!path.length) path.push(...leg);
    else path.push(...leg.slice(1));
  }
  return path;
}

/**
 * Chunked progressive road snap. Calls `onProgress` as each chunk completes.
 */
export async function buildNavigableTrail(
  raw: GpsPoint[],
  opts?: {
    provider?: RoutingProvider;
    signal?: AbortSignal;
    onProgress?: (p: NavigableProgress) => void;
  },
): Promise<NavigableTrail> {
  const provider = opts?.provider ?? getDefaultRoutingProvider();
  const signal = opts?.signal;

  if (raw.length < 2) {
    const path = raw.map((p) => [p.lat, p.lng] as [number, number]);
    const pathLegs = path.length ? [path] : [];
    return { points: raw, path, pathLegs, source: "raw", routedSegments: 0, failedSegments: 0 };
  }

  const thinned = thinForRouting(raw);
  const preferMatch = !isSparseTrail(thinned);
  const merged: GpsPoint[] = [];
  const allLegs: [number, number][][] = [];
  let routedSegments = 0;
  let failedSegments = 0;
  let anyOsrm = false;

  for (let start = 0; start < thinned.length - 1; start += CHUNK - 1) {
    if (signal?.aborted) break;
    const end = Math.min(start + CHUNK, thinned.length);
    const chunk = thinned.slice(start, end);
    if (chunk.length < 2) continue;

    const { points: seg, legs, routed, failed } = await matchChunk(
      provider,
      chunk,
      signal,
      preferMatch,
    );
    routedSegments += routed;
    failedSegments += failed;
    if (routed > 0) anyOsrm = true;

    if (!merged.length) merged.push(...seg);
    else merged.push(...seg.slice(1));
    allLegs.push(...legs.filter((l) => l.length >= 2));

    const path = flattenLegs(allLegs);
    opts?.onProgress?.({
      path,
      pathLegs: allLegs,
      points: merged,
      done: false,
      source: anyOsrm ? "osrm" : "raw",
      routedSegments,
      failedSegments,
    });
  }

  if (merged.length < 2 && allLegs.every((l) => l.length < 2)) {
    const path = raw.map((p) => [p.lat, p.lng] as [number, number]);
    const fallback: NavigableTrail = {
      points: raw,
      path,
      pathLegs: path.length >= 2 ? [path] : [],
      source: "raw",
      routedSegments: 0,
      failedSegments: thinned.length,
    };
    opts?.onProgress?.({ ...fallback, done: true });
    return fallback;
  }

  for (let i = 1; i < merged.length; i++) {
    if (merged[i].t <= merged[i - 1].t) {
      merged[i] = { ...merged[i], t: merged[i - 1].t + 1 };
    }
  }

  const pathLegs = allLegs.filter((l) => l.length >= 2);
  const result: NavigableTrail = {
    points: merged,
    path: flattenLegs(pathLegs),
    pathLegs,
    source: anyOsrm ? "osrm" : "raw",
    routedSegments,
    failedSegments,
  };
  opts?.onProgress?.({ ...result, done: true });
  return result;
}

/** Nearest vertex index on a path to a pose (for completed/remaining split). */
export function nearestPathIndex(path: [number, number][], lat: number, lng: number): number {
  if (!path.length) return 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = haversineM({ lat: path[i][0], lng: path[i][1] }, { lat, lng });
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Split completed / remaining road path by playback pose (spatial), falling back to time. */
export function splitPathByTime(
  roadPoints: GpsPoint[],
  t: number,
  poseLat?: number,
  poseLng?: number,
): { completed: [number, number][]; remaining: [number, number][]; full: [number, number][] } {
  const full = roadPoints.map((p) => [p.lat, p.lng] as [number, number]);
  if (!roadPoints.length) return { completed: [], remaining: [], full: [] };

  if (poseLat != null && poseLng != null && full.length >= 2) {
    const idx = nearestPathIndex(full, poseLat, poseLng);
    const completed = full.slice(0, idx + 1);
    const remaining = full.slice(idx);
    if (completed.length) {
      completed[completed.length - 1] = [poseLat, poseLng];
    }
    if (remaining.length) {
      remaining[0] = [poseLat, poseLng];
    } else {
      remaining.push([poseLat, poseLng]);
    }
    return { completed, remaining, full };
  }

  const done: [number, number][] = [];
  const rest: [number, number][] = [];
  for (const p of roadPoints) {
    if (p.t <= t) done.push([p.lat, p.lng]);
    else rest.push([p.lat, p.lng]);
  }
  return { completed: done, remaining: rest, full };
}

export function straightSegmentFallback(a: GpsPoint, b: GpsPoint): GpsPoint[] {
  return straightSegment(a, b);
}

export type { RouteResult };

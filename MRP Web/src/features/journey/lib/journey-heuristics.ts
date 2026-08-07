import type { GpsPoint } from "../types";

export type JourneyStop = {
  lat: number;
  lng: number;
  startMs: number;
  endMs: number;
  durationMin: number;
};

export type JourneyInsight = {
  id: string;
  severity: "info" | "warn";
  title: string;
  detail: string;
};

export type JourneyHeuristics = {
  stops: JourneyStop[];
  overspeedSegments: number;
  nightDrivingMin: number;
  frequentLocations: Array<{ lat: number; lng: number; label: string; visits: number }>;
  insights: JourneyInsight[];
  summary: string;
};

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
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

/** Detect dwell clusters where speed is low and position stays within radius. */
export function detectStops(
  points: GpsPoint[],
  minDwellMs = 5 * 60_000,
  maxRadiusM = 120,
): JourneyStop[] {
  if (points.length < 2) return [];
  const stops: JourneyStop[] = [];
  let i = 0;
  while (i < points.length) {
    const start = points[i];
    let j = i + 1;
    while (j < points.length) {
      const p = points[j];
      if (haversineM(start, p) > maxRadiusM) break;
      if ((p.s ?? 0) > 2.5 && haversineM(points[j - 1], p) > 30) break;
      j++;
    }
    const end = points[Math.max(i, j - 1)];
    const dur = end.t - start.t;
    if (dur >= minDwellMs) {
      stops.push({
        lat: start.lat,
        lng: start.lng,
        startMs: start.t,
        endMs: end.t,
        durationMin: Math.round(dur / 60000),
      });
    }
    i = Math.max(i + 1, j);
  }
  return stops;
}

export function detectOverspeedSegments(points: GpsPoint[], limitKmh = 80): number {
  let count = 0;
  for (let i = 1; i < points.length; i++) {
    const spd = (points[i].s ?? 0) * 3.6;
    if (spd > limitKmh) count++;
  }
  return count;
}

export function detectNightDrivingMin(points: GpsPoint[]): number {
  let ms = 0;
  for (let i = 1; i < points.length; i++) {
    const h = new Date(points[i].t).getHours();
    if (h >= 22 || h < 5) ms += Math.max(0, points[i].t - points[i - 1].t);
  }
  return Math.round(ms / 60000);
}

/** Grid-cluster frequent end points (home/office candidates). */
export function detectFrequentLocations(
  points: GpsPoint[],
  cellDeg = 0.004,
): Array<{ lat: number; lng: number; label: string; visits: number }> {
  const grid = new Map<string, { lat: number; lng: number; n: number }>();
  for (const p of points) {
    const gx = Math.round(p.lat / cellDeg);
    const gy = Math.round(p.lng / cellDeg);
    const key = `${gx}:${gy}`;
    const cur = grid.get(key) || { lat: p.lat, lng: p.lng, n: 0 };
    cur.n += 1;
    grid.set(key, cur);
  }
  return [...grid.values()]
    .filter((c) => c.n >= 8)
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((c, i) => ({
      lat: c.lat,
      lng: c.lng,
      visits: c.n,
      label: i === 0 ? "Frequent A" : i === 1 ? "Frequent B" : `Cluster ${i + 1}`,
    }));
}

export function buildJourneyHeuristics(points: GpsPoint[]): JourneyHeuristics {
  const stops = detectStops(points);
  const overspeedSegments = detectOverspeedSegments(points);
  const nightDrivingMin = detectNightDrivingMin(points);
  const frequentLocations = detectFrequentLocations(points);
  const insights: JourneyInsight[] = [];

  if (stops.length) {
    const longest = stops.reduce((a, b) => (a.durationMin > b.durationMin ? a : b));
    insights.push({
      id: "long-stop",
      severity: "info",
      title: "Long stop",
      detail: `${longest.durationMin} min near ${longest.lat.toFixed(4)}, ${longest.lng.toFixed(4)}`,
    });
  }
  if (overspeedSegments > 5) {
    insights.push({
      id: "overspeed",
      severity: "warn",
      title: "Overspeed samples",
      detail: `${overspeedSegments} GPS samples above 80 km/h`,
    });
  }
  if (nightDrivingMin > 20) {
    insights.push({
      id: "night",
      severity: "warn",
      title: "Night driving",
      detail: `${nightDrivingMin} min between 22:00–05:00`,
    });
  }
  if (frequentLocations.length >= 2) {
    insights.push({
      id: "frequent",
      severity: "info",
      title: "Repeated locations",
      detail: `${frequentLocations.length} dense clusters — possible home/work anchors`,
    });
  }

  const summaryParts = [
    `${points.length} GPS samples`,
    stops.length ? `${stops.length} stop(s)` : "no long stops",
    nightDrivingMin ? `${nightDrivingMin} min at night` : null,
    overspeedSegments > 5 ? "overspeed detected" : null,
  ].filter(Boolean);

  return {
    stops,
    overspeedSegments,
    nightDrivingMin,
    frequentLocations,
    insights,
    summary: summaryParts.join(" · "),
  };
}

/** Douglas–Peucker simplification for large trails (map perf). */
export function simplifyTrail(points: GpsPoint[], toleranceM = 15): GpsPoint[] {
  if (points.length <= 2) return points;

  function perpDistance(p: GpsPoint, a: GpsPoint, b: GpsPoint): number {
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    if (dx === 0 && dy === 0) return haversineM(p, a);
    const t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy);
    const proj = {
      lat: a.lat + t * dy,
      lng: a.lng + t * dx,
    };
    return haversineM(p, proj);
  }

  function dp(pts: GpsPoint[], eps: number): GpsPoint[] {
    if (pts.length <= 2) return pts;
    let maxD = 0;
    let idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perpDistance(pts[i], pts[0], pts[pts.length - 1]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps) {
      const left = dp(pts.slice(0, idx + 1), eps);
      const right = dp(pts.slice(idx), eps);
      return [...left.slice(0, -1), ...right];
    }
    return [pts[0], pts[pts.length - 1]];
  }

  return dp(points, toleranceM);
}

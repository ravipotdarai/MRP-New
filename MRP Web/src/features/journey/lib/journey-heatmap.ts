import type { GpsPoint } from "../types";

export type HeatCell = {
  lat: number;
  lng: number;
  intensity: number;
};

/** Grid density heatmap cells for Leaflet.heat ([lat, lng, weight]). */
export function buildHeatGrid(points: GpsPoint[], cellDeg = 0.0015): HeatCell[] {
  const grid = new Map<string, { lat: number; lng: number; n: number }>();
  for (const p of points) {
    const gx = Math.round(p.lat / cellDeg);
    const gy = Math.round(p.lng / cellDeg);
    const key = `${gx}:${gy}`;
    const cur = grid.get(key) || { lat: p.lat, lng: p.lng, n: 0 };
    cur.n += 1;
    grid.set(key, cur);
  }
  const max = Math.max(1, ...[...grid.values()].map((c) => c.n));
  return [...grid.values()].map((c) => ({
    lat: c.lat,
    lng: c.lng,
    intensity: c.n / max,
  }));
}

export function heatLatLngTuples(cells: HeatCell[]): [number, number, number][] {
  return cells.map((c) => [c.lat, c.lng, c.intensity]);
}

/** Aggregate heat from multiple day indexes (weekly/monthly) without full point download. */
export function mergeHeatGrids(grids: HeatCell[][]): HeatCell[] {
  const merged = new Map<string, HeatCell>();
  for (const grid of grids) {
    for (const c of grid) {
      const key = `${c.lat.toFixed(4)}:${c.lng.toFixed(4)}`;
      const cur = merged.get(key) || { ...c, intensity: 0 };
      cur.intensity += c.intensity;
      merged.set(key, cur);
    }
  }
  const max = Math.max(1, ...[...merged.values()].map((c) => c.intensity));
  return [...merged.values()].map((c) => ({ ...c, intensity: c.intensity / max }));
}

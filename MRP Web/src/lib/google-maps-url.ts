/**
 * Browser-friendly Google Maps deep links (search + directions).
 * Avoids Maps Actions (`map_action=map`) which often ignore path/center in desktop browsers.
 */

export type LatLng = { lat: number; lng: number };

function valid(p: LatLng | null | undefined): p is LatLng {
  return (
    !!p &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

function fmt(p: LatLng): string {
  return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

/** Single pin / current location. */
export function googleMapsSearchUrl(point: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fmt(point))}`;
}

/**
 * Directions along a travel path.
 * Google allows a limited number of waypoints — we decimate long trails.
 */
export function googleMapsDirUrl(points: LatLng[], opts?: { maxWaypoints?: number }): string {
  const clean = points.filter(valid);
  if (clean.length === 0) return "https://www.google.com/maps";
  if (clean.length === 1) return googleMapsSearchUrl(clean[0]!);

  const maxWp = Math.max(0, opts?.maxWaypoints ?? 8);
  const origin = clean[0]!;
  const dest = clean[clean.length - 1]!;
  const mid = clean.slice(1, -1);
  const waypoints = decimate(mid, maxWp);

  const params = new URLSearchParams({
    api: "1",
    origin: fmt(origin),
    destination: fmt(dest),
    travelmode: "driving",
  });
  if (waypoints.length) {
    params.set("waypoints", waypoints.map(fmt).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Prefer a path when available; otherwise a single point. */
export function googleMapsOpenUrl(opts: {
  point?: LatLng | null;
  path?: LatLng[] | null;
}): string {
  const path = (opts.path || []).filter(valid);
  if (path.length >= 2) return googleMapsDirUrl(path);
  if (path.length === 1) return googleMapsSearchUrl(path[0]!);
  if (valid(opts.point)) return googleMapsSearchUrl(opts.point);
  return "https://www.google.com/maps";
}

function decimate(pts: LatLng[], max: number): LatLng[] {
  if (pts.length <= max) return pts;
  if (max <= 0) return [];
  const out: LatLng[] = [];
  const step = (pts.length - 1) / max;
  for (let i = 0; i < max; i++) {
    out.push(pts[Math.round(i * step)]!);
  }
  return out;
}

export type NearestZone = {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  enabled?: boolean;
};

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Closest zone by distance past the fence edge (`d - radius`). */
export function nearestGeofenceName(
  lat: number,
  lng: number,
  zones: NearestZone[],
): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) < 1e-7 && Math.abs(lng) < 1e-7) return null;
  let bestName: string | null = null;
  let bestEdge = Number.POSITIVE_INFINITY;
  for (const zone of zones) {
    if (zone.enabled === false) continue;
    const d = haversineMeters(lat, lng, zone.latitude, zone.longitude);
    const edge = d - (Number(zone.radiusMeters) || 0);
    if (edge < bestEdge) {
      bestEdge = edge;
      bestName = (zone.name || '').trim() || null;
    }
  }
  return bestName;
}

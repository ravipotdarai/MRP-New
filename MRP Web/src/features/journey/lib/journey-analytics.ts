import type { GpsDayIndex, GpsPoint } from "../types";

export type JourneyEventRow = Record<string, unknown>;

export type DayAnalytics = {
  distanceKm: number;
  movingMin: number;
  idleMin: number;
  durationMin: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  stopCount: number;
  unlockCount: number;
  lockCount: number;
  geofenceEnter: number;
  geofenceExit: number;
  simEvents: number;
  networkEvents: number;
  chargingEvents: number;
  mediaCount: number;
  pointCount: number;
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function eventKind(type: string): string {
  return type.toUpperCase().replace(/\s+/g, "_");
}

export function computeDayAnalytics(
  points: GpsPoint[],
  index: GpsDayIndex | null,
  events: JourneyEventRow[],
  eventTypeOf: (r: JourneyEventRow) => string,
  mediaCount = 0,
): DayAnalytics {
  let distanceKm = index ? index.distanceM / 1000 : 0;
  if (!index && points.length > 1) {
    for (let i = 1; i < points.length; i++) {
      distanceKm += haversineKm(points[i - 1], points[i]);
    }
  }

  const spanMs =
    points.length >= 2 ? points[points.length - 1].t - points[0].t : index?.journeyEnd && index?.journeyStart
      ? index.journeyEnd - index.journeyStart
      : 0;

  let unlockCount = 0;
  let lockCount = 0;
  let geofenceEnter = 0;
  let geofenceExit = 0;
  let simEvents = 0;
  let networkEvents = 0;
  let chargingEvents = 0;

  for (const e of events) {
    const t = eventKind(eventTypeOf(e));
    if (t.includes("UNLOCK") && !t.includes("FAILED")) unlockCount++;
    if (t.includes("LOCK") || t.includes("SCREEN_LOCK")) lockCount++;
    if (t.includes("GEOFENCE_ENTER")) geofenceEnter++;
    if (t.includes("GEOFENCE_EXIT")) geofenceExit++;
    if (t.includes("SIM")) simEvents++;
    if (t.includes("WIFI") || t.includes("MOBILE_DATA") || t.includes("NETWORK") || t.includes("AIRPLANE"))
      networkEvents++;
    if (t.includes("CHARG") || t.includes("USB_CONNECTED")) chargingEvents++;
  }

  return {
    distanceKm,
    movingMin: index ? Math.round(index.movingMs / 60000) : 0,
    idleMin: index ? Math.round(index.idleMs / 60000) : 0,
    durationMin: Math.round(spanMs / 60000),
    maxSpeedKmh: index ? index.maxSpeed * 3.6 : Math.max(0, ...points.map((p) => (p.s ?? 0) * 3.6)),
    avgSpeedKmh: index ? index.avgSpeed * 3.6 : 0,
    stopCount: index?.stopCount ?? 0,
    unlockCount,
    lockCount,
    geofenceEnter,
    geofenceExit,
    simEvents,
    networkEvents,
    chargingEvents,
    mediaCount: index?.mediaCount ?? mediaCount,
    pointCount: points.length,
  };
}

export function fenceAtPoint(
  lat: number,
  lng: number,
  fences: Array<{ id: string; lat: number; lng: number; radiusMeters: number; name?: string }>,
): { id: string; name?: string } | null {
  for (const f of fences) {
    const d = haversineKm({ lat, lng }, { lat: f.lat, lng: f.lng }) * 1000;
    if (d <= f.radiusMeters) return { id: f.id, name: f.name };
  }
  return null;
}

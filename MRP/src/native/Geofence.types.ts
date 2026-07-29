import {NativeModules} from 'react-native';

export type GeofenceZone = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  enabled: boolean;
};

export type GeofenceEval = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  locationTier?: string;
  address?: string;
  country?: string;
  state?: string;
  city?: string;
  postalCode?: string;
  insideGeofence: boolean;
  geofenceId?: string;
  geofenceName?: string;
  distanceToFenceM: number;
};

type Native = {
  listZones(): Promise<GeofenceZone[]>;
  upsertZone(
    id: string | null,
    name: string,
    latitude: number,
    longitude: number,
    radiusMeters: number,
    enabled: boolean,
  ): Promise<string>;
  removeZone(id: string): Promise<boolean>;
  evaluateHere(): Promise<GeofenceEval | null>;
  getCurrentLocationForZone(): Promise<{
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    locationTier?: string;
    address?: string;
  } | null>;
  distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): Promise<number>;
};

const native = NativeModules.MrpGeofence as Native | undefined;

export async function listGeofenceZones(): Promise<GeofenceZone[]> {
  if (!native?.listZones) return [];
  return native.listZones();
}

export async function upsertGeofenceZone(
  zone: Partial<GeofenceZone> & {
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
  },
): Promise<string> {
  if (!native?.upsertZone) throw new Error('Geofence module missing');
  return native.upsertZone(
    zone.id || null,
    zone.name,
    zone.latitude,
    zone.longitude,
    zone.radiusMeters,
    zone.enabled !== false,
  );
}

export async function removeGeofenceZone(id: string): Promise<boolean> {
  if (!native?.removeZone) return false;
  return native.removeZone(id);
}

export async function evaluateGeofenceHere(): Promise<GeofenceEval | null> {
  if (!native?.evaluateHere) return null;
  return native.evaluateHere();
}

export async function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): Promise<number> {
  if (!native?.distanceMeters) {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  return native.distanceMeters(lat1, lng1, lat2, lng2);
}

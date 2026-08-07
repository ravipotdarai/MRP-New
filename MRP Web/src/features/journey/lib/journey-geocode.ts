import { apiPost } from "@/lib/api";

export type ReverseGeocode = {
  lat: number;
  lng: number;
  displayName: string;
  address: {
    road?: string;
    suburb?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
};

export type NearbyPlace = {
  name: string;
  category: string;
  lat: number;
  lng: number;
  distanceM: number;
  direction: string;
};

const addrCache = new Map<string, ReverseGeocode>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)}:${lng.toFixed(4)}`;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  token: string | null,
): Promise<ReverseGeocode | null> {
  const key = cacheKey(lat, lng);
  const hit = addrCache.get(key);
  if (hit) return hit;
  const res = await apiPost<ReverseGeocode>("/geocoding/reverse", { lat, lng }, token);
  if (!res.ok || !res.data) return null;
  addrCache.set(key, res.data);
  return res.data;
}

export async function nearbyPlaces(
  lat: number,
  lng: number,
  token: string | null,
  radiusM = 800,
  categories?: string[],
): Promise<NearbyPlace[]> {
  const res = await apiPost<{ places: NearbyPlace[] }>(
    "/geocoding/nearby",
    { lat, lng, radiusM, categories },
    token,
  );
  if (!res.ok || !res.data) return [];
  return res.data.places || [];
}

export function formatAddress(geo: ReverseGeocode | null): string {
  if (!geo) return "—";
  if (geo.displayName) return geo.displayName;
  const a = geo.address;
  return [a.road, a.suburb, a.city, a.state, a.country].filter(Boolean).join(", ") || "—";
}

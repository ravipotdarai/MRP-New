/**
 * Same-device demo: simulated peers start ~10 km from the phone and approach it.
 * Points are local-only (not written to Firebase as fake UIDs).
 */

export type SimLatLng = {latitude: number; longitude: number};

/** ~10 km in meters */
export const PEER_START_DISTANCE_M = 10_000;

/** Bearings (degrees clockwise from north) so peers fan out around the phone. */
const BEARINGS_DEG = [0, 72, 144, 216, 288, 36, 108, 180];

const EARTH_R_M = 6_371_000;

export function offsetByBearing(
  origin: SimLatLng,
  bearingDeg: number,
  distanceM: number,
): SimLatLng {
  const δ = distanceM / EARTH_R_M;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (origin.latitude * Math.PI) / 180;
  const λ1 = (origin.longitude * Math.PI) / 180;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return {
    latitude: (φ2 * 180) / Math.PI,
    longitude: (((λ2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

export function lerpLatLng(a: SimLatLng, b: SimLatLng, t: number): SimLatLng {
  const u = Math.max(0, Math.min(1, t));
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * u,
    longitude: a.longitude + (b.longitude - a.longitude) * u,
  };
}

export function peerStartLocation(
  phone: SimLatLng,
  peerOrdinal: number,
): SimLatLng {
  const bearing = BEARINGS_DEG[Math.abs(peerOrdinal) % BEARINGS_DEG.length];
  return offsetByBearing(phone, bearing, PEER_START_DISTANCE_M);
}

/** Display names by category for demo peers. */
export function peerDisplayName(
  category: string,
  ordinal: number,
): string {
  const n = ordinal + 1;
  switch (category) {
    case 'one_to_one':
      return `Partner ${n}`;
    case 'friend':
      return `Friend ${n}`;
    case 'friends_group':
      return `Friend ${n}`;
    case 'family':
      return `Family ${n}`;
    case 'peer':
      return `Peer ${n}`;
    default:
      return `Peer ${n}`;
  }
}

/** How many demo peers to seed per category (within maxMembers - 1). */
export function demoPeerCount(category: string, maxMembers: number): number {
  const slots = Math.max(0, maxMembers - 1);
  switch (category) {
    case 'one_to_one':
    case 'friend':
      return Math.min(1, slots);
    case 'friends_group':
      return Math.min(3, slots);
    case 'family':
      return Math.min(2, slots);
    case 'peer':
      return Math.min(2, slots);
    default:
      return Math.min(1, slots);
  }
}

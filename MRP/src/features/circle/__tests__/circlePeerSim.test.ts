import {
  demoPeerCount,
  lerpLatLng,
  offsetByBearing,
  peerDisplayName,
  peerStartLocation,
  PEER_START_DISTANCE_M,
} from '../circlePeerSim';

describe('circlePeerSim', () => {
  const phone = {latitude: 18.5204, longitude: 73.8567};

  it('offsets ~10 km from phone', () => {
    const start = peerStartLocation(phone, 0);
    const dLat = ((start.latitude - phone.latitude) * Math.PI) / 180;
    const dLng = ((start.longitude - phone.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((phone.latitude * Math.PI) / 180) *
        Math.cos((start.latitude * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const distM = 2 * 6_371_000 * Math.asin(Math.sqrt(a));
    expect(distM).toBeGreaterThan(PEER_START_DISTANCE_M * 0.98);
    expect(distM).toBeLessThan(PEER_START_DISTANCE_M * 1.02);
  });

  it('lerp ends at phone when t=1', () => {
    const start = offsetByBearing(phone, 90, PEER_START_DISTANCE_M);
    const end = lerpLatLng(start, phone, 1);
    expect(end.latitude).toBeCloseTo(phone.latitude, 6);
    expect(end.longitude).toBeCloseTo(phone.longitude, 6);
  });

  it('names and counts by category', () => {
    expect(peerDisplayName('family', 0)).toBe('Family 1');
    expect(peerDisplayName('friend', 0)).toBe('Friend 1');
    expect(demoPeerCount('one_to_one', 2)).toBe(1);
    expect(demoPeerCount('friends_group', 10)).toBe(3);
  });
});

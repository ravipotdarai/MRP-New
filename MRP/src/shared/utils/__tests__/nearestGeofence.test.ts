import {nearestGeofenceName} from '../nearestGeofence';

const home = {
  name: 'Home',
  latitude: 18.52,
  longitude: 73.85,
  radiusMeters: 100,
};
const office = {
  name: 'Office',
  latitude: 18.53,
  longitude: 73.86,
  radiusMeters: 80,
};

describe('nearestGeofenceName', () => {
  it('returns the nearest zone when outside all fences', () => {
    // Closer to Office edge than Home.
    const name = nearestGeofenceName(18.531, 73.861, [home, office]);
    expect(name).toBe('Office');
  });

  it('skips disabled zones', () => {
    const name = nearestGeofenceName(18.531, 73.861, [
      home,
      {...office, enabled: false},
    ]);
    expect(name).toBe('Home');
  });

  it('returns null for missing coordinates', () => {
    expect(nearestGeofenceName(0, 0, [home])).toBeNull();
  });
});

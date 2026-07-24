import {CIRCLE_CATEGORIES, createLocalCircle, getCircleCategory} from '../circleCatalog';
import {buildCircleMapUris, pinStyle} from '../circleMapUrls';

describe('circleMapUrls', () => {
  it('builds multi-pin URLs with distinct colors', () => {
    const uris = buildCircleMapUris([
      {id: 'a', displayName: 'A', latitude: 28.6, longitude: 77.2, colorIndex: 0},
      {id: 'b', displayName: 'B', latitude: 28.61, longitude: 77.21, colorIndex: 1},
    ]);
    expect(uris.length).toBeGreaterThanOrEqual(2);
    expect(uris[0]).toContain('static-maps.yandex');
    expect(uris[0]).toContain('pm2rdm');
    expect(uris[0]).toContain('pm2blm');
    expect(uris[1]).toContain('openstreetmap');
    expect(pinStyle(0).key).toBe('red');
    expect(pinStyle(1).key).toBe('blue');
  });
});

describe('circleCatalog still exports categories', () => {
  it('has five categories', () => {
    expect(CIRCLE_CATEGORIES).toHaveLength(5);
    expect(getCircleCategory('peer')?.maxMembers).toBe(6);
    expect(createLocalCircle({name: 'X', category: 'friend'}).ok).toBe(true);
  });
});

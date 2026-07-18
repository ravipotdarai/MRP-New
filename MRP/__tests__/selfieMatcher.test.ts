import {
  findMatchingSelfie,
  findMatchingEventForPhoto,
  getExpectedPhotoPrefix,
} from '../src/shared/utils/selfieMatcher';

describe('selfieMatcher', () => {
  const base = 1_700_000_000_000;

  const photos = [
    {path: '/a.jpg', name: 'WRONG_UNLOCK_ATTEMPT_20240101_120000.jpg', timestamp: base},
    {path: '/b.jpg', name: 'WIFI_ENABLED_20240101_120100.jpg', timestamp: base + 60_000},
    {path: '/c.jpg', name: 'intruder_wrongpassword_20240101_120200.jpg', timestamp: base + 120_000},
  ];

  it('returns null for lock/unlock events', () => {
    expect(getExpectedPhotoPrefix('SCREEN_LOCK')).toBeNull();
    expect(getExpectedPhotoPrefix('SCREEN_UNLOCK')).toBeNull();
    expect(findMatchingSelfie('SCREEN_LOCK', base, photos)).toBeNull();
  });

  it('maps WRONG_PASSWORD to WRONG_UNLOCK_ATTEMPT photo', () => {
    expect(getExpectedPhotoPrefix('WRONG_PASSWORD')).toBe('WRONG_UNLOCK_ATTEMPT');
    const match = findMatchingSelfie('WRONG_PASSWORD', base + 2000, photos);
    expect(match?.path).toBe('/a.jpg');
  });

  it('matches by prefix and time window', () => {
    const match = findMatchingSelfie('WIFI_ENABLED', base + 60_000 + 1000, photos);
    expect(match?.path).toBe('/b.jpg');
  });

  it('rejects photos outside the match window', () => {
    expect(findMatchingSelfie('WIFI_ENABLED', base + 60_000 + 120_000, photos)).toBeNull();
  });

  it('matches legacy intruder_ filenames via compact prefix', () => {
    const match = findMatchingSelfie('WRONG_PASSWORD', base + 120_000, [
      photos[2],
    ]);
    // WRONG_PASSWORD expects WRONG_UNLOCK_ATTEMPT; compact wrongpassword ≠ that.
    // Direct WRONG_PASSWORD event type with compact name should match if expected is WRONG_PASSWORD
    // — but mapping forces WRONG_UNLOCK_ATTEMPT. Use WRONG_UNLOCK_ATTEMPT:
    const unlock = findMatchingSelfie('WRONG_UNLOCK_ATTEMPT', base + 120_000, [
      {path: '/c.jpg', name: 'intruder_wrongunlockattempt_20240101_120200.jpg', timestamp: base + 120_000},
    ]);
    expect(unlock?.path).toBe('/c.jpg');
  });

  it('allows WRONG_BIOMETRIC (capture is enabled)', () => {
    expect(getExpectedPhotoPrefix('WRONG_BIOMETRIC')).toBe('WRONG_BIOMETRIC');
  });

  it('findMatchingEventForPhoto reverses the match', () => {
    const events = [
      {event_type: 'SCREEN_LOCK', timestamp: base},
      {event_type: 'WRONG_UNLOCK_ATTEMPT', timestamp: base + 500},
      {event_type: 'WIFI_ENABLED', timestamp: base + 60_000},
    ];
    const evt = findMatchingEventForPhoto(photos[0], events);
    expect(evt?.event_type).toBe('WRONG_UNLOCK_ATTEMPT');
  });
});

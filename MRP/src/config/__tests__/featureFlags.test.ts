/**
 * Unit tests for product feature flags (v1 Circle off).
 */
import {
  CIRCLE_ENABLED,
  CIRCLE_INVITE_LANDING_ENABLED,
  QR_PROTECTION_ENABLED,
  SMS_AUTO_SCAN_ENABLED,
} from '../featureFlags';

describe('featureFlags', () => {
  it('keeps Circle disabled for store v1', () => {
    expect(CIRCLE_ENABLED).toBe(false);
  });

  it('keeps invite landing disabled by default', () => {
    expect(CIRCLE_INVITE_LANDING_ENABLED).toBe(false);
  });

  it('keeps SMS auto-scan flagged off pending policy review', () => {
    expect(SMS_AUTO_SCAN_ENABLED).toBe(false);
  });

  it('keeps QR Protection off by default (battery / low priority)', () => {
    expect(QR_PROTECTION_ENABLED).toBe(false);
  });
});

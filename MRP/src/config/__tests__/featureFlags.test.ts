/**
 * Unit tests for product feature flags (v1 Circle off).
 */
import {CIRCLE_ENABLED, CIRCLE_INVITE_LANDING_ENABLED} from '../featureFlags';

describe('featureFlags', () => {
  it('keeps Circle disabled for store v1', () => {
    expect(CIRCLE_ENABLED).toBe(false);
  });

  it('keeps invite landing disabled by default', () => {
    expect(CIRCLE_INVITE_LANDING_ENABLED).toBe(false);
  });
});

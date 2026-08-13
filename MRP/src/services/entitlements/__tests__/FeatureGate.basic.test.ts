import {canUse, getCaps} from '../FeatureGate';
import {EntitlementSnapshot} from '../EntitlementTypes';

const base: EntitlementSnapshot = {
  tier: 'free',
  source: 'none',
  expiryEpochMs: 0,
  lastVerifiedAt: Date.now(),
  graceUntilEpochMs: 0,
  offline: false,
};

const basicActive: EntitlementSnapshot = {
  ...base,
  tier: 'basic',
  source: 'hardcoded',
  expiryEpochMs: Date.now() + 86400000,
};

describe('FeatureGate basic tier', () => {
  it('allows clipboard and breach on basic', () => {
    expect(canUse('digitalsafe.clipboard_scan', basicActive)).toBe(true);
    expect(canUse('digitalsafe.breach_monitor', basicActive)).toBe(true);
    expect(canUse('digitalsafe.network_guardian', basicActive)).toBe(false);
  });

  it('returns basic caps', () => {
    expect(getCaps('basic').timelineDays).toBe(30);
    expect(getCaps('basic').maxVaultItems).toBe(5);
  });
});

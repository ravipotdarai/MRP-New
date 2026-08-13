import {canUse, canUseCapability} from '../../../services/entitlements/FeatureGate';
import type {EntitlementSnapshot} from '../../../services/entitlements/EntitlementTypes';

const free: EntitlementSnapshot = {
  tier: 'free',
  source: 'none',
  expiryEpochMs: 0,
  lastVerifiedAt: Date.now(),
  graceUntilEpochMs: 0,
  offline: false,
};

const basic: EntitlementSnapshot = {
  ...free,
  tier: 'basic',
  source: 'hardcoded',
  expiryEpochMs: Date.now() + 86_400_000,
};

const premium: EntitlementSnapshot = {
  ...free,
  tier: 'premium',
  source: 'hardcoded',
  expiryEpochMs: Date.now() + 86_400_000,
};

describe('Safe Link / automation entitlement matrix', () => {
  it('keeps share + manual free; clipboard/breach gated', () => {
    expect(canUseCapability('safeLinkManual', free)).toBe(true);
    expect(canUseCapability('safeLinkShare', free)).toBe(true);
    expect(canUse('digitalsafe.clipboard_scan', free)).toBe(false);
    expect(canUse('digitalsafe.breach_monitor', free)).toBe(false);
    expect(canUse('digitalsafe.clipboard_scan', basic)).toBe(true);
    expect(canUse('digitalsafe.breach_monitor', basic)).toBe(true);
  });

  it('gates guardian and vault backup at premium', () => {
    expect(canUse('digitalsafe.network_guardian', basic)).toBe(false);
    expect(canUse('digitalsafe.network_guardian', premium)).toBe(true);
    expect(canUse('digitalsafe.secure_vault', basic)).toBe(true);
    expect(canUse('digitalsafe.secure_vault_backup', basic)).toBe(false);
    expect(canUse('digitalsafe.secure_vault_backup', premium)).toBe(true);
  });

  it('gates sim recovery and lost mobile from free', () => {
    expect(canUse('digitalsafe.sim_recovery', free)).toBe(false);
    expect(canUse('digitalsafe.lost_mobile', free)).toBe(false);
    expect(canUse('digitalsafe.sim_recovery', basic)).toBe(true);
  });
});

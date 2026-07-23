import {
  canUse,
  effectiveTier,
  getCaps,
  requireEntitlement,
} from '../FeatureGate';
import {EntitlementSnapshot} from '../EntitlementTypes';

const free: EntitlementSnapshot = {
  tier: 'free',
  source: 'none',
  expiryEpochMs: 0,
  lastVerifiedAt: Date.now(),
  graceUntilEpochMs: 0,
  offline: false,
};

const premiumActive: EntitlementSnapshot = {
  ...free,
  tier: 'premium',
  source: 'play',
  expiryEpochMs: Date.now() + 86400000,
};

const enterpriseActive: EntitlementSnapshot = {
  ...free,
  tier: 'enterprise',
  source: 'play',
  expiryEpochMs: Date.now() + 86400000,
};

const premiumInGrace: EntitlementSnapshot = {
  ...free,
  tier: 'premium',
  source: 'play',
  expiryEpochMs: Date.now() - 1000,
  graceUntilEpochMs: Date.now() + 86400000,
};

const premiumGraceExpired: EntitlementSnapshot = {
  ...free,
  tier: 'premium',
  source: 'play',
  expiryEpochMs: Date.now() - 86400000,
  graceUntilEpochMs: Date.now() - 1000,
};

describe('FeatureGate', () => {
  it('allows core features on free', () => {
    expect(canUse('sim.sms.full' as any, free)).toBe(false);
    expect(requireEntitlement('reports.export', free).ok).toBe(false);
  });

  it('unlocks premium features for premium', () => {
    expect(canUse('cloud.sync', premiumActive)).toBe(true);
    expect(canUse('reports.export', premiumActive)).toBe(true);
    expect(canUse('circle.family', premiumActive)).toBe(false);
  });

  it('unlocks Circle only for enterprise', () => {
    expect(canUse('circle.one_to_one', enterpriseActive)).toBe(true);
    expect(canUse('circle.live.web', enterpriseActive)).toBe(true);
    expect(requireEntitlement('circle.peer', premiumActive).ok).toBe(false);
  });

  it('keeps paid tier during grace', () => {
    expect(effectiveTier(premiumInGrace)).toBe('premium');
    expect(canUse('cloud.sync', premiumInGrace)).toBe(true);
  });

  it('downgrades after grace expires', () => {
    expect(effectiveTier(premiumGraceExpired)).toBe('free');
    expect(canUse('cloud.sync', premiumGraceExpired)).toBe(false);
  });

  it('returns Free caps', () => {
    expect(getCaps('free').simContacts).toBe(1);
    expect(getCaps('free').timelineDays).toBe(7);
    expect(getCaps('premium').simContacts).toBe(5);
    expect(getCaps('enterprise').circleLive).toBe(true);
  });
});

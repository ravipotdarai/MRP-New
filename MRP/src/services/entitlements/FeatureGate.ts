import {
  EntitlementSnapshot,
  SubscriptionTier,
  defaultFreeSnapshot,
} from './EntitlementTypes';
import {
  capabilityForFeature,
  hasCapability,
  hasFullCapability,
  TIMELINE_RETENTION_DAYS,
  type DigitalSafetyCapability,
} from './DigitalSafetyCapabilityMatrix';

export type FeatureKey =
  | 'timeline.retention.extended'
  | 'photos.storage.full'
  | 'photos.retention.custom'
  | 'sim.contacts.multi'
  | 'sim.sms.full'
  | 'appusage.history.full'
  | 'appusage.export'
  | 'appsafety.full'
  | 'reports.export'
  | 'geofence'
  | 'journey.playback'
  | 'push.alerts'
  | 'cloud.sync'
  | 'circle.one_to_one'
  | 'circle.friend'
  | 'circle.friends_group'
  | 'circle.family'
  | 'circle.peer'
  | 'circle.live.web'
  | 'enterprise.fleet'
  | 'digitalsafe.secure_vault'
  | 'digitalsafe.secure_vault_backup'
  | 'digitalsafe.network_guardian'
  | 'digitalsafe.cellular_monitor'
  | 'digitalsafe.sms_auto'
  | 'digitalsafe.clipboard_scan'
  | 'digitalsafe.breach_monitor'
  | 'digitalsafe.sim_recovery'
  | 'digitalsafe.lost_mobile';

export type Caps = {
  timelineDays: number;
  maxSelfies: number;
  photoRetentionDays: number;
  simContacts: number;
  appUsageDays: number;
  reportsExport: boolean;
  circleLive: boolean;
  cloudSync: boolean;
  maxVaultItems: number;
};

const PREMIUM_PLUS_FEATURES = new Set<FeatureKey>([
  'timeline.retention.extended',
  'photos.storage.full',
  'photos.retention.custom',
  'sim.contacts.multi',
  'sim.sms.full',
  'appusage.history.full',
  'appusage.export',
  'appsafety.full',
  'reports.export',
  'geofence',
  'journey.playback',
  'push.alerts',
  'cloud.sync',
  'digitalsafe.secure_vault_backup',
  'digitalsafe.network_guardian',
  'digitalsafe.sms_auto',
]);

const BASIC_PLUS_FEATURES = new Set<FeatureKey>([
  'digitalsafe.clipboard_scan',
  'digitalsafe.breach_monitor',
  'digitalsafe.cellular_monitor',
  'digitalsafe.secure_vault',
  'digitalsafe.sim_recovery',
  'digitalsafe.lost_mobile',
]);

const ENTERPRISE_ONLY = new Set<FeatureKey>([
  'circle.one_to_one',
  'circle.friend',
  'circle.friends_group',
  'circle.family',
  'circle.peer',
  'circle.live.web',
  'enterprise.fleet',
]);

function effectiveTier(snapshot: EntitlementSnapshot, now = Date.now()): SubscriptionTier {
  if (snapshot.tier === 'free') {
    return 'free';
  }
  if (snapshot.expiryEpochMs > 0 && now <= snapshot.expiryEpochMs) {
    return snapshot.tier;
  }
  if (snapshot.graceUntilEpochMs > 0 && now <= snapshot.graceUntilEpochMs) {
    return snapshot.tier;
  }
  return 'free';
}

function tierRank(tier: SubscriptionTier): number {
  switch (tier) {
    case 'enterprise':
      return 5;
    case 'family':
      return 4;
    case 'premium':
      return 3;
    case 'basic':
      return 2;
    default:
      return 0;
  }
}

export function getCaps(tier: SubscriptionTier): Caps {
  const timelineDays = TIMELINE_RETENTION_DAYS[tier];
  switch (tier) {
    case 'enterprise':
      return {
        timelineDays,
        maxSelfies: Number.MAX_SAFE_INTEGER,
        photoRetentionDays: 365,
        simContacts: 20,
        appUsageDays: 365,
        reportsExport: true,
        circleLive: true,
        cloudSync: true,
        maxVaultItems: Number.MAX_SAFE_INTEGER,
      };
    case 'family':
    case 'premium':
      return {
        timelineDays,
        maxSelfies: 500,
        photoRetentionDays: 90,
        simContacts: 5,
        appUsageDays: 90,
        reportsExport: true,
        circleLive: false,
        cloudSync: true,
        maxVaultItems: Number.MAX_SAFE_INTEGER,
      };
    case 'basic':
      return {
        timelineDays,
        maxSelfies: 50,
        photoRetentionDays: 30,
        simContacts: 2,
        appUsageDays: 30,
        reportsExport: false,
        circleLive: false,
        cloudSync: true,
        maxVaultItems: 5,
      };
    default:
      return {
        timelineDays,
        maxSelfies: 20,
        photoRetentionDays: 7,
        simContacts: 1,
        appUsageDays: 7,
        reportsExport: false,
        circleLive: false,
        cloudSync: false,
        maxVaultItems: 0,
      };
  }
}

export function canUseCapability(
  cap: DigitalSafetyCapability,
  snapshot: EntitlementSnapshot = defaultFreeSnapshot(),
  now = Date.now(),
): boolean {
  return hasCapability(effectiveTier(snapshot, now), cap);
}

export function canUse(
  feature: FeatureKey,
  snapshot: EntitlementSnapshot = defaultFreeSnapshot(),
  now = Date.now(),
): boolean {
  const tier = effectiveTier(snapshot, now);
  const dsCap = capabilityForFeature(feature);
  if (dsCap) {
    return hasCapability(tier, dsCap);
  }
  if (ENTERPRISE_ONLY.has(feature)) {
    return tier === 'enterprise';
  }
  if (PREMIUM_PLUS_FEATURES.has(feature)) {
    return tierRank(tier) >= tierRank('premium');
  }
  if (BASIC_PLUS_FEATURES.has(feature)) {
    return tierRank(tier) >= tierRank('basic');
  }
  return true;
}

export function requireEntitlement(
  feature: FeatureKey,
  snapshot: EntitlementSnapshot = defaultFreeSnapshot(),
  now = Date.now(),
): {ok: true; tier: SubscriptionTier} | {ok: false; tier: SubscriptionTier; reason: string} {
  const tier = effectiveTier(snapshot, now);
  if (canUse(feature, snapshot, now)) {
    return {ok: true, tier};
  }
  if (ENTERPRISE_ONLY.has(feature)) {
    return {
      ok: false,
      tier,
      reason: 'Enterprise subscription required for Circle live share',
    };
  }
  if (BASIC_PLUS_FEATURES.has(feature)) {
    return {
      ok: false,
      tier,
      reason: 'Basic or higher subscription required',
    };
  }
  return {
    ok: false,
    tier,
    reason: 'Premium or higher subscription required',
  };
}

export function isPaidTier(tier: SubscriptionTier): boolean {
  return tier !== 'free';
}

export function isPremiumTier(tier: SubscriptionTier): boolean {
  return tierRank(tier) >= tierRank('premium');
}

export {effectiveTier, hasFullCapability};

import {
  EntitlementSnapshot,
  SubscriptionTier,
  defaultFreeSnapshot,
} from './EntitlementTypes';

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
  | 'push.alerts'
  | 'cloud.sync'
  | 'circle.one_to_one'
  | 'circle.friend'
  | 'circle.friends_group'
  | 'circle.family'
  | 'circle.peer'
  | 'circle.live.web'
  | 'enterprise.fleet';

export type Caps = {
  timelineDays: number;
  maxSelfies: number;
  photoRetentionDays: number;
  simContacts: number;
  appUsageDays: number;
  reportsExport: boolean;
  circleLive: boolean;
  cloudSync: boolean;
};

const PREMIUM_FEATURES = new Set<FeatureKey>([
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
  'push.alerts',
  'cloud.sync',
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
  if (snapshot.tier === 'free') return 'free';
  if (snapshot.expiryEpochMs > 0 && now <= snapshot.expiryEpochMs) {
    return snapshot.tier;
  }
  if (snapshot.graceUntilEpochMs > 0 && now <= snapshot.graceUntilEpochMs) {
    return snapshot.tier;
  }
  return 'free';
}

export function getCaps(tier: SubscriptionTier): Caps {
  switch (tier) {
    case 'enterprise':
      return {
        timelineDays: 365,
        maxSelfies: Number.MAX_SAFE_INTEGER,
        photoRetentionDays: 365,
        simContacts: 20,
        appUsageDays: 365,
        reportsExport: true,
        circleLive: true,
        cloudSync: true,
      };
    case 'premium':
    case 'family':
      return {
        timelineDays: 90,
        maxSelfies: 500,
        photoRetentionDays: 90,
        simContacts: 5,
        appUsageDays: 90,
        reportsExport: true,
        circleLive: false,
        cloudSync: true,
      };
    default:
      return {
        timelineDays: 7,
        maxSelfies: 20,
        photoRetentionDays: 7,
        simContacts: 1,
        appUsageDays: 7,
        reportsExport: false,
        circleLive: false,
        cloudSync: false,
      };
  }
}

export function canUse(
  feature: FeatureKey,
  snapshot: EntitlementSnapshot = defaultFreeSnapshot(),
  now = Date.now(),
): boolean {
  const tier = effectiveTier(snapshot, now);
  if (ENTERPRISE_ONLY.has(feature)) {
    return tier === 'enterprise';
  }
  if (PREMIUM_FEATURES.has(feature)) {
    return tier === 'premium' || tier === 'family' || tier === 'enterprise';
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
  return {
    ok: false,
    tier,
    reason: 'Premium or higher subscription required',
  };
}

export function isPaidTier(tier: SubscriptionTier): boolean {
  return tier === 'premium' || tier === 'family' || tier === 'enterprise';
}

export {effectiveTier};

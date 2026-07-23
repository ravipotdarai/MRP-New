/** Entitlement types — see SUBSCRIPTION_PLAN.md §4 */

export type SubscriptionTier = 'free' | 'premium' | 'family' | 'enterprise';

export type EntitlementSource =
  | 'none'
  | 'play'
  | 'family'
  | 'enterprise_key'
  | 'admin'
  | 'debug'
  | 'hardcoded';

export type EntitlementSnapshot = {
  tier: SubscriptionTier;
  source: EntitlementSource;
  productId?: string;
  expiryEpochMs: number;
  lastVerifiedAt: number;
  graceUntilEpochMs: number;
  offline: boolean;
};

export type ProductOffer = {
  productId: string;
  basePlanId: string;
  title: string;
  description: string;
  formattedPrice: string;
  billingPeriod: string;
};

export type PurchaseResult = {
  ok: boolean;
  snapshot: EntitlementSnapshot;
  message?: string;
};

export const PRODUCT_IDS = {
  premium: 'mrp_premium',
  family: 'mrp_premium_family',
  enterprise: 'mrp_enterprise',
} as const;

export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function defaultFreeSnapshot(): EntitlementSnapshot {
  return {
    tier: 'free',
    source: 'none',
    expiryEpochMs: 0,
    lastVerifiedAt: Date.now(),
    graceUntilEpochMs: 0,
    offline: false,
  };
}

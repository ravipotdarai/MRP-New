/** Subscription tier — wired to Play Billing / EntitlementProvider (P3). */
export type {SubscriptionTier} from '../../services/entitlements/EntitlementTypes';

import {useEntitlements} from '../../services/entitlements/EntitlementProvider';
import type {SubscriptionTier} from '../../services/entitlements/EntitlementTypes';

export function useSubscriptionTier(): {
  tier: SubscriptionTier;
  isPaid: boolean;
  loading: boolean;
} {
  const {tier, isPaid, loading} = useEntitlements();
  return {tier, isPaid, loading};
}

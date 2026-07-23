import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import MrpBilling from '../../native/Billing.types';
import {
  EntitlementSnapshot,
  ProductOffer,
  PurchaseResult,
  SubscriptionTier,
  defaultFreeSnapshot,
} from './EntitlementTypes';
import {canUse, getCaps, Caps, FeatureKey, isPaidTier, requireEntitlement} from './FeatureGate';
import {
  catalogToProductOffers,
  getSubscriptionsCatalog,
  isHardcodedBillingMode,
} from '../../features/subscription/subscriptionCatalog';

type EntitlementContextValue = {
  snapshot: EntitlementSnapshot;
  tier: SubscriptionTier;
  isPaid: boolean;
  loading: boolean;
  offers: ProductOffer[];
  caps: Caps;
  billingMode: 'hardcoded' | 'play';
  refresh: () => Promise<void>;
  purchase: (productId: string, basePlanId: string) => Promise<PurchaseResult>;
  restore: () => Promise<void>;
  activateEnterpriseKey: (key: string) => Promise<void>;
  openManage: () => Promise<void>;
  canUseFeature: (feature: FeatureKey) => boolean;
  gate: (feature: FeatureKey) => ReturnType<typeof requireEntitlement>;
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function EntitlementProvider({children}: {children: React.ReactNode}) {
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot>(defaultFreeSnapshot());
  const [offers, setOffers] = useState<ProductOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const billingMode = getSubscriptionsCatalog().mode;

  const refresh = useCallback(async () => {
    if (!MrpBilling) {
      setSnapshot(defaultFreeSnapshot());
      setOffers(isHardcodedBillingMode() ? catalogToProductOffers() : []);
      return;
    }
    try {
      const snap = await MrpBilling.refreshEntitlements();
      setSnapshot(snap);
      if (isHardcodedBillingMode()) {
        setOffers(catalogToProductOffers());
      } else {
        const products = await MrpBilling.getProductOffers().catch(() => [] as ProductOffer[]);
        setOffers(products.length > 0 ? products : catalogToProductOffers());
      }
    } catch (e) {
      console.warn('[Entitlement] refresh failed', e);
      try {
        const snap = await MrpBilling.getEntitlementSnapshot();
        setSnapshot(snap);
      } catch {
        // keep last
      }
      if (isHardcodedBillingMode()) {
        setOffers(catalogToProductOffers());
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const purchase = useCallback(
    async (productId: string, basePlanId: string) => {
      if (!MrpBilling) {
        return {ok: false, snapshot, message: 'Billing not available'};
      }
      if (isHardcodedBillingMode() && MrpBilling.activateCatalogProduct) {
        const result = await MrpBilling.activateCatalogProduct(productId, basePlanId);
        setSnapshot(result.snapshot);
        return result;
      }
      const result = await MrpBilling.purchase(productId, basePlanId);
      setSnapshot(result.snapshot);
      return result;
    },
    [snapshot],
  );

  const restore = useCallback(async () => {
    if (!MrpBilling) return;
    if (isHardcodedBillingMode()) {
      const snap = await MrpBilling.getEntitlementSnapshot();
      setSnapshot(snap);
      return;
    }
    const snap = await MrpBilling.restorePurchases();
    setSnapshot(snap);
  }, []);

  const activateEnterpriseKey = useCallback(async (key: string) => {
    if (!MrpBilling) throw new Error('Billing not available');
    const snap = await MrpBilling.activateEnterpriseKey(key);
    setSnapshot(snap);
  }, []);

  const openManage = useCallback(async () => {
    if (!MrpBilling) return;
    await MrpBilling.openPlaySubscriptionManagement();
  }, []);

  const value = useMemo<EntitlementContextValue>(() => {
    const tier = snapshot.tier;
    return {
      snapshot,
      tier,
      isPaid: isPaidTier(tier),
      loading,
      offers,
      caps: getCaps(tier),
      billingMode,
      refresh,
      purchase,
      restore,
      activateEnterpriseKey,
      openManage,
      canUseFeature: (feature: FeatureKey) => canUse(feature, snapshot),
      gate: (feature: FeatureKey) => requireEntitlement(feature, snapshot),
    };
  }, [
    snapshot,
    loading,
    offers,
    billingMode,
    refresh,
    purchase,
    restore,
    activateEnterpriseKey,
    openManage,
  ]);

  return (
    <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>
  );
}

export function useEntitlements() {
  const ctx = useContext(EntitlementContext);
  if (!ctx) throw new Error('useEntitlements must be used within EntitlementProvider');
  return ctx;
}

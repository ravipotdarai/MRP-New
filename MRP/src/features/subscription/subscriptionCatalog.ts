import catalog from './Subscriptions.json';
import {ProductOffer, SubscriptionTier} from '../../services/entitlements/EntitlementTypes';

export type CatalogMode = 'hardcoded' | 'play';

export type CatalogBasePlan = {
  basePlanId: string;
  label: string;
  formattedPrice: string;
  billingPeriod: string;
};

export type CatalogProduct = {
  productId: string;
  tier: SubscriptionTier;
  title: string;
  description: string;
  basePlans: CatalogBasePlan[];
};

export type SubscriptionsCatalog = {
  mode: CatalogMode;
  version: number;
  description: string;
  incompleteStep: string;
  products: CatalogProduct[];
};

export function getSubscriptionsCatalog(): SubscriptionsCatalog {
  return catalog as SubscriptionsCatalog;
}

export function isHardcodedBillingMode(): boolean {
  return getSubscriptionsCatalog().mode === 'hardcoded';
}

export function catalogToProductOffers(): ProductOffer[] {
  const offers: ProductOffer[] = [];
  for (const p of getSubscriptionsCatalog().products) {
    if (p.productId === 'free') continue;
    for (const bp of p.basePlans) {
      offers.push({
        productId: p.productId,
        basePlanId: bp.basePlanId,
        title: `${p.title} (${bp.label})`,
        description: p.description,
        formattedPrice: bp.formattedPrice,
        billingPeriod: bp.billingPeriod,
      });
    }
  }
  return offers;
}

export function tierForProductId(productId: string): SubscriptionTier {
  const match = getSubscriptionsCatalog().products.find(p => p.productId === productId);
  return match?.tier ?? 'free';
}

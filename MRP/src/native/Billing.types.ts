import {NativeModules} from 'react-native';
import {
  EntitlementSnapshot,
  ProductOffer,
  PurchaseResult,
} from '../services/entitlements/EntitlementTypes';

interface BillingNative {
  getEntitlementSnapshot(): Promise<EntitlementSnapshot>;
  refreshEntitlements(): Promise<EntitlementSnapshot>;
  getProductOffers(): Promise<ProductOffer[]>;
  purchase(productId: string, basePlanId: string): Promise<PurchaseResult>;
  restorePurchases(): Promise<EntitlementSnapshot>;
  activateEnterpriseKey(key: string): Promise<EntitlementSnapshot>;
  openPlaySubscriptionManagement(): Promise<boolean>;
  setDebugTier?(tier: string): Promise<EntitlementSnapshot>;
  activateCatalogProduct(
    productId: string,
    basePlanId: string,
  ): Promise<PurchaseResult>;
}

const {MrpBilling} = NativeModules;

export default MrpBilling as BillingNative | undefined;

import {NativeModules} from 'react-native';

export type OpsPromo = {id?: string; title: string; subtitle: string; url: string};
export type OpsCoupon = {code: string; percent: number; label: string; active: boolean};
export type OpsProductPrice = {monthly?: string; yearly?: string; discountNote?: string};
export type OpsCatalog = {
  promotions?: Record<string, OpsPromo> | OpsPromo[];
  affiliates?: Record<string, OpsPromo> | OpsPromo[];
  prices?: Record<string, OpsProductPrice>;
  coupons?: Record<string, OpsCoupon>;
  updatedAtMs?: number;
};
export type OpsBroadcast = {
  id: string;
  title: string;
  body: string;
  kind: string;
  atMs: number;
};
export type OpsGrant = {
  tier?: string;
  productId?: string;
  note?: string;
  updatedAtMs?: number;
};
export type OpsUserRow = {
  uid: string;
  accountEmail: string;
  displayName: string;
  phoneNumber: string;
  deviceMac: string;
  tier: string;
  productId: string;
  note: string;
};
export type OpsSnapshot = {
  catalog: OpsCatalog;
  inbox: OpsBroadcast[];
  unread: number;
  latestAtMs: number;
  grant: OpsGrant | null;
  admin: boolean;
};

type Native = {
  isCurrentUserAdmin(): Promise<boolean>;
  fetchOps(): Promise<OpsSnapshot>;
  markInboxRead(): Promise<boolean>;
  adminListUsers(): Promise<OpsUserRow[]>;
  adminSaveCatalog(json: string): Promise<boolean>;
  adminPushBroadcast(title: string, body: string, kind: string): Promise<string>;
  adminSetGrant(uid: string, tier: string, productId: string, note: string): Promise<boolean>;
};

const native = NativeModules.MrpOps as Native | undefined;

export default native;

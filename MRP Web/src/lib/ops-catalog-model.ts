export type OpsLinkItem = {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  active: boolean;
};

export type OpsPriceItem = {
  id: string;
  productId: string;
  monthly: string;
  yearly: string;
  discountNote: string;
};

export type OpsCouponItem = {
  id: string;
  code: string;
  percent: number;
  label: string;
  active: boolean;
};

export type OpsDiscountItem = {
  id: string;
  title: string;
  percent: number;
  label: string;
  appliesTo: string;
  active: boolean;
};

export type OpsCatalogLists = {
  promotions: OpsLinkItem[];
  affiliates: OpsLinkItem[];
  prices: OpsPriceItem[];
  coupons: OpsCouponItem[];
  discounts: OpsDiscountItem[];
};

function asObj(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function entries(raw: unknown): Array<[string, Record<string, unknown>]> {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((x) => x && typeof x === "object")
      .map((x, i) => {
        const o = x as Record<string, unknown>;
        return [String(o.id || `i-${i}`), o];
      });
  }
  return Object.entries(asObj(raw)).map(([k, v]) => [
    k,
    v && typeof v === "object" ? (v as Record<string, unknown>) : {},
  ]);
}

function str(o: Record<string, unknown>, k: string, fallback = ""): string {
  const v = o[k];
  return v == null ? fallback : String(v);
}

function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bool(o: Record<string, unknown>, k: string, fallback = true): boolean {
  const v = o[k];
  if (typeof v === "boolean") return v;
  if (v === "false" || v === 0) return false;
  if (v === "true" || v === 1) return true;
  return fallback;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function parseCatalog(raw: unknown): OpsCatalogLists {
  const c = asObj(raw);
  const promotions = entries(c.promotions).map(([id, o]) => ({
    id: str(o, "id", id),
    title: str(o, "title"),
    subtitle: str(o, "subtitle"),
    url: str(o, "url"),
    active: bool(o, "active", true),
  }));
  const affiliates = entries(c.affiliates).map(([id, o]) => ({
    id: str(o, "id", id),
    title: str(o, "title"),
    subtitle: str(o, "subtitle"),
    url: str(o, "url"),
    active: bool(o, "active", true),
  }));
  const prices = entries(c.prices).map(([id, o]) => ({
    id: str(o, "id", id),
    productId: str(o, "productId", id),
    monthly: str(o, "monthly"),
    yearly: str(o, "yearly"),
    discountNote: str(o, "discountNote"),
  }));
  const coupons = entries(c.coupons).map(([id, o]) => ({
    id: str(o, "id", id),
    code: str(o, "code", id),
    percent: num(o, "percent"),
    label: str(o, "label"),
    active: bool(o, "active", true),
  }));
  const discounts = entries(c.discounts).map(([id, o]) => ({
    id: str(o, "id", id),
    title: str(o, "title"),
    percent: num(o, "percent"),
    label: str(o, "label"),
    appliesTo: str(o, "appliesTo"),
    active: bool(o, "active", true),
  }));
  return { promotions, affiliates, prices, coupons, discounts };
}

function byId<T extends { id: string }>(rows: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const row of rows) {
    const id = row.id.trim() || newId("row");
    out[id] = { ...row, id };
  }
  return out;
}

export function catalogToFirebase(lists: OpsCatalogLists): Record<string, unknown> {
  const prices: Record<string, OpsPriceItem> = {};
  for (const p of lists.prices) {
    const key = (p.productId || p.id).trim() || newId("price");
    prices[key] = { ...p, id: key, productId: p.productId || key };
  }
  const coupons: Record<string, OpsCouponItem> = {};
  for (const c of lists.coupons) {
    const key = (c.code || c.id).trim() || newId("coupon");
    coupons[key] = { ...c, id: key, code: c.code || key };
  }
  return {
    promotions: byId(lists.promotions),
    affiliates: byId(lists.affiliates),
    prices,
    coupons,
    discounts: byId(lists.discounts),
  };
}

export function upsert<T extends { id: string }>(rows: T[], item: T): T[] {
  const i = rows.findIndex((r) => r.id === item.id);
  if (i < 0) return [...rows, item];
  const next = rows.slice();
  next[i] = item;
  return next;
}

export function removeById<T extends { id: string }>(rows: T[], id: string): T[] {
  return rows.filter((r) => r.id !== id);
}

export function emptyLink(): OpsLinkItem {
  return { id: newId("link"), title: "", subtitle: "", url: "https://", active: true };
}

export function emptyPrice(): OpsPriceItem {
  return { id: newId("price"), productId: "mrp_premium", monthly: "", yearly: "", discountNote: "" };
}

export function emptyCoupon(): OpsCouponItem {
  return { id: newId("coupon"), code: "", percent: 10, label: "", active: true };
}

export function emptyDiscount(): OpsDiscountItem {
  return {
    id: newId("disc"),
    title: "",
    percent: 10,
    label: "",
    appliesTo: "mrp_premium",
    active: true,
  };
}

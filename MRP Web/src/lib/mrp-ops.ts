import { get, push, ref, set } from "firebase/database";
import { getFirebaseDb } from "./firebase";

export type OpsCatalog = Record<string, unknown> & {
  updatedAtMs?: number;
  updatedBy?: string;
};

export async function readOpsCatalog(): Promise<OpsCatalog> {
  const snap = await get(ref(getFirebaseDb(), "mrp_ops/catalog"));
  return (snap.val() as OpsCatalog) || {};
}

export async function writeOpsCatalog(catalog: Record<string, unknown>, actorEmail: string): Promise<void> {
  await set(ref(getFirebaseDb(), "mrp_ops/catalog"), {
    ...catalog,
    updatedAtMs: Date.now(),
    updatedBy: actorEmail,
  });
}

export async function pushOpsBroadcast(row: {
  title: string;
  body: string;
  kind: string;
  actorEmail: string;
  targetUid?: string;
}): Promise<void> {
  await push(ref(getFirebaseDb(), "mrp_ops/broadcasts"), {
    title: row.title,
    body: row.body,
    kind: row.kind,
    atMs: Date.now(),
    actorEmail: row.actorEmail,
    targetUid: row.targetUid || "",
  });
}

export async function listOpsBroadcasts(limit = 30): Promise<
  Array<{ id: string; title: string; body: string; kind: string; atMs: number }>
> {
  const snap = await get(ref(getFirebaseDb(), "mrp_ops/broadcasts"));
  const val = snap.val() as Record<string, { title?: string; body?: string; kind?: string; atMs?: number }> | null;
  if (!val) return [];
  return Object.entries(val)
    .map(([id, b]) => ({
      id,
      title: b.title || "",
      body: b.body || "",
      kind: b.kind || "notice",
      atMs: b.atMs || 0,
    }))
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, limit);
}

export async function setOpsGrant(
  uid: string,
  grant: { tier: string; productId: string; note: string; actorEmail: string },
): Promise<void> {
  await set(ref(getFirebaseDb(), `mrp_ops/grants/${uid}`), {
    tier: grant.tier,
    productId: grant.productId,
    note: grant.note,
    updatedAtMs: Date.now(),
    actorEmail: grant.actorEmail,
  });
}

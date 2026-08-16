"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { SyncPolicyEditor } from "@/components/SyncPolicyEditor";
import {
  appendAdminAudit,
  formatConfigTime,
  listAdminAudit,
  listDeviceConfigs,
  readDeviceConfig,
  writeDeviceConfig,
  type AdminAuditEntry,
  type DeviceConfig,
  type DeviceConfigRow,
} from "@/lib/device-config";
import {
  listOpsBroadcasts,
  pushOpsBroadcast,
  readOpsCatalog,
  setOpsGrant,
  writeOpsCatalog,
} from "@/lib/mrp-ops";
import { catalogToFirebase, parseCatalog, type OpsCatalogLists } from "@/lib/ops-catalog-model";
import { AdminCatalogCrud } from "@/components/AdminCatalogCrud";

export default function AdminPage() {
  const { isAdmin, user } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<DeviceConfigRow[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [selectedCfg, setSelectedCfg] = useState<DeviceConfig | null>(null);
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [subNote, setSubNote] = useState("");
  const [lists, setLists] = useState<OpsCatalogLists>(parseCatalog({}));
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [grantTier, setGrantTier] = useState("premium");
  const [grantProduct, setGrantProduct] = useState("mrp_premium");
  const [opsInbox, setOpsInbox] = useState<Array<{ id: string; title: string; atMs: number }>>([]);

  useEffect(() => {
    if (!isAdmin) router.replace("/dashboard");
  }, [isAdmin, router]);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    try {
      const [list, logs, catalog, broadcasts] = await Promise.all([
        listDeviceConfigs(),
        listAdminAudit(30),
        readOpsCatalog().catch(() => ({})),
        listOpsBroadcasts(20).catch(() => []),
      ]);
      setRows(list);
      setAudit(logs);
      setOpsInbox(broadcasts);
      setLists(parseCatalog(catalog));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Admin load failed");
    }
  }, [isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      ({ uid, config }) =>
        uid.toLowerCase().includes(q) ||
        (config.accountEmail || "").toLowerCase().includes(q) ||
        (config.displayName || "").toLowerCase().includes(q) ||
        (config.phoneNumber || "").toLowerCase().includes(q) ||
        (config.deviceMac || "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const selectUid = async (uid: string) => {
    setSelectedUid(uid);
    setSelectedCfg(null);
    try {
      const cfg = await readDeviceConfig(uid);
      setSelectedCfg(cfg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load config");
    }
  };

  const savePolicy = async (cfg: DeviceConfig) => {
    if (!user || !selectedUid) return;
    await writeDeviceConfig(selectedUid, cfg, "admin");
    await appendAdminAudit({
      actorEmail: user.email || "",
      actorUid: user.uid,
      action: "device_config.patch",
      targetUid: selectedUid,
      note: "Admin sync policy update",
    });
    await refresh();
    setSelectedCfg(cfg);
  };

  const saveOpsCatalog = async (next: OpsCatalogLists, kind: string) => {
    if (!user) return;
    try {
      await writeOpsCatalog(catalogToFirebase(next), user.email || "");
      await pushOpsBroadcast({
        title: `${kind} updated`,
        body: "Promotions, affiliates, pricing, coupons, or discounts changed.",
        kind: "catalog",
        actorEmail: user.email || "",
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Catalog save failed");
    }
  };

  const sendPush = async () => {
    if (!user || !pushTitle.trim()) return;
    await pushOpsBroadcast({
      title: pushTitle.trim(),
      body: pushBody.trim(),
      kind: "promo",
      actorEmail: user.email || "",
    });
    setPushTitle("");
    setPushBody("");
    await refresh();
  };

  const grantPlan = async () => {
    if (!user || !selectedUid) return;
    await setOpsGrant(selectedUid, {
      tier: grantTier,
      productId: grantProduct,
      note: subNote || "admin grant",
      actorEmail: user.email || "",
    });
    await pushOpsBroadcast({
      title: "Plan updated",
      body: `Your MRP plan is now ${grantTier}.`,
      kind: "subscription",
      actorEmail: user.email || "",
      targetUid: selectedUid,
    });
    await appendAdminAudit({
      actorEmail: user.email || "",
      actorUid: user.uid,
      action: "subscription.grant",
      targetUid: selectedUid,
      note: `${grantTier} ${grantProduct}`,
    });
    await refresh();
  };

  if (!isAdmin) {
    return (
      <div>
        <h1 className="page-title">Admin</h1>
        <p className="page-lead">Not authorized.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Admin</h1>
      <p className="page-lead">
        Signed in as <span className="mono">{user?.email}</span>. Metadata and sync policy only —
        never vault binaries (P6-8…P6-10).
      </p>

      {error ? (
        <p className="muted" style={{ color: "var(--alert)", marginBottom: "1rem" }}>
          {error}
        </p>
      ) : null}

      <div className="grid-2" style={{ marginBottom: "1rem" }}>
        <div className="panel">
          <h2>Users</h2>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            Email, name, mobile, and device MAC from the last device sync. Search any of those fields.
          </p>
          <div className="field">
            <label htmlFor="q">Search</label>
            <input
              id="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="email, name, mobile, MAC, uid…"
            />
          </div>
          <div style={{ overflow: "auto", maxHeight: 320, marginTop: "0.75rem" }}>
            <table className="table" style={{ width: "100%", fontSize: "0.85rem" }}>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Device MAC</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ uid, config }) => (
                  <tr
                    key={uid}
                    onClick={() => void selectUid(uid)}
                    style={{
                      cursor: "pointer",
                      background: selectedUid === uid ? "var(--sky-soft, #e8f1fe)" : undefined,
                    }}
                  >
                    <td>{config.accountEmail || "—"}</td>
                    <td>{config.displayName || "—"}</td>
                    <td>{config.phoneNumber || "—"}</td>
                    <td className="mono">{config.deviceMac || "—"}</td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No matches.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h2>Subscriptions</h2>
          <p className="muted">
            Upgrade or downgrade the selected Firebase user. They get an in-app inbox notice. Not a
            Play charge — Play IAP stays separate until Console is live.
          </p>
          {!selectedUid ? (
            <p className="muted" style={{ marginTop: "0.75rem" }}>
              Select a user first.
            </p>
          ) : (
            <>
              <div className="field" style={{ marginTop: "0.75rem" }}>
                <label htmlFor="tier">Tier</label>
                <input id="tier" value={grantTier} onChange={(e) => setGrantTier(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="pid">Product id</label>
                <input id="pid" value={grantProduct} onChange={(e) => setGrantProduct(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="sub">Note</label>
                <input
                  id="sub"
                  value={subNote}
                  onChange={(e) => setSubNote(e.target.value)}
                  placeholder="optional"
                />
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void grantPlan()}>
                Apply grant
              </button>
            </>
          )}
        </div>

        <div className="panel">
          <h2>Backup access (P6-10)</h2>
          <p className="muted">
            There is <strong style={{ color: "var(--text)" }}>no</strong> admin API that returns
            selfie or backup binaries. Admins cannot open user Drive appData.
          </p>
          <span className="badge badge-safe">Enforced by design</span>
        </div>

        <div className="panel">
          <h2>Audit log</h2>
          {audit.length === 0 ? (
            <p className="muted">No entries yet.</p>
          ) : (
            <ul style={{ listStyle: "none", maxHeight: 220, overflow: "auto", lineHeight: 1.6 }}>
              {audit.map((a) => (
                <li key={a.id} className="muted" style={{ marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                  <span className="mono">{formatConfigTime(a.atMs)}</span> · {a.action} →{" "}
                  <span className="mono">{a.targetUid.slice(0, 8)}…</span>
                  {a.note ? ` — ${a.note}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {selectedUid ? (
        <div className="panel" key={selectedUid}>
          <h2>Sync policy for {selectedUid.slice(0, 12)}…</h2>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            Writes <code className="mono">device_config/{selectedUid}</code> as source=admin.
          </p>
          <SyncPolicyEditor
            initial={selectedCfg}
            saveLabel="Save as admin"
            onSave={savePolicy}
          />
        </div>
      ) : null}

      <AdminCatalogCrud lists={lists} onSave={saveOpsCatalog} />

      <div className="panel" style={{ marginTop: "1rem" }}>
        <h2>Push notification</h2>
        <p className="muted">In-app inbox + Home badge. Same tree as the Android admin panel.</p>
        <div className="grid-2" style={{ marginTop: "0.75rem" }}>
          <div>
            <div className="field">
              <label>Push title</label>
              <input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} />
            </div>
            <div className="field">
              <label>Push body</label>
              <input value={pushBody} onChange={(e) => setPushBody(e.target.value)} />
            </div>
            <button type="button" className="btn btn-primary" onClick={() => void sendPush()}>
              Push notification
            </button>
            <h3 style={{ marginTop: "1rem" }}>Recent pushes</h3>
            <ul className="muted" style={{ listStyle: "none", fontSize: "0.85rem" }}>
              {opsInbox.map((b) => (
                <li key={b.id}>
                  {b.title} · {new Date(b.atMs).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

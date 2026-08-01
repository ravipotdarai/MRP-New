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

  useEffect(() => {
    if (!isAdmin) router.replace("/dashboard");
  }, [isAdmin, router]);

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    try {
      const [list, logs] = await Promise.all([listDeviceConfigs(), listAdminAudit(30)]);
      setRows(list);
      setAudit(logs);
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
        (config.accountEmail || "").toLowerCase().includes(q),
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

  const logSubscriptionIntent = async () => {
    if (!user || !selectedUid) return;
    const note = subNote.trim() || "subscription intent (Play Console deferred)";
    await appendAdminAudit({
      actorEmail: user.email || "",
      actorUid: user.uid,
      action: "subscription.note",
      targetUid: selectedUid,
      note,
    });
    setSubNote("");
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
          <h2>User search (P6-8)</h2>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            Filter by Firebase uid or <code className="mono">accountEmail</code> hint on
            device_config. No vault fields returned.
          </p>
          <div className="field">
            <label htmlFor="q">Search</label>
            <input
              id="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="uid or email…"
            />
          </div>
          <ul style={{ listStyle: "none", marginTop: "0.75rem", maxHeight: 280, overflow: "auto" }}>
            {filtered.map(({ uid, config }) => (
              <li key={uid} style={{ marginBottom: "0.35rem" }}>
                <button
                  type="button"
                  className="btn"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={() => void selectUid(uid)}
                >
                  <span className="mono" style={{ fontSize: "0.85rem" }}>
                    {uid.slice(0, 10)}…
                  </span>
                  <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                    {config.accountEmail || "no email hint"} ·{" "}
                    {formatConfigTime(config.updatedAtMs)}
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 ? <li className="muted">No matches.</li> : null}
          </ul>
        </div>

        <div className="panel">
          <h2>Subscriptions (P6-9)</h2>
          <p className="muted">
            Play Billing grant/revoke stays deferred until Play Console + Nest billing. Log an
            admin note against the selected uid for audit.
          </p>
          {!selectedUid ? (
            <p className="muted" style={{ marginTop: "0.75rem" }}>
              Select a user first.
            </p>
          ) : (
            <>
              <div className="field" style={{ marginTop: "0.75rem" }}>
                <label htmlFor="sub">Note</label>
                <input
                  id="sub"
                  value={subNote}
                  onChange={(e) => setSubNote(e.target.value)}
                  placeholder="e.g. Premium grant pending Play…"
                />
              </div>
              <button type="button" className="btn" onClick={() => void logSubscriptionIntent()}>
                Append audit note
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
    </div>
  );
}

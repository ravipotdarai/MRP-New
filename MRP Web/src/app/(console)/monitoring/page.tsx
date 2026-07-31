"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";
import { useAuth } from "@/lib/auth-context";
import { readDeviceConfig, writeDeviceConfig } from "@/lib/device-config";
import { allowAction, remainingCooldownMs } from "@/lib/rate-limit";
import { InteractiveMap } from "@/components/InteractiveMap";
import { EventDetailDrawer, TimelineList } from "@/components/TimelineUi";
import { EventTypeChart } from "@/components/EventTypeChart";
import {
  asRows,
  liveLatLng,
  num,
  type TimelineRow,
} from "@/lib/vault-selectors";

function MonitoringBody() {
  const { user } = useAuth();
  const { vault, refresh, setInfo, busy } = useVaultSession();
  const [findBusy, setFindBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [policyEmergency, setPolicyEmergency] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<TimelineRow | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const refreshPolicy = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const cfg = await readDeviceConfig(user.uid);
      setPolicyEmergency(Boolean(cfg?.emergencyTracking));
    } catch {
      /* ignore */
    }
  }, [user?.uid]);

  useEffect(() => {
    void refreshPolicy();
  }, [refreshPolicy]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void refresh(true);
      void refreshPolicy();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, refresh, refreshPolicy]);

  const findMyDevice = async () => {
    if (!user?.uid) {
      setError("Sign in required");
      return;
    }
    if (!allowAction("find-my-device", 15_000)) {
      setError(`Wait ${Math.ceil(remainingCooldownMs("find-my-device", 15_000) / 1000)}s before retrying`);
      return;
    }
    setFindBusy(true);
    setError(null);
    try {
      const existing = (await readDeviceConfig(user.uid)) || {};
      await writeDeviceConfig(
        user.uid,
        {
          ...existing,
          emergencyTracking: true,
          emergencyIntervalMinutes: 1,
          syncFrequencyMinutes: Math.max(10, existing.syncFrequencyMinutes || 10),
          syncOnMobileData: true,
          syncOnWifi: true,
          syncLocation: true,
          highAccuracy: true,
          backgroundTracking: true,
          eventSyncEnabled: true,
        },
        "web",
      );
      setPolicyEmergency(true);
      setAutoRefresh(true);
      setInfo(
        "Find-my-device ON (~1 min GPS sync). Auto-refresh vault every 60s. Stop when done.",
      );
      window.setTimeout(() => void refresh(true), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set find policy");
    } finally {
      setFindBusy(false);
    }
  };

  const cancelFind = async () => {
    if (!user?.uid) return;
    if (!allowAction("cancel-find", 5000)) return;
    setFindBusy(true);
    try {
      const existing = (await readDeviceConfig(user.uid)) || {};
      await writeDeviceConfig(
        user.uid,
        {
          ...existing,
          emergencyTracking: false,
          syncFrequencyMinutes: Math.max(10, existing.syncFrequencyMinutes || 15),
        },
        "web",
      );
      setPolicyEmergency(false);
      setAutoRefresh(false);
      setInfo("Emergency tracking off.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear emergency");
    } finally {
      setFindBusy(false);
    }
  };

  const live = liveLatLng(vault);
  const rows = useMemo(() => {
    const all = asRows(vault);
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [vault, filter]);

  const simRows = vault?.simHistory || [];
  const dh = vault?.deviceHealth || {};

  return (
    <div>
      <h1 className="page-title">Locate & Timeline</h1>
      <p className="page-lead">
        Drive-only locate on pathsync.in — decrypt in this browser. Panic SMS / SIM recovery stay on the phone.
      </p>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <button type="button" className="btn btn-primary" disabled={findBusy || busy} onClick={() => void findMyDevice()}>
            Find my device
          </button>
          <button type="button" className="btn" disabled={findBusy} onClick={() => void cancelFind()}>
            Stop emergency
          </button>
          <label className="muted" style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh vault (60s)
          </label>
          {policyEmergency ? <span className="badge badge-alert">Emergency ON</span> : null}
        </div>
        {error ? <p className="badge badge-alert" style={{ marginTop: "0.75rem" }}>{error}</p> : null}
      </div>

      <div className="grid-2">
        <div className="panel">
          <h2>Live</h2>
          <ul className="muted" style={{ listStyle: "none", lineHeight: 1.7, marginBottom: "0.75rem" }}>
            <li>
              Battery:{" "}
              {String(
                dh.batteryPct ??
                  (live
                    ? (vault?.liveLocation as Record<string, unknown> | undefined)?.battery
                    : undefined) ??
                  "—",
              )}
            </li>
            <li>Network: {String((vault?.liveLocation as Record<string, unknown> | undefined)?.network ?? "—")}</li>
            <li>Accuracy: {String(num((vault?.liveLocation as Record<string, unknown> | undefined)?.accuracy) ?? "—")}</li>
          </ul>
          {live ? (
            <InteractiveMap center={live} markers={[{ ...live, id: "live" }]} height={280} />
          ) : (
            <p className="muted">No liveLocation — enable Find my device and wait for phone sync.</p>
          )}
        </div>
        <div className="panel">
          <h2>Event mix</h2>
          <EventTypeChart timeline={vault?.timeline || []} />
        </div>
      </div>

      <div className="panel" style={{ marginTop: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <h2>Security timeline</h2>
          <input
            className="input"
            placeholder="Filter events…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ maxWidth: 280 }}
          />
        </div>
        <TimelineList
          rows={rows}
          onSelect={(row, index) => {
            setSelected(row);
            setSelectedIdx(index);
          }}
        />
      </div>

      <div className="panel" style={{ marginTop: "1.25rem" }}>
        <h2>SIM history (read-only)</h2>
        {simRows.length === 0 ? (
          <p className="muted">No SIM history in vault.</p>
        ) : (
          <ul className="muted" style={{ listStyle: "none", lineHeight: 1.7 }}>
            {simRows.slice(0, 20).map((s, i) => {
              const o = s as Record<string, unknown>;
              return (
                <li key={i}>
                  {String(o.summary || o.carrier || o.note || "SIM event")} ·{" "}
                  {String(o.iccidMasked || "")} ·{" "}
                  {new Date(Number(o.atMs || o.time || o.timestamp) || Date.now()).toLocaleString()}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <EventDetailDrawer
        row={selected}
        onClose={() => setSelected(null)}
        onPrev={() => {
          const next = Math.min(rows.length - 1, selectedIdx + 1);
          setSelectedIdx(next);
          setSelected(rows[next] || null);
        }}
        onNext={() => {
          const next = Math.max(0, selectedIdx - 1);
          setSelectedIdx(next);
          setSelected(rows[next] || null);
        }}
      />
    </div>
  );
}

export default function MonitoringPage() {
  return (
    <VaultUnlockGate>
      <MonitoringBody />
    </VaultUnlockGate>
  );
}

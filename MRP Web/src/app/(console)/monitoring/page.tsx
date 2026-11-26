"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";
import { useAuth } from "@/lib/auth-context";
import { readDeviceConfig, writeDeviceConfig } from "@/lib/device-config";
import { allowAction, remainingCooldownMs } from "@/lib/rate-limit";
import { EventDetailDrawer, TimelineList } from "@/components/TimelineUi";
import { EventTypeChart } from "@/components/EventTypeChart";
import { SessionInlineControls } from "@/components/SessionInlineControls";
import {
  asRows,
  eventTimeMs,
  liveLocationDetails,
  type TimelineRow,
} from "@/lib/vault-selectors";

function MonitoringBody() {
  const { user } = useAuth();
  const { vault, refresh, setInfo, busy } = useVaultSession();
  const [findBusy, setFindBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [policyEmergency, setPolicyEmergency] = useState(false);
  const [bgTracking, setBgTracking] = useState(false);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<TimelineRow | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const refreshPolicy = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const cfg = await readDeviceConfig(user.uid);
      setPolicyEmergency(Boolean(cfg?.emergencyTracking));
      setBgTracking(Boolean(cfg?.backgroundTracking));
      if (cfg?.emergencyTracking) setAutoRefresh(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read device policy");
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
      setBgTracking(true);
      setAutoRefresh(true);
      setInfo(
        "Emergency ON — phone picks up within ~1 min when online. Drive sync refreshes live trail on Travel / Emergency Monitoring.",
      );
      window.setTimeout(() => void refresh(true), 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not set find policy";
      setError(
        /permission|PERMISSION_DENIED/i.test(msg)
          ? "Firebase denied the write — sign in with the same Google account as the phone."
          : msg,
      );
    } finally {
      setFindBusy(false);
    }
  };

  const cancelFind = async () => {
    if (!user?.uid) return;
    if (!allowAction("cancel-find", 5000)) {
      setError(`Wait ${Math.ceil(remainingCooldownMs("cancel-find", 5000) / 1000)}s before retrying`);
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
          emergencyTracking: false,
          syncFrequencyMinutes: Math.max(10, existing.syncFrequencyMinutes || 15),
        },
        "web",
      );
      setPolicyEmergency(false);
      setAutoRefresh(false);
      setInfo("Emergency tracking off.");
      await refreshPolicy();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not clear emergency";
      setError(
        /permission|PERMISSION_DENIED/i.test(msg)
          ? "Firebase denied the write — sign in with the same Google account as the phone."
          : msg,
      );
    } finally {
      setFindBusy(false);
    }
  };

  const liveDetails = useMemo(() => liveLocationDetails(vault), [vault]);
  const trackingSnap = vault?.trackingConfigSnapshot || {};

  const rows = useMemo(() => {
    const all = asRows(vault);
    const q = filter.trim().toLowerCase();
    const filtered = !q ? all : all.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
    return [...filtered].sort((a, b) => eventTimeMs(b) - eventTimeMs(a));
  }, [vault, filter]);

  const simRows = vault?.simHistory || [];

  return (
    <div>
      <h1 className="page-title rise">Locate & Timeline</h1>
      <p className="page-lead rise rise-delay-1">
        Security timeline and Find-my-device policy. Open a row for selfie and event details.
      </p>

      <div className="panel rise rise-delay-1" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={findBusy || busy}
            onClick={() => void findMyDevice()}
          >
            {findBusy ? "Starting…" : "Start emergency"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={findBusy || !policyEmergency}
            onClick={() => void cancelFind()}
          >
            Stop emergency
          </button>
          <label className="muted" style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (60s)
          </label>
          {policyEmergency ? <span className="badge badge-alert pulse-badge">Emergency ON</span> : null}
          {bgTracking ? <span className="badge badge-safe">Background tracking</span> : null}
          {trackingSnap.movementTracking || trackingSnap.highAccuracy ? (
            <span className="badge">High-accuracy path</span>
          ) : null}
          <SessionInlineControls />
        </div>
        {error ? (
          <p className="badge badge-alert" style={{ marginTop: "0.75rem" }}>
            {error}
          </p>
        ) : null}
      </div>

      <div className="panel rise rise-delay-2" style={{ marginBottom: "1.25rem" }}>
        <h2>Last known status</h2>
        <p className="muted" style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}>
          Snapshot from Drive backup — not a live map. Open Travel or Emergency Monitoring for path.
        </p>
        <ul className="list-plain overview-stats">
          <li>
            <span className="muted">Battery</span>
            <strong>{liveDetails.batteryPct != null ? `${liveDetails.batteryPct}%` : "—"}</strong>
          </li>
          <li>
            <span className="muted">Accuracy</span>
            <strong>
              {liveDetails.accuracyM != null ? `±${Math.round(liveDetails.accuracyM)} m` : "—"}
            </strong>
          </li>
          <li>
            <span className="muted">Geofence</span>
            <strong>
              {liveDetails.insideGeofence == null
                ? liveDetails.geofenceName || "—"
                : liveDetails.insideGeofence
                  ? `Inside${liveDetails.geofenceName ? ` · ${liveDetails.geofenceName}` : ""}`
                  : `Outside${liveDetails.geofenceName ? ` · ${liveDetails.geofenceName}` : ""}`}
            </strong>
          </li>
          {liveDetails.address ? (
            <li>
              <span className="muted">Address</span>
              <strong>{liveDetails.address}</strong>
            </li>
          ) : null}
          {liveDetails.atMs ? (
            <li>
              <span className="muted">Fix</span>
              <strong className="mono" style={{ fontSize: "0.85rem" }}>
                {new Date(liveDetails.atMs).toLocaleString()}
                {liveDetails.source ? ` · ${liveDetails.source}` : ""}
              </strong>
            </li>
          ) : null}
        </ul>
      </div>

      <div className="panel rise rise-delay-2">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <h2>Security timeline</h2>
          <input
            className="input"
            placeholder="Filter events…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ maxWidth: 220 }}
          />
        </div>
        <p className="muted" style={{ marginBottom: "0.5rem", fontSize: "0.85rem" }}>
          Type, status, and time. Open a row for selfie and full details (same as the phone).
        </p>
        <TimelineList
          rows={rows}
          onSelect={(row, index) => {
            setSelected(row);
            setSelectedIdx(index);
          }}
        />
      </div>

      <div className="panel rise rise-delay-3" style={{ marginTop: "1.25rem" }}>
        <h2>Event mix</h2>
        <p className="muted" style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}>
          Share of security event types in this backup.
        </p>
        <EventTypeChart timeline={vault?.timeline || []} layout="stack" />
      </div>

      <div className="panel" style={{ marginTop: "1.25rem" }}>
        <h2>SIM history (read-only)</h2>
        {simRows.length === 0 ? (
          <p className="muted">No SIM history in device backup.</p>
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
        vault={vault}
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
    <VaultUnlockGate title="Unlock device data for Locate" showSessionControls={false}>
      <MonitoringBody />
    </VaultUnlockGate>
  );
}

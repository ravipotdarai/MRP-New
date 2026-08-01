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
  movementTrail,
  num,
  pathDistanceKm,
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
      setBgTracking(true);
      setAutoRefresh(true);
      setInfo(
        "Find my device ON — phone syncs GPS about every minute. Live map auto-refreshes every 60s. Stop when done.",
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
  const trackingActive = policyEmergency || autoRefresh;
  const trail = useMemo(
    () => movementTrail(vault, trackingActive ? 6 : 2),
    [vault, trackingActive],
  );
  const trailKm = pathDistanceKm(trail);

  const mapFences = useMemo(() => {
    return (vault?.geofences || [])
      .map((g, i) => {
        const lat = num(g.latitude);
        const lng = num(g.longitude);
        const r = num(g.radiusMeters) ?? 100;
        if (lat == null || lng == null) return null;
        return { id: g.id || `gf-${i}`, lat, lng, radiusMeters: r, name: g.name };
      })
      .filter(Boolean) as Array<{ id: string; lat: number; lng: number; radiusMeters: number; name?: string }>;
  }, [vault?.geofences]);

  const rows = useMemo(() => {
    const all = asRows(vault);
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [vault, filter]);

  const simRows = vault?.simHistory || [];
  const dh = vault?.deviceHealth || {};
  const trackingSnap = vault?.trackingConfigSnapshot || {};

  return (
    <div>
      <h1 className="page-title rise">Locate & Timeline</h1>
      <p className="page-lead rise rise-delay-1">
        Live locate and security timeline from your synced device data — decrypt in this browser.
        Panic SMS and SIM recovery stay on the phone.
      </p>

      <div className="panel rise rise-delay-1" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <button type="button" className="btn btn-primary" disabled={findBusy || busy} onClick={() => void findMyDevice()}>
            Find my device
          </button>
          <button type="button" className="btn" disabled={findBusy} onClick={() => void cancelFind()}>
            Stop emergency
          </button>
          <label className="muted" style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh (60s)
          </label>
          {policyEmergency ? <span className="badge badge-alert pulse-badge">Emergency ON</span> : null}
          {bgTracking ? <span className="badge badge-safe">Background tracking</span> : null}
          {trackingSnap.movementTracking || trackingSnap.highAccuracy ? (
            <span className="badge">High-accuracy path</span>
          ) : null}
        </div>
        {error ? <p className="badge badge-alert" style={{ marginTop: "0.75rem" }}>{error}</p> : null}
      </div>

      <div className="grid-2 rise rise-delay-2">
        <div className="panel locate-live-panel">
          <h2>Live location & movement</h2>
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
            <li>
              Trail: {trail.length} points · {trailKm.toFixed(2)} km
              {trackingActive ? " · updating while Find is active" : ""}
            </li>
          </ul>
          {live || trail.length ? (
            <InteractiveMap
              center={live || (trail.length ? { lat: trail[trail.length - 1].lat, lng: trail[trail.length - 1].lng } : undefined)}
              polyline={trail.length >= 2 ? trail : []}
              markers={
                live
                  ? [{ ...live, id: "live", color: "#c45c3e" }]
                  : trail.length
                    ? [{ lat: trail[trail.length - 1].lat, lng: trail[trail.length - 1].lng, id: "last", color: "#c45c3e" }]
                    : []
              }
              geofences={mapFences}
              height={320}
            />
          ) : (
            <p className="muted">No live location yet — enable Find my device and wait for the phone to sync.</p>
          )}
        </div>
        <div className="panel">
          <h2>Event mix</h2>
          <EventTypeChart timeline={vault?.timeline || []} />
        </div>
      </div>

      <div className="panel rise rise-delay-3" style={{ marginTop: "1.25rem" }}>
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
        <p className="muted" style={{ marginBottom: "0.5rem", fontSize: "0.85rem" }}>
          Type, status, and time. Open a row for coordinates and map — photos stay in Media.
        </p>
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
    <VaultUnlockGate title="Unlock device data for Locate">
      <MonitoringBody />
    </VaultUnlockGate>
  );
}

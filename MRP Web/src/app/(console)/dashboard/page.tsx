"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiHealth } from "@/lib/api";
import { readDeviceConfig, type DeviceConfig } from "@/lib/device-config";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";
import {
  asRows,
  computeSecurityScore,
  eventTimeMs,
  eventType,
  formatEventType,
  liveLatLng,
  movementTrail,
  selfieSrc,
  severityOf,
} from "@/lib/vault-selectors";
import { InteractiveMap } from "@/components/InteractiveMap";

function DashboardBody() {
  const { user } = useAuth();
  const { vault, meta } = useVaultSession();
  const [health, setHealth] = useState<"unknown" | "up" | "down">("unknown");
  const [cfg, setCfg] = useState<DeviceConfig | null>(null);

  useEffect(() => {
    void apiHealth().then((h) => setHealth(h.ok ? "up" : "down"));
  }, []);

  useEffect(() => {
    if (!user) return;
    void readDeviceConfig(user.uid)
      .then(setCfg)
      .catch(() => setCfg(null));
  }, [user]);

  const score = useMemo(() => computeSecurityScore(vault), [vault]);
  const live = liveLatLng(vault);
  const trail = useMemo(() => movementTrail(vault, 3), [vault]);
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const todayRows = useMemo(
    () => asRows(vault).filter((r) => eventTimeMs(r) >= todayStart),
    [vault, todayStart],
  );
  const recentSelfies = (vault?.selfies || []).slice(0, 4);
  const dh = vault?.deviceHealth || {};

  return (
    <div>
      <h1 className="page-title rise">Overview</h1>
      <p className="page-lead rise rise-delay-1">
        Signed in as <span className="mono">{user?.email}</span>
        {meta?.modifiedTime ? (
          <>
            {" "}
            · data synced{" "}
            <span className="mono">{new Date(meta.modifiedTime).toLocaleString()}</span>
          </>
        ) : null}
      </p>

      <div className="dash-score rise rise-delay-1">
        <div>
          <p className="muted">Security score</p>
          <p className="score-num">{score.score}</p>
        </div>
        <div>
          <p className="muted">Risk</p>
          <p>
            <span className={`badge ${score.risk === "High" ? "badge-alert" : score.risk === "Low" ? "badge-safe" : ""}`}>
              {score.risk}
            </span>
          </p>
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            Alerts today: {score.alertsToday}
          </p>
        </div>
        <div>
          <p className="muted">Nest API</p>
          <p>
            {health === "up" ? (
              <span className="badge badge-safe">OK</span>
            ) : health === "down" ? (
              <span className="badge">Offline / not configured</span>
            ) : (
              <span className="badge">…</span>
            )}
          </p>
        </div>
      </div>

      <div className="dash-grid rise rise-delay-2">
        <div className="panel">
          <h2>Live location</h2>
          {live || trail.length ? (
            <InteractiveMap
              center={live || { lat: trail[trail.length - 1].lat, lng: trail[trail.length - 1].lng }}
              polyline={trail.length >= 2 ? trail : []}
              markers={
                live
                  ? [{ ...live, id: "live", color: "var(--alert)" }]
                  : [{ lat: trail[trail.length - 1].lat, lng: trail[trail.length - 1].lng, id: "last" }]
              }
              height={240}
            />
          ) : (
            <p className="muted">No live location yet — open Locate & Timeline and use Find my device.</p>
          )}
          <Link href="/monitoring" className="btn mt-md">
            Locate & Timeline
          </Link>
        </div>
        <div className="panel">
          <h2>Device health</h2>
          <ul className="muted list-plain">
            <li>Monitoring: {dh.monitoringOn === false ? "off" : "on"}</li>
            <li>Battery: {String(dh.batteryPct ?? dh.battery ?? "—")}</li>
            <li>Emergency: {cfg?.emergencyTracking ? "on" : "off"}</li>
            <li>
              Sync: v{vault?.version ?? "—"} · {vault?.syncReason || "—"}
            </li>
            <li>Pending: {Array.isArray(vault?.pendingSync) ? vault!.pendingSync!.length : 0}</li>
          </ul>
          <Link href="/monitoring" className="btn btn-primary mt-md">
            Find my device
          </Link>
        </div>
        <div className="panel">
          <h2>Today&apos;s activity</h2>
          <p className="muted">{todayRows.length} events</p>
          <ul className="timeline-list timeline-compact">
            {todayRows.slice(0, 8).map((r, i) => (
              <li key={i}>
                <span className={`sev-dot sev-${severityOf(eventType(r))}`} />{" "}
                <strong>{formatEventType(eventType(r))}</strong>{" "}
                <span className="muted">{new Date(eventTimeMs(r)).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h2>Recent evidence</h2>
          <div className="row-wrap mb-md">
            <Link className="btn btn-sm" href="/travel">
              Travel
            </Link>
            <Link className="btn btn-sm" href="/media">
              Media
            </Link>
            <Link className="btn btn-sm" href="/geofences">
              Geofence
            </Link>
            <Link className="btn btn-sm" href="/app-usage">
              App Usage
            </Link>
            <Link className="btn btn-sm" href="/settings">
              Sync Policy
            </Link>
          </div>
          <div className="selfie-grid">
            {recentSelfies.length === 0 ? (
              <p className="muted">{vault?.selfiesOmitted ? "Selfies omitted by sync policy" : "No selfies yet"}</p>
            ) : (
              recentSelfies.map((s, i) => {
                const src = selfieSrc(s);
                return src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" className="selfie-thumb" />
                ) : null;
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <VaultUnlockGate title="Unlock device data for overview">
      <DashboardBody />
    </VaultUnlockGate>
  );
}

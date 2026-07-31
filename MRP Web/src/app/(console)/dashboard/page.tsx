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
  liveLatLng,
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
            · vault{" "}
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

      <div className="grid-2 rise rise-delay-2" style={{ marginTop: "1.25rem" }}>
        <div className="panel">
          <h2>Live location</h2>
          {live ? (
            <InteractiveMap center={live} markers={[{ ...live, id: "live" }]} height={220} />
          ) : (
            <p className="muted">No liveLocation in vault yet.</p>
          )}
          <Link href="/monitoring" className="btn" style={{ marginTop: "0.75rem" }}>
            Locate & Timeline
          </Link>
        </div>
        <div className="panel">
          <h2>Device health</h2>
          <ul className="muted" style={{ listStyle: "none", lineHeight: 1.8 }}>
            <li>Monitoring: {dh.monitoringOn === false ? "off" : "on"}</li>
            <li>Battery: {String(dh.batteryPct ?? dh.battery ?? "—")}</li>
            <li>Emergency: {cfg?.emergencyTracking ? "on" : "off"}</li>
            <li>Vault v{vault?.version ?? "—"} · {vault?.syncReason || "—"}</li>
            <li>Pending sync: {Array.isArray(vault?.pendingSync) ? vault!.pendingSync!.length : 0}</li>
          </ul>
          <Link href="/monitoring" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
            Find my device
          </Link>
        </div>
        <div className="panel">
          <h2>Today&apos;s activity</h2>
          <p className="muted">{todayRows.length} events</p>
          <ul className="timeline-list" style={{ marginTop: "0.75rem", maxHeight: 220, overflow: "auto" }}>
            {todayRows.slice(0, 8).map((r, i) => (
              <li key={i}>
                <span className={`sev-dot sev-${severityOf(eventType(r))}`} />{" "}
                <strong>{eventType(r)}</strong>{" "}
                <span className="muted">{new Date(eventTimeMs(r)).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h2>Quick links</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
            <Link className="btn" href="/travel">Travel</Link>
            <Link className="btn" href="/media">Media</Link>
            <Link className="btn" href="/geofences">Geofences</Link>
            <Link className="btn" href="/app-usage">App Usage</Link>
            <Link className="btn" href="/reports">Reports</Link>
            <Link className="btn" href="/settings">Sync policy</Link>
          </div>
          <h3 style={{ marginTop: "1rem", fontSize: "1rem" }}>Recent selfies</h3>
          <div className="selfie-grid" style={{ marginTop: "0.5rem" }}>
            {recentSelfies.length === 0 ? (
              <p className="muted">{vault?.selfiesOmitted ? "Selfies omitted from vault" : "None"}</p>
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
    <VaultUnlockGate title="Unlock vault for overview">
      <DashboardBody />
    </VaultUnlockGate>
  );
}

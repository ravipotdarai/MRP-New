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
  selfieSrc,
  severityOf,
} from "@/lib/vault-selectors";

function DashboardBody() {
  const { user } = useAuth();
  const { vault, meta, hydrating } = useVaultSession();
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
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const todayRows = useMemo(
    () => asRows(vault).filter((r) => eventTimeMs(r) >= todayStart),
    [vault, todayStart],
  );
  const recentSelfies = hydrating ? [] : (vault?.selfies || []).slice(0, 4);
  const dh = (vault?.deviceHealth || {}) as Record<string, unknown>;
  const security = (dh.security || {}) as Record<string, unknown>;

  return (
    <div>
      <h1 className="page-title">Overview</h1>
      <p className="page-lead">
        Signed in as <span className="mono">{user?.email || "—"}</span>
        {meta?.modifiedTime ? (
          <>
            {" "}
            · data synced{" "}
            <span className="mono">{new Date(meta.modifiedTime).toLocaleString()}</span>
          </>
        ) : null}
      </p>

      <div className="dash-score">
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

      <div className="dash-grid">
        <div className="panel">
          <h2>Device health</h2>
          <ul className="list-plain overview-stats">
            <li>
              <span className="muted">Monitoring</span>
              <strong>{dh.monitoringOn === false ? "off" : "on"}</strong>
            </li>
            <li>
              <span className="muted">Battery</span>
              <strong>{String(dh.batteryPct ?? dh.battery ?? "—")}</strong>
              {dh.batteryPct != null ? "%" : ""}
            </li>
            <li>
              <span className="muted">Emergency policy</span>
              <strong>{cfg?.emergencyTracking ? "on" : "off"}</strong>
            </li>
            <li>
              <span className="muted">Backup</span>
              <strong className="mono">
                v{vault?.version ?? "—"} · {vault?.syncReason || "—"}
              </strong>
            </li>
            <li>
              <span className="muted">Pending sync</span>
              <strong>{Array.isArray(vault?.pendingSync) ? vault!.pendingSync!.length : 0}</strong>
            </li>
            <li>
              <span className="muted">Geofences</span>
              <strong>{vault?.geofences?.length ?? 0}</strong>
            </li>
            <li>
              <span className="muted">App sessions</span>
              <strong>{vault?.appUsage?.sessions?.length ?? vault?.appUsage?.sessionCount ?? 0}</strong>
            </li>
            {security.openIssues != null ? (
              <li>
                <span className="muted">Open issues</span>
                <strong>{String(security.openIssues)}</strong>
              </li>
            ) : null}
          </ul>
          <Link href="/monitoring" className="btn btn-primary mt-md">
            Locate &amp; Find device
          </Link>
        </div>
        <div className="panel">
          <h2>Today&apos;s activity</h2>
          <p className="muted">{todayRows.length} events · timeline from Drive backup</p>
          {todayRows.length === 0 ? (
            <p className="muted" style={{ marginTop: "0.75rem" }}>
              No events for today in this backup yet. Sync from the phone, then Refresh.
            </p>
          ) : (
            <ul className="timeline-list timeline-compact">
              {todayRows.slice(0, 10).map((r, i) => (
                <li key={i}>
                  <span className={`sev-dot sev-${severityOf(eventType(r))}`} />{" "}
                  <strong>{formatEventType(eventType(r))}</strong>{" "}
                  <span className="muted">{new Date(eventTimeMs(r)).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <h2>Shortcuts</h2>
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
            <Link className="btn btn-sm" href="/digital-safety">
              Digital Safety
            </Link>
            <Link className="btn btn-sm" href="/settings">
              Sync Policy
            </Link>
          </div>
          <h3 className="panel-subtitle">Recent evidence</h3>
          <div className="selfie-grid">
            {recentSelfies.length === 0 ? (
              <p className="muted">
                {vault?.selfiesOmitted ? "Selfies omitted by sync policy" : "No selfies yet"}
              </p>
            ) : (
              recentSelfies.map((s, i) => {
                const src = selfieSrc(s);
                return src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" className="selfie-thumb" />
                ) : (
                  <p key={i} className="muted" style={{ fontSize: "0.8rem" }}>
                    Capture pending…
                  </p>
                );
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

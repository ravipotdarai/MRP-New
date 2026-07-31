"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiHealth } from "@/lib/api";
import { readDeviceConfig, type DeviceConfig } from "@/lib/device-config";

export default function DashboardPage() {
  const { user } = useAuth();
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

  return (
    <div>
      <h1 className="page-title rise">Overview</h1>
      <p className="page-lead rise rise-delay-1">
        Signed in as <span className="mono">{user?.email}</span>. Data plane is your Drive vault;
        Firebase holds sync policy only.
      </p>
      <div className="grid-2 rise rise-delay-2">
        <div className="panel">
          <h2>API</h2>
          <p className="muted">
            Nest control plane is optional. Vault decrypt / Drive / Find-my-device work without it.
          </p>
          <p style={{ marginTop: "0.75rem" }}>
            {health === "up" ? (
              <span className="badge badge-safe">Health OK</span>
            ) : health === "down" ? (
              <span className="badge">Nest offline / not configured</span>
            ) : (
              <span className="badge">Checking…</span>
            )}
          </p>
        </div>
        <div className="panel">
          <h2>Sync policy</h2>
          {cfg ? (
            <ul className="muted" style={{ listStyle: "none", marginTop: "0.5rem", lineHeight: 1.7 }}>
              <li>Event → Drive: {cfg.eventSyncEnabled ? "on" : "off"}</li>
              <li>Emergency: {cfg.emergencyTracking ? `${cfg.emergencyIntervalMinutes || 1} min` : "off"}</li>
              <li>Wi‑Fi sync: {cfg.syncOnWifi !== false ? "on" : "off"}</li>
              <li>Source: {cfg.source || "—"}</li>
            </ul>
          ) : (
            <p className="muted">No device_config yet — phone will publish after sign-in.</p>
          )}
          <Link href="/settings" className="btn" style={{ marginTop: "1rem" }}>
            Edit policy
          </Link>
        </div>
        <div className="panel">
          <h2>Monitoring</h2>
          <p className="muted">
            Decrypt the latest <code className="mono">mrp_vault_backup.v1.enc</code> from Drive
            appData with your PIN.
          </p>
          <Link href="/monitoring" className="btn btn-primary" style={{ marginTop: "1rem" }}>
            Open vault
          </Link>
        </div>
        <div className="panel">
          <h2>Privacy</h2>
          <p className="muted">
            RTDB paths <code className="mono">device_live</code> /{" "}
            <code className="mono">event_feed</code> are denied. Circle live is unchanged for now.
          </p>
        </div>
      </div>
    </div>
  );
}

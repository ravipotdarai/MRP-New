"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { readDeviceConfig, type DeviceConfig } from "@/lib/device-config";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";

function ProfileBody() {
  const { user } = useAuth();
  const { vault, meta, lock } = useVaultSession();
  const [cfg, setCfg] = useState<DeviceConfig | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void readDeviceConfig(user.uid)
      .then((c) => {
        setCfg(c);
        setCfgError(null);
      })
      .catch((e) => {
        setCfg(null);
        setCfgError(e instanceof Error ? e.message : "Could not read device_config");
      });
  }, [user]);

  const dh = (vault?.deviceHealth || {}) as Record<string, unknown>;
  const sessions = vault?.appUsage?.sessions?.length ?? vault?.appUsage?.sessionCount ?? 0;

  return (
    <div>
      <h1 className="page-title">Profile & session</h1>
      <p className="page-lead">Account, backup meta, and sync policy for this signed-in user.</p>
      <div className="grid-2">
        <div className="panel">
          <h2>Account</h2>
          <ul className="list-plain overview-stats">
            <li>
              <span className="muted">Email</span>
              <strong className="mono">{user?.email || "—"}</strong>
            </li>
            <li>
              <span className="muted">UID</span>
              <strong className="mono" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>
                {user?.uid || "—"}
              </strong>
            </li>
          </ul>
          <button type="button" className="btn" style={{ marginTop: "1rem" }} onClick={() => lock()}>
            Lock session
          </button>
        </div>
        <div className="panel">
          <h2>Device data</h2>
          <ul className="list-plain overview-stats">
            <li>
              <span className="muted">Last sync</span>
              <strong>
                {meta?.modifiedTime ? new Date(meta.modifiedTime).toLocaleString() : "—"}
              </strong>
            </li>
            <li>
              <span className="muted">Payload version</span>
              <strong>{vault?.version ?? "—"}</strong>
            </li>
            <li>
              <span className="muted">Created</span>
              <strong>
                {vault?.createdAtMs ? new Date(vault.createdAtMs).toLocaleString() : "—"}
              </strong>
            </li>
            <li>
              <span className="muted">Sync reason</span>
              <strong>{vault?.syncReason || "—"}</strong>
            </li>
            <li>
              <span className="muted">Email in backup</span>
              <strong className="mono">{vault?.email || "—"}</strong>
            </li>
            <li>
              <span className="muted">Timeline events</span>
              <strong>{vault?.timeline?.length ?? 0}</strong>
            </li>
            <li>
              <span className="muted">Selfies</span>
              <strong>
                {vault?.selfies?.length ?? 0}
                {vault?.selfiesOmitted ? " (omitted flag)" : ""}
              </strong>
            </li>
            <li>
              <span className="muted">Geofences</span>
              <strong>{vault?.geofences?.length ?? 0}</strong>
            </li>
            <li>
              <span className="muted">App sessions</span>
              <strong>{sessions}</strong>
            </li>
            <li>
              <span className="muted">Pending sync</span>
              <strong>{Array.isArray(vault?.pendingSync) ? vault.pendingSync.length : 0}</strong>
            </li>
            <li>
              <span className="muted">Monitoring</span>
              <strong>{dh.monitoringOn === false ? "off" : dh.monitoringOn == null ? "—" : "on"}</strong>
            </li>
            <li>
              <span className="muted">Battery</span>
              <strong>{String(dh.batteryPct ?? dh.battery ?? "—")}</strong>
            </li>
          </ul>
        </div>
        <div className="panel">
          <h2>Sync policy snapshot</h2>
          {cfg ? (
            <ul className="list-plain overview-stats">
              <li>
                <span className="muted">Emergency</span>
                <strong>{cfg.emergencyTracking ? "on" : "off"}</strong>
              </li>
              <li>
                <span className="muted">Event sync</span>
                <strong>{cfg.eventSyncEnabled ? "on" : "off"}</strong>
              </li>
              <li>
                <span className="muted">Background</span>
                <strong>{cfg.backgroundTracking ? "on" : "off"}</strong>
              </li>
              <li>
                <span className="muted">Source</span>
                <strong>{cfg.source || "—"}</strong>
              </li>
              <li>
                <span className="muted">Updated</span>
                <strong>
                  {cfg.updatedAtMs ? new Date(cfg.updatedAtMs).toLocaleString() : "—"}
                </strong>
              </li>
            </ul>
          ) : (
            <p className="muted">{cfgError || "No device_config yet — open Sync Policy or Start emergency once."}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <VaultUnlockGate title="Unlock device data for profile">
      <ProfileBody />
    </VaultUnlockGate>
  );
}

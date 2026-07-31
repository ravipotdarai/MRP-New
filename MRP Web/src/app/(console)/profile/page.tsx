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

  useEffect(() => {
    if (!user) return;
    void readDeviceConfig(user.uid).then(setCfg).catch(() => setCfg(null));
  }, [user]);

  return (
    <div>
      <h1 className="page-title">Profile & vault status</h1>
      <div className="grid-2">
        <div className="panel">
          <h2>Account</h2>
          <p className="mono">{user?.email}</p>
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            UID: <span className="mono">{user?.uid}</span>
          </p>
          <button type="button" className="btn" style={{ marginTop: "1rem" }} onClick={() => lock()}>
            Lock vault session
          </button>
        </div>
        <div className="panel">
          <h2>Vault</h2>
          <ul className="muted" style={{ listStyle: "none", lineHeight: 1.8 }}>
            <li>File: {meta?.name || "—"}</li>
            <li>Modified: {meta?.modifiedTime ? new Date(meta.modifiedTime).toLocaleString() : "—"}</li>
            <li>Payload version: {vault?.version ?? "—"}</li>
            <li>Created: {vault?.createdAtMs ? new Date(vault.createdAtMs).toLocaleString() : "—"}</li>
            <li>Sync reason: {vault?.syncReason || "—"}</li>
            <li>Email in vault: {vault?.email || "—"}</li>
            <li>Timeline events: {vault?.timeline?.length ?? 0}</li>
            <li>Selfies: {vault?.selfies?.length ?? 0}{vault?.selfiesOmitted ? " (omitted flag)" : ""}</li>
            <li>Geofences: {vault?.geofences?.length ?? 0}</li>
            <li>Pending sync: {Array.isArray(vault?.pendingSync) ? vault.pendingSync.length : 0}</li>
          </ul>
        </div>
        <div className="panel">
          <h2>Sync policy snapshot</h2>
          {cfg ? (
            <ul className="muted" style={{ listStyle: "none", lineHeight: 1.7 }}>
              <li>Emergency: {cfg.emergencyTracking ? "on" : "off"}</li>
              <li>Event sync: {cfg.eventSyncEnabled ? "on" : "off"}</li>
              <li>Source: {cfg.source || "—"}</li>
            </ul>
          ) : (
            <p className="muted">No device_config</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <VaultUnlockGate title="Unlock vault for profile">
      <ProfileBody />
    </VaultUnlockGate>
  );
}

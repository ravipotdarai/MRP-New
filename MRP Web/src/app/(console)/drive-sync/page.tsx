"use client";

import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";

function DriveSyncBody() {
  const { vault, meta } = useVaultSession();
  const dh = vault?.deviceHealth || {};
  const pending = Array.isArray(vault?.pendingSync) ? vault.pendingSync.length : 0;

  return (
    <div>
      <h1 className="page-title rise">Drive Sync</h1>
      <p className="page-lead rise rise-delay-1">
        Encrypted backup status from your private Drive app folder. File names are never shown here.
      </p>
      <div className="grid-2 rise rise-delay-2">
        <div className="panel">
          <h2>Backup status</h2>
          <ul className="muted" style={{ listStyle: "none", lineHeight: 1.8 }}>
            <li>
              Last sync:{" "}
              {meta?.modifiedTime ? new Date(meta.modifiedTime).toLocaleString() : "—"}
            </li>
            <li>Payload version: {vault?.version ?? "—"}</li>
            <li>Sync reason: {vault?.syncReason || "—"}</li>
            <li>Pending items: {pending}</li>
            <li>Selfies in snapshot: {vault?.selfies?.length ?? 0}
              {vault?.selfiesOmitted ? " (some omitted by policy)" : ""}
            </li>
            <li>Timeline events: {vault?.timeline?.length ?? 0}</li>
          </ul>
        </div>
        <div className="panel">
          <h2>Device health</h2>
          <ul className="muted" style={{ listStyle: "none", lineHeight: 1.8 }}>
            <li>Monitoring: {dh.monitoringOn === false ? "off" : "on"}</li>
            <li>Battery: {String(dh.batteryPct ?? dh.battery ?? "—")}</li>
            <li>Account hint: {vault?.email || "—"}</li>
          </ul>
          <p className="muted" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
            PathSync decrypts only in this browser with your PIN. Adjust cadence under Hub → Sync Policy.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DriveSyncPage() {
  return (
    <VaultUnlockGate title="Unlock device data for Drive Sync">
      <DriveSyncBody />
    </VaultUnlockGate>
  );
}

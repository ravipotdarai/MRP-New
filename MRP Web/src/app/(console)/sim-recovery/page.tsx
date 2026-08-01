"use client";

import Link from "next/link";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";

function SimRecoveryBody() {
  const { vault } = useVaultSession();
  const simRows = vault?.simHistory || [];

  return (
    <div>
      <h1 className="page-title rise">SIM Recovery</h1>
      <p className="page-lead rise rise-delay-1">
        SIM change alerts and recovery contacts are managed on the PathSync phone app. This page
        shows read-only history from your synced backup.
      </p>
      <div className="panel rise rise-delay-1" style={{ marginBottom: "1rem" }}>
        <h2>On the phone</h2>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          Open Hub → SIM Recovery on your device to enroll a baseline, set recovery contacts, and
          enable SMS alerts. The web console cannot send recovery SMS.
        </p>
        <Link href="/monitoring" className="btn" style={{ marginTop: "0.75rem" }}>
          View timeline events
        </Link>
      </div>
      <div className="panel rise rise-delay-2">
        <h2>SIM history (read-only)</h2>
        {simRows.length === 0 ? (
          <p className="muted">No SIM history in the current backup.</p>
        ) : (
          <ul className="muted" style={{ listStyle: "none", lineHeight: 1.7 }}>
            {simRows.slice(0, 30).map((s, i) => {
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
    </div>
  );
}

export default function SimRecoveryPage() {
  return (
    <VaultUnlockGate title="Unlock device data for SIM Recovery">
      <SimRecoveryBody />
    </VaultUnlockGate>
  );
}

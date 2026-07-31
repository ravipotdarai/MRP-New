"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useVaultSession } from "@/lib/vault-session";

export function VaultUnlockGate({
  children,
  title = "Unlock Drive vault",
}: {
  children: ReactNode;
  title?: string;
}) {
  const { unlocked, busy, error, info, unlock, lock, refresh, meta, clearError } =
    useVaultSession();
  const [pin, setPin] = useState("");

  if (unlocked) {
    return (
      <div>
        <div className="vault-session-bar">
          <span className="muted mono">
            {meta?.name || "vault"}
            {meta?.modifiedTime ? ` · ${new Date(meta.modifiedTime).toLocaleString()}` : ""}
          </span>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={busy} onClick={() => void refresh(false)}>
              Refresh
            </button>
            <button type="button" className="btn" onClick={() => lock()}>
              Lock vault
            </button>
          </div>
        </div>
        {info ? <p className="badge badge-safe" style={{ marginBottom: "1rem" }}>{info}</p> : null}
        {children}
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    await unlock(pin);
  };

  return (
    <div className="panel rise" style={{ maxWidth: 420 }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem" }}>{title}</h2>
      <p className="muted" style={{ marginTop: "0.5rem" }}>
        Enter your MRP PIN. Decryption stays in this browser; plaintext is never sent to Nest.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} style={{ marginTop: "1rem" }}>
        <label className="muted" htmlFor="vault-pin">
          PIN
        </label>
        <input
          id="vault-pin"
          className="input"
          type="password"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          minLength={4}
          required
          style={{ display: "block", width: "100%", marginTop: "0.35rem" }}
        />
        {error ? (
          <p className="badge badge-alert" style={{ marginTop: "0.75rem" }}>
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: "1rem" }}>
          {busy ? "Opening…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useVaultSession } from "@/lib/vault-session";

export function VaultUnlockGate({
  children,
  title = "Unlock device data",
}: {
  children: ReactNode;
  title?: string;
}) {
  const { unlocked, busy, error, info, unlock, clearError } = useVaultSession();
  const [pin, setPin] = useState("");

  if (unlocked) {
    return (
      <div>
        {info ? <p className="badge badge-safe mb-md">{info}</p> : null}
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
    <div className="panel unlock-panel rise">
      <h2 className="panel-title">{title}</h2>
      <p className="muted mt-sm">
        Enter your PathSync PIN. Decryption stays in this browser; plaintext is never sent to Nest.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-lg">
        <label className="muted" htmlFor="session-pin">
          PIN
        </label>
        <input
          id="session-pin"
          className="input input-block"
          type="password"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          minLength={4}
          required
        />
        {error ? <p className="badge badge-alert mt-md">{error}</p> : null}
        <button type="submit" className="btn btn-primary mt-lg" disabled={busy}>
          {busy ? "Opening…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useVaultSession } from "@/lib/vault-session";
import { SessionInlineControls } from "@/components/SessionInlineControls";

export function VaultUnlockGate({
  children,
  title = "Unlock device data",
  showSessionControls = true,
}: {
  children: ReactNode;
  title?: string;
  showSessionControls?: boolean;
}) {
  const { unlocked, busy, hydrating, unlockStage, error, info, unlock, clearError } =
    useVaultSession();
  const [pin, setPin] = useState("");

  if (unlocked) {
    return (
      <div>
        <div className="unlock-status-row">
          {info ? <p className="badge badge-safe mb-md">{info}</p> : null}
          {hydrating ? (
            <p className="muted unlock-stage mb-md" aria-live="polite">
              {unlockStage || "Loading full history in the background…"}
            </p>
          ) : null}
          {showSessionControls ? <SessionInlineControls className="unlock-status-controls" /> : null}
        </div>
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
    <div className="panel unlock-panel rise" data-testid="pin-unlock-panel">
      <h2 className="panel-title unlock-title">{title}</h2>
      <p className="muted unlock-lead">
        Enter your <strong>PathSync PIN</strong> (the same PIN used for Drive backup on your phone).
        Decryption stays in this browser; plaintext is never sent to MRP servers.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="unlock-form">
        <div className="field">
          <label htmlFor="session-pin">PIN</label>
          <input
            id="session-pin"
            className="input"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            data-testid="pathsync-pin"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            minLength={4}
            required
            disabled={busy}
            placeholder="••••"
          />
        </div>
        {error ? <p className="badge badge-alert">{error}</p> : null}
        {busy && unlockStage ? (
          <p className="muted unlock-stage" aria-live="polite">
            {unlockStage}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary unlock-submit" disabled={busy}>
          {busy ? "Opening…" : "Unlock"}
        </button>
      </form>
      <p className="muted unlock-hint">
        Unlock shows the last hour on the map first, then loads the rest of your history in the
        background. Decryption stays in this browser.
      </p>
    </div>
  );
}

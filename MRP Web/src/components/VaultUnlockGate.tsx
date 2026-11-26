"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useVaultSession } from "@/lib/vault-session";
import { SessionInlineControls } from "@/components/SessionInlineControls";
import { LoadingProgress } from "@/components/LoadingProgress";

export function VaultUnlockGate({
  children,
  title = "Unlock device data",
  showSessionControls = true,
  /** @deprecated Selfies unlock before older history — children always show once unlocked. */
  hideChildrenWhileHydrating = false,
}: {
  children: ReactNode;
  title?: string;
  showSessionControls?: boolean;
  hideChildrenWhileHydrating?: boolean;
}) {
  const { unlocked, busy, hydrating, unlockStage, error, info, unlock, clearError } =
    useVaultSession();
  const [pin, setPin] = useState("");

  if (unlocked) {
    // Only block the page during the initial PIN open (busy), not background history.
    const blocking = busy && !hydrating;
    const softHydrate = hydrating && !busy;
    return (
      <div>
        {blocking ? (
          <LoadingProgress
            title="Opening device data"
            detail={unlockStage || "Decrypting Drive packs…"}
          />
        ) : null}
        {softHydrate ? (
          <LoadingProgress
            compact
            title="Finishing unlock"
            detail={unlockStage || "Loading zones & recent activity…"}
          />
        ) : null}
        {!blocking && !softHydrate && unlockStage ? (
          <p className="muted" style={{ fontSize: "0.82rem", marginBottom: "0.65rem" }}>
            {unlockStage}
          </p>
        ) : null}
        {!blocking && !softHydrate && info ? (
          <p className="badge badge-safe mb-md unlock-info-badge">{info}</p>
        ) : null}
        {showSessionControls && !blocking ? (
          <div className="unlock-status-row">
            <SessionInlineControls className="unlock-status-controls" />
          </div>
        ) : null}
        {blocking || (hideChildrenWhileHydrating && softHydrate) ? (
          <p className="muted" style={{ marginTop: "0.5rem" }}>
            {hideChildrenWhileHydrating
              ? "Photos load next — older history continues in the background."
              : null}
          </p>
        ) : (
          children
        )}
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
        {busy ? (
          <LoadingProgress
            compact
            title="Opening device data"
            detail={unlockStage || "Connecting…"}
          />
        ) : null}
        <button type="submit" className="btn btn-primary unlock-submit" disabled={busy}>
          {busy ? "Opening…" : "Unlock"}
        </button>
      </form>
      <p className="muted unlock-hint">
        Unlock once per browser tab. Recent data and photos appear first; older history fills in
        quietly.
      </p>
    </div>
  );
}

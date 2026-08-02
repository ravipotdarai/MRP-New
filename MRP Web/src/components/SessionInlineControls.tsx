"use client";

import { useVaultSession } from "@/lib/vault-session";

/** Compact sync time + Refresh + Lock — used on Locate after High-accuracy. */
export function SessionInlineControls({ className = "" }: { className?: string }) {
  const { unlocked, busy, refresh, lock, meta } = useVaultSession();
  if (!unlocked) return null;
  return (
    <span className={`session-inline ${className}`}>
      <span className="mono muted session-inline-time">
        {meta?.modifiedTime ? new Date(meta.modifiedTime).toLocaleString() : "Session open"}
      </span>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void refresh(false)}>
        Refresh
      </button>
      <button type="button" className="btn btn-sm" onClick={() => lock()}>
        Lock session
      </button>
    </span>
  );
}

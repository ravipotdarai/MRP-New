"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useVaultSession } from "@/lib/vault-session";

/**
 * Soft anti-abuse: context menu off on sensitive surfaces; DevTools heuristic → warn + optional relock.
 * Not a security boundary — browsers cannot fully disable inspect.
 */
export function SoftSecurity({ children }: { children: ReactNode }) {
  const { unlocked, lock } = useVaultSession();
  const [inspectWarn, setInspectWarn] = useState(false);

  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("input, textarea, [contenteditable=true], a, .allow-context")) return;
      if (t.closest(".sensitive-surface")) {
        e.preventDefault();
      }
    };
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) ||
        (e.ctrlKey && e.key.toUpperCase() === "U")
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    let warned = false;
    const tick = () => {
      const widthGap = Math.abs(window.outerWidth - window.innerWidth) > 160;
      const heightGap = Math.abs(window.outerHeight - window.innerHeight) > 160;
      if ((widthGap || heightGap) && !warned) {
        warned = true;
        setInspectWarn(true);
        lock();
      }
    };
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, [unlocked, lock]);

  return (
    <>
      {inspectWarn ? (
        <div className="inspect-banner" role="status">
          Secure session — inspection suspected. Session was locked. Unlock again to continue.
          <button type="button" className="btn" style={{ marginLeft: "0.75rem" }} onClick={() => setInspectWarn(false)}>
            Dismiss
          </button>
        </div>
      ) : null}
      {children}
    </>
  );
}

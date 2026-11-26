"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Soft anti-abuse: context menu off on sensitive surfaces; DevTools heuristic → warn only.
 * Does NOT auto-lock (false positives with sidebars / IDE / zoom caused repeated PIN prompts).
 */
export function SoftSecurity({ children }: { children: ReactNode }) {
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
        setInspectWarn(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {inspectWarn ? (
        <div className="inspect-banner" role="status">
          Secure session — keep DevTools closed on shared machines.
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginLeft: "0.75rem" }}
            onClick={() => setInspectWarn(false)}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {children}
    </>
  );
}

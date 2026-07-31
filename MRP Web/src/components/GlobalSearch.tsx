"use client";

import { useMemo, useState } from "react";
import { useVaultSession } from "@/lib/vault-session";
import { searchVault } from "@/lib/vault-selectors";

export function GlobalSearch() {
  const { vault, unlocked } = useVaultSession();
  const [q, setQ] = useState("");
  const hits = useMemo(() => (unlocked ? searchVault(vault, q) : []), [vault, unlocked, q]);

  if (!unlocked) return null;

  return (
    <div className="global-search">
      <input
        className="input"
        placeholder="Search events, apps, geofences…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Global vault search"
      />
      {q.trim() && hits.length === 0 ? (
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          No matches
        </p>
      ) : null}
      {hits.length > 0 ? (
        <ul className="search-hits">
          {hits.map((h, i) => (
            <li key={`${h.kind}-${h.label}-${i}`}>
              <span className="badge">{h.kind}</span> <strong>{h.label}</strong>
              <span className="muted"> · {h.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";

function formatDur(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return "0s";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function AppUsageBody() {
  const { vault } = useVaultSession();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"time" | "name">("time");

  const sessions = useMemo(() => vault?.appUsage?.sessions ?? [], [vault?.appUsage?.sessions]);
  const byApp = useMemo(() => {
    const map = new Map<string, { name: string; sec: number; count: number }>();
    for (const s of sessions) {
      const pkg = s.packageName || "unknown";
      const prev = map.get(pkg) || { name: s.appName || pkg, sec: 0, count: 0 };
      prev.sec += Number(s.durationSeconds) || 0;
      prev.count += 1;
      map.set(pkg, prev);
    }
    let list = [...map.entries()].map(([pkg, v]) => ({ pkg, ...v }));
    if (q.trim()) {
      const qq = q.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(qq) || a.pkg.toLowerCase().includes(qq));
    }
    list.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.sec - a.sec));
    return list;
  }, [sessions, q, sort]);

  const totalSec = byApp.reduce((n, a) => n + a.sec, 0);
  const safety = vault?.appUsage?.safety;
  const maxSec = byApp[0]?.sec || 1;

  return (
    <div>
      <h1 className="page-title">App Usage</h1>
      <p className="page-lead">
        Daily usage from your encrypted Drive vault (phone exports today). System apps excluded.
      </p>
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <p className="muted">
          Sessions: {sessions.length} · Unique apps: {byApp.length} · Foreground total: {formatDur(totalSec)}
          {vault?.appUsage?.dayStartMs
            ? ` · Day ${new Date(vault.appUsage.dayStartMs).toLocaleDateString()}`
            : ""}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          <input
            className="input"
            placeholder="Search apps…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 240 }}
          />
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as "time" | "name")}>
            <option value="time">Sort by time</option>
            <option value="name">Sort by name</option>
          </select>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2>Most used</h2>
        {byApp.length === 0 ? (
          <p className="muted">No sessions — unlock after phone vault v3 backup.</p>
        ) : (
          <ul className="usage-bars">
            {byApp.slice(0, 15).map((a) => (
              <li key={a.pkg}>
                <div className="usage-bar-label">
                  <strong>{a.name}</strong>
                  <span className="muted mono">{formatDur(a.sec)} · {a.count}x</span>
                </div>
                <div className="usage-bar-track">
                  <div className="usage-bar-fill" style={{ width: `${Math.round((a.sec / maxSec) * 100)}%` }} />
                </div>
                <p className="muted mono" style={{ fontSize: "0.75rem" }}>
                  {a.pkg}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid-2">
        {(["sms", "camera", "microphone"] as const).map((key) => (
          <div className="panel" key={key}>
            <h2>Safety · {key}</h2>
            {(safety?.[key] || []).length === 0 ? (
              <p className="muted">None listed</p>
            ) : (
              <ul className="muted" style={{ listStyle: "none", lineHeight: 1.6 }}>
                {(safety?.[key] || []).map((a, i) => (
                  <li key={i}>
                    <strong>{a.appName || a.packageName}</strong>
                    <span className="mono"> · {(a.permissions || []).join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AppUsagePage() {
  return (
    <VaultUnlockGate title="Unlock vault for App Usage">
      <AppUsageBody />
    </VaultUnlockGate>
  );
}

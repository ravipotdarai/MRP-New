"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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

type Tab = "dashboard" | "timeline" | "safety";

function AppUsageBody() {
  const { vault } = useVaultSession();
  const search = useSearchParams();
  const router = useRouter();
  const tabParam = search.get("tab");
  const tab: Tab =
    tabParam === "timeline" || tabParam === "safety" || tabParam === "dashboard"
      ? tabParam
      : "dashboard";

  const setTab = (t: Tab) => {
    const q = t === "dashboard" ? "/app-usage" : `/app-usage?tab=${t}`;
    router.replace(q);
  };

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

  const timelineSessions = useMemo(() => {
    return [...sessions].sort((a, b) => (Number(b.startTime) || 0) - (Number(a.startTime) || 0));
  }, [sessions]);

  return (
    <div>
      <h1 className="page-title rise">App Usage</h1>
      <p className="page-lead rise rise-delay-1">
        Daily usage from your encrypted Drive backup (phone exports today). System apps excluded.
      </p>

      <div className="tab-row rise rise-delay-1" role="tablist">
        {(
          [
            ["dashboard", "Dashboard"],
            ["timeline", "Timeline"],
            ["safety", "Safety"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`btn ${tab === id ? "btn-primary" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <a className="btn" href="/reports">
          Report
        </a>
      </div>

      {tab === "dashboard" ? (
        <>
          <div className="panel rise rise-delay-2" style={{ marginBottom: "1rem" }}>
            <p className="muted">
              Sessions: {sessions.length} · Unique apps: {byApp.length} · Foreground total:{" "}
              {formatDur(totalSec)}
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

          <div className="panel rise rise-delay-3">
            <h2>Most used</h2>
            {byApp.length === 0 ? (
              <p className="muted">No sessions — unlock after the phone syncs today&apos;s usage.</p>
            ) : (
              <ul className="usage-bars">
                {byApp.slice(0, 15).map((a) => (
                  <li key={a.pkg}>
                    <div className="usage-bar-label">
                      <strong>{a.name}</strong>
                      <span className="muted mono">
                        {formatDur(a.sec)} · {a.count}x
                      </span>
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
        </>
      ) : null}

      {tab === "timeline" ? (
        <div className="panel rise rise-delay-2">
          <h2>Usage timeline</h2>
          {timelineSessions.length === 0 ? (
            <p className="muted">No session timeline in this backup yet.</p>
          ) : (
            <ul className="timeline-list timeline-spine">
              {timelineSessions.slice(0, 80).map((s, i) => (
                <li key={`${s.packageName}-${s.startTime}-${i}`} className="timeline-item">
                  <div className="timeline-row" style={{ cursor: "default" }}>
                    <span className="tl-icon tl-icon-neutral" aria-hidden>
                      ▦
                    </span>
                    <span className="timeline-row-body">
                      <strong>{s.appName || s.packageName || "App"}</strong>
                      <span className="muted timeline-meta">
                        {s.startTime ? new Date(s.startTime).toLocaleString() : "—"}
                        {s.endTime ? ` → ${new Date(s.endTime).toLocaleTimeString()}` : ""}
                        {" · "}
                        {formatDur(Number(s.durationSeconds) || 0)}
                      </span>
                      <span className="muted mono" style={{ fontSize: "0.75rem" }}>
                        {s.packageName}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "safety" ? (
        <div className="grid-2 rise rise-delay-2">
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
      ) : null}
    </div>
  );
}

export default function AppUsagePage() {
  return (
    <VaultUnlockGate title="Unlock device data for App Usage">
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <AppUsageBody />
      </Suspense>
    </VaultUnlockGate>
  );
}

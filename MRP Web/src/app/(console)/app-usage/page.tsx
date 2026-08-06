"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";
import {
  asRows,
  eventTimeMs,
  eventType,
  pathDistanceKm,
  travelPoints,
} from "@/lib/vault-selectors";
import {
  consolidateSessionsByApp,
  dedupeSessions,
  formatAppLabel,
  formatDuration,
  formatPermissionList,
  mergeOverlappingSessions,
  rankScreenTimeShare,
  type AppUsageSession,
} from "@/lib/app-usage-utils";

type Tab = "dashboard" | "timeline" | "reports" | "safety";

function Widget({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="usage-widget">
      <p className="usage-widget-title">{title}</p>
      <p className="usage-widget-value mono">{value}</p>
      {subtitle ? <p className="muted usage-widget-sub">{subtitle}</p> : null}
    </div>
  );
}

function AppUsageBody() {
  const { vault } = useVaultSession();
  const search = useSearchParams();
  const router = useRouter();
  const tabParam = search.get("tab");
  const tab: Tab =
    tabParam === "timeline" || tabParam === "safety" || tabParam === "reports" || tabParam === "dashboard"
      ? tabParam
      : "dashboard";

  const setTab = (t: Tab) => {
    router.replace(t === "dashboard" ? "/app-usage" : `/app-usage?tab=${t}`);
  };

  const [impactPeriod, setImpactPeriod] = useState<"TODAY" | "7D">("TODAY");
  const [reportFrame, setReportFrame] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("DAILY");

  const rawSessions = useMemo(
    () => (vault?.appUsage?.sessions || []) as AppUsageSession[],
    [vault?.appUsage?.sessions],
  );
  const sessions = useMemo(() => dedupeSessions(rawSessions), [rawSessions]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const { totalScreenTime, longestSession, appsUsedToday } = useMemo(() => {
    let totalScreenTime = 0;
    let longestSession = 0;
    const todayPackages = new Set<string>();
    for (const s of sessions) {
      const start = s.startTime || 0;
      const end = s.endTime || start;
      if (end >= todayStart || start >= todayStart) {
        const overlapStart = Math.max(start, todayStart);
        if (end > overlapStart) totalScreenTime += (end - overlapStart) / 1000;
      }
      if ((s.durationSeconds || 0) > longestSession) longestSession = s.durationSeconds || 0;
      if (start >= todayStart && s.packageName) todayPackages.add(s.packageName);
    }
    return { totalScreenTime, longestSession, appsUsedToday: todayPackages.size };
  }, [sessions, todayStart]);

  const consolidated = useMemo(() => consolidateSessionsByApp(sessions), [sessions]);
  const mostUsed = consolidated[0] || null;
  const currentApp = useMemo(() => {
    const merged = mergeOverlappingSessions(sessions);
    return merged.length
      ? [...merged].sort((a, b) => (b.startTime || 0) - (a.startTime || 0))[0]
      : null;
  }, [sessions]);

  const timelineRows = asRows(vault);
  const unlocksToday = useMemo(
    () =>
      timelineRows.filter(
        (r) => eventType(r).toUpperCase().includes("SCREEN_UNLOCK") && eventTimeMs(r) >= todayStart,
      ).length,
    [timelineRows, todayStart],
  );

  const todayDistance = useMemo(() => {
    const pts = travelPoints(vault, todayStart, Date.now());
    return pathDistanceKm(pts);
  }, [vault, todayStart]);

  const photosToday = useMemo(() => {
    const selfies = vault?.selfies || [];
    return selfies.filter((s) => {
      const o = s as Record<string, unknown>;
      const ts = Number(o.atMs ?? o.timestamp ?? o.time ?? 0);
      return ts >= todayStart;
    }).length;
  }, [vault?.selfies, todayStart]);

  const share = useMemo(
    () => rankScreenTimeShare(sessions, impactPeriod === "TODAY" ? todayStart : weekStart, 10),
    [sessions, impactPeriod, todayStart, weekStart],
  );

  const timelineSessions = useMemo(
    () =>
      mergeOverlappingSessions(sessions)
        .slice()
        .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
        .slice(0, 200),
    [sessions],
  );

  const reportSessions = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let cutoff = todayStart;
    if (reportFrame === "WEEKLY") cutoff = now - 7 * day;
    if (reportFrame === "MONTHLY") cutoff = now - 30 * day;
    return mergeOverlappingSessions(
      dedupeSessions(sessions.filter((s) => (s.startTime || 0) >= cutoff && (s.durationSeconds || 0) > 0)),
    );
  }, [sessions, reportFrame, todayStart]);

  const reportApps = useMemo(() => consolidateSessionsByApp(reportSessions), [reportSessions]);
  const reportTotal = useMemo(
    () => reportApps.reduce((n, a) => n + Math.max(0, a.durationSeconds || 0), 0),
    [reportApps],
  );
  const categoryStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of reportApps) {
      const cat = a.category || "Other";
      map.set(cat, (map.get(cat) || 0) + Math.max(0, a.durationSeconds || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [reportApps]);

  const safety = vault?.appUsage?.safety;
  const safetyKeys = useMemo(() => {
    const base = ["sms", "camera", "microphone", "location", "contacts"] as const;
    return base.filter((key) => (safety?.[key]?.length || 0) > 0 || key === "sms" || key === "camera" || key === "microphone");
  }, [safety]);
  const dayLabel = vault?.appUsage?.dayStartMs
    ? new Date(vault.appUsage.dayStartMs).toLocaleDateString()
    : "today";

  return (
    <div>
      <h1 className="page-title rise">App Usage</h1>
      <p className="page-lead rise rise-delay-1">
        Same layout as the phone App Usage screen — from your encrypted Drive backup (sessions for{" "}
        {dayLabel}). Weekly/monthly reports only include what was synced.
      </p>

      <div className="tab-row rise rise-delay-1" role="tablist">
        {(
          [
            ["dashboard", "Dashboard"],
            ["timeline", "Timeline"],
            ["reports", "Reports"],
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
      </div>

      {tab === "dashboard" ? (
        <>
          <div className="panel rise rise-delay-2" style={{ marginBottom: "1rem" }}>
            <h2>App Usage Overview</h2>
            <div className="usage-hero-card">
              <p className="usage-hero-label">Apps Used Today</p>
              <p className="usage-hero-value mono">{appsUsedToday}</p>
              <p className="muted">Unique apps launched · synced day</p>
            </div>
            <div className="usage-widget-grid">
              <Widget title="Screen Time" value={formatDuration(totalScreenTime)} subtitle="Total today" />
              <Widget
                title="Most Used"
                value={mostUsed ? formatAppLabel(mostUsed.appName, mostUsed.packageName) : "None"}
                subtitle={mostUsed ? formatDuration(mostUsed.durationSeconds) : ""}
              />
              <Widget title="Longest Session" value={formatDuration(longestSession)} subtitle="Single sitting" />
              <Widget
                title="Current App"
                value={currentApp ? formatAppLabel(currentApp.appName, currentApp.packageName) : "None"}
                subtitle={currentApp ? formatDuration(currentApp.durationSeconds || 0) : "Session"}
              />
              <Widget title="Unlocks" value={String(unlocksToday)} subtitle="Today" />
              <Widget title="Distance" value={`${todayDistance.toFixed(2)} km`} subtitle="Estimated today" />
              <Widget title="Photos" value={String(photosToday)} subtitle="Selfies in backup today" />
              <Widget title="Sessions" value={String(sessions.length)} subtitle="In this sync" />
            </div>
          </div>

          <div className="panel rise rise-delay-3" style={{ marginBottom: "1rem" }}>
            <div className="usage-impact-head">
              <h2 style={{ margin: 0 }}>Screen-time share</h2>
              <div className="tab-row" style={{ margin: 0 }}>
                {(["TODAY", "7D"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`btn btn-sm ${impactPeriod === p ? "btn-primary" : ""}`}
                    onClick={() => setImpactPeriod(p)}
                  >
                    {p === "TODAY" ? "Today" : "7 days"}
                  </button>
                ))}
              </div>
            </div>
            <p className="muted" style={{ fontSize: "0.82rem", margin: "0.5rem 0 0.85rem" }}>
              Foreground share from UsageStats — not mAh or Android Battery %. Vault sync is usually
              one day, so 7-day may match today until multi-day sync ships.
            </p>
            {share.apps.length === 0 ? (
              <p className="muted">No app usage in this period.</p>
            ) : (
              <ul className="usage-bars">
                {share.apps.map((a, i) => (
                  <li key={`${a.packageName}-${i}`}>
                    <div className="usage-bar-label">
                      <strong>
                        {i + 1}. {a.appName}
                      </strong>
                      <span className="muted mono">
                        {Math.round(a.impactPercent)}% · {formatDuration(a.durationSeconds)}
                      </span>
                    </div>
                    <div className="usage-bar-track">
                      <div
                        className="usage-bar-fill"
                        style={{ width: `${Math.min(100, a.impactPercent)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel rise rise-delay-3">
            <h2>Most Used Apps</h2>
            {consolidated.length === 0 ? (
              <p className="muted">No sessions — unlock after the phone syncs today&apos;s usage.</p>
            ) : (
              <ul className="usage-bars">
                {consolidated.slice(0, 8).map((a, i) => (
                  <li key={a.packageName}>
                    <div className="usage-bar-label">
                      <strong>
                        {i + 1}. {formatAppLabel(a.appName, a.packageName)}
                      </strong>
                      <span className="muted mono">
                        {formatDuration(a.durationSeconds)} · {a.sessionCount}x
                      </span>
                    </div>
                    <p className="muted mono" style={{ fontSize: "0.75rem" }}>
                      {a.packageName}
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
          <p className="muted" style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}>
            App-only chronological sessions (overlapping merges), same as the phone.
          </p>
          {timelineSessions.length === 0 ? (
            <p className="muted">No session timeline in this backup yet.</p>
          ) : (
            <ul className="usage-timeline">
              {timelineSessions.map((s, i) => {
                const prev = timelineSessions[i - 1];
                const day =
                  !prev ||
                  new Date(s.startTime || 0).toDateString() !== new Date(prev.startTime || 0).toDateString()
                    ? new Date(s.startTime || 0).toLocaleDateString([], { month: "short", day: "numeric" })
                    : null;
                return (
                  <li key={`${s.packageName}-${s.startTime}-${i}`}>
                    {day ? <p className="usage-day-label">{day}</p> : null}
                    <div className="usage-timeline-row">
                      <span className="mono muted usage-time">
                        {s.startTime
                          ? new Date(s.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </span>
                      <span className="usage-timeline-dot" aria-hidden />
                      <div>
                        <strong>{formatAppLabel(s.appName, s.packageName)}</strong>
                        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                          {formatDuration(s.durationSeconds || 0)}
                          {s.endTime
                            ? ` · until ${new Date(s.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                        </p>
                        <p className="muted mono" style={{ margin: 0, fontSize: "0.72rem" }}>
                          {s.packageName}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === "reports" ? (
        <div className="panel rise rise-delay-2">
          <h2>Reports</h2>
          <div className="tab-row">
            {(["DAILY", "WEEKLY", "MONTHLY"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`btn btn-sm ${reportFrame === f ? "btn-primary" : ""}`}
                onClick={() => setReportFrame(f)}
              >
                {f === "DAILY" ? "Daily" : f === "WEEKLY" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
          <ul className="muted" style={{ listStyle: "none", lineHeight: 1.8, margin: "0.75rem 0" }}>
            <li>
              Total foreground: <strong className="mono">{formatDuration(reportTotal)}</strong>
            </li>
            <li>
              Apps: <strong className="mono">{reportApps.length}</strong>
            </li>
            <li>
              Sessions: <strong className="mono">{reportSessions.length}</strong>
            </li>
          </ul>
          <h3 style={{ fontSize: "1rem" }}>By category</h3>
          {categoryStats.length === 0 ? (
            <p className="muted">No category data.</p>
          ) : (
            <ul className="usage-bars">
              {categoryStats.map(([cat, sec]) => (
                <li key={cat}>
                  <div className="usage-bar-label">
                    <strong>{cat}</strong>
                    <span className="mono muted">{formatDuration(sec)}</span>
                  </div>
                  <div className="usage-bar-track">
                    <div
                      className="usage-bar-fill"
                      style={{ width: `${reportTotal ? Math.round((sec / reportTotal) * 100) : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <h3 style={{ fontSize: "1rem", marginTop: "1.25rem" }}>Top apps</h3>
          <ul className="usage-bars">
            {reportApps.slice(0, 8).map((a) => (
              <li key={a.packageName}>
                <div className="usage-bar-label">
                  <strong>{formatAppLabel(a.appName, a.packageName)}</strong>
                  <span className="mono muted">{formatDuration(a.durationSeconds)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "safety" ? (
        <div className="grid-2 rise rise-delay-2">
          {safetyKeys.map((key) => (
            <div className="panel" key={key}>
              <h2>Safety · {key}</h2>
              <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
                Sensitive permission apps from the phone scan in this backup.
              </p>
              {(safety?.[key] || []).length === 0 ? (
                <p className="muted">None listed</p>
              ) : (
                <ul className="muted" style={{ listStyle: "none", lineHeight: 1.6 }}>
                  {(safety?.[key] || []).map((a, i) => (
                    <li key={`${a.packageName}-${i}`} style={{ marginBottom: "0.55rem" }}>
                      <strong>{a.appName || a.packageName}</strong>
                      <br />
                      <span className="mono" style={{ fontSize: "0.75rem" }}>
                        {a.packageName}
                      </span>
                      <br />
                      <span className="mono" style={{ fontSize: "0.72rem" }}>
                        {formatPermissionList(a.permissions)}
                      </span>
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

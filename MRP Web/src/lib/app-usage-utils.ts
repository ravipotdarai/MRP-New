/**
 * App Usage helpers — parity with MRP/src/features/app-usage/AppUsageUtils.ts
 * (browser; no React Native imports).
 */

export type AppUsageSession = {
  packageName?: string;
  appName?: string;
  category?: string;
  startTime?: number;
  endTime?: number;
  durationSeconds?: number;
};

const IGNORED_PACKAGES = new Set([
  "android",
  "com.android.systemui",
  "com.android.systemui.overlay",
  "com.android.permissioncontroller",
  "com.google.android.permissioncontroller",
  "com.android.phone",
  "com.android.server.telecom",
  "com.android.providers.media",
  "com.android.providers.media.module",
  "com.android.providers.downloads",
  "com.google.android.packageinstaller",
  "com.android.packageinstaller",
  "com.android.intentresolver",
]);

const IGNORED_PREFIXES = [
  "com.android.launcher",
  "com.google.android.apps.nexuslauncher",
  "com.sec.android.app.launcher",
  "com.miui.home",
  "com.huawei.android.launcher",
  "com.oppo.launcher",
  "com.vivo.launcher",
  "com.nothing.launcher",
];

export function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds || 0));
  if (safe < 60) return `${safe}s`;
  const mins = Math.floor(safe / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

export function formatAppName(name: string) {
  if (!name) return "Unknown";
  if (!name.includes(".")) return name;
  const parts = name.split(".");
  let lastPart = parts[parts.length - 1];
  if (lastPart.length < 3 && parts.length > 1) lastPart = parts[parts.length - 2];
  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
}

export function formatAppLabel(appName?: string, packageName?: string) {
  if (appName && !appName.includes(".")) return appName;
  return formatAppName(appName || packageName || "Unknown");
}

export function isNoisePackage(packageName: string) {
  if (!packageName) return true;
  if (IGNORED_PACKAGES.has(packageName)) return true;
  return IGNORED_PREFIXES.some((p) => packageName.startsWith(p));
}

export function dedupeSessions(sessions: AppUsageSession[]): AppUsageSession[] {
  const seen = new Set<string>();
  const unique: AppUsageSession[] = [];
  for (const s of sessions) {
    const pkg = s.packageName || "";
    if (isNoisePackage(pkg)) continue;
    const key = `${pkg}_${s.startTime}_${s.endTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
  }
  return unique;
}

export function mergeOverlappingSessions(sessions: AppUsageSession[]): AppUsageSession[] {
  const byPkg = new Map<string, AppUsageSession[]>();
  for (const s of dedupeSessions(sessions)) {
    const pkg = s.packageName || "unknown";
    const list = byPkg.get(pkg) || [];
    list.push(s);
    byPkg.set(pkg, list);
  }
  const merged: AppUsageSession[] = [];
  for (const [, list] of byPkg) {
    list.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    let cur: AppUsageSession | null = null;
    for (const s of list) {
      if (!cur) {
        cur = { ...s };
        continue;
      }
      if ((s.startTime || 0) <= (cur.endTime || 0) + 1000) {
        cur.endTime = Math.max(cur.endTime || 0, s.endTime || 0);
        cur.durationSeconds = Math.max(0, ((cur.endTime || 0) - (cur.startTime || 0)) / 1000);
        if (s.appName && !s.appName.includes(".")) cur.appName = s.appName;
      } else {
        merged.push(cur);
        cur = { ...s };
      }
    }
    if (cur) merged.push(cur);
  }
  return merged;
}

export type ConsolidatedApp = {
  packageName: string;
  appName: string;
  durationSeconds: number;
  sessionCount: number;
  lastUsed: number;
};

export function consolidateSessionsByApp(sessions: AppUsageSession[]): ConsolidatedApp[] {
  const mergedSessions = mergeOverlappingSessions(sessions);
  const byPkg: Record<string, ConsolidatedApp> = {};
  for (const s of mergedSessions) {
    const pkg = s.packageName || "unknown";
    if (isNoisePackage(pkg)) continue;
    const dur = Math.min(Math.max(0, s.durationSeconds || 0), 6 * 60 * 60);
    if (dur < 2) continue;
    if (!byPkg[pkg]) {
      byPkg[pkg] = {
        packageName: pkg,
        appName: s.appName || pkg,
        durationSeconds: 0,
        lastUsed: s.endTime || s.startTime || 0,
        sessionCount: 0,
      };
    }
    byPkg[pkg].durationSeconds += dur;
    byPkg[pkg].sessionCount += 1;
    const last = s.endTime || s.startTime || 0;
    if (last > byPkg[pkg].lastUsed) byPkg[pkg].lastUsed = last;
    if (s.appName && !s.appName.includes(".")) byPkg[pkg].appName = s.appName;
  }
  const byLabel: Record<string, ConsolidatedApp> = {};
  for (const app of Object.values(byPkg)) {
    const labelKey = formatAppLabel(app.appName, app.packageName).trim().toLowerCase();
    if (!byLabel[labelKey]) {
      byLabel[labelKey] = { ...app };
      continue;
    }
    const existing = byLabel[labelKey];
    existing.durationSeconds += app.durationSeconds;
    existing.sessionCount += app.sessionCount;
    if (app.lastUsed > existing.lastUsed) existing.lastUsed = app.lastUsed;
  }
  return Object.values(byLabel)
    .filter((a) => a.durationSeconds >= 5)
    .sort((a, b) => b.durationSeconds - a.durationSeconds);
}

export function rankScreenTimeShare(sessions: AppUsageSession[], sinceMs: number, limit = 10) {
  const windowed = sessions.filter(
    (s) => (s.endTime || s.startTime || 0) >= sinceMs || (s.startTime || 0) >= sinceMs,
  );
  const clipped = windowed.map((s) => {
    const start = Math.max(s.startTime || 0, sinceMs);
    const end = Math.max(s.endTime || s.startTime || 0, start);
    return { ...s, startTime: start, endTime: end, durationSeconds: Math.max(0, (end - start) / 1000) };
  });
  const consolidated = consolidateSessionsByApp(clipped);
  const totalSeconds = consolidated.reduce((sum, a) => sum + a.durationSeconds, 0);
  return {
    totalSeconds,
    apps: consolidated.slice(0, limit).map((a) => ({
      packageName: a.packageName,
      appName: formatAppLabel(a.appName, a.packageName),
      durationSeconds: a.durationSeconds,
      impactPercent: totalSeconds > 0 ? (a.durationSeconds / totalSeconds) * 100 : 0,
    })),
  };
}

export function guessCategory(s: AppUsageSession): string {
  const pkg = (s.packageName || "").toLowerCase();
  if (pkg.includes("chrome") || pkg.includes("browser") || pkg.includes("firefox")) return "Browser";
  if (pkg.includes("whatsapp") || pkg.includes("telegram") || pkg.includes("messenger") || pkg.includes("sms"))
    return "Communication";
  if (pkg.includes("youtube") || pkg.includes("netflix") || pkg.includes("spotify") || pkg.includes("music"))
    return "Media";
  if (pkg.includes("maps") || pkg.includes("uber") || pkg.includes("ola")) return "Maps & travel";
  if (pkg.includes("camera") || pkg.includes("gallery") || pkg.includes("photos")) return "Photos";
  if (pkg.includes("mail") || pkg.includes("gmail") || pkg.includes("outlook")) return "Productivity";
  return s.category && s.category !== "Other" ? s.category : "Other";
}

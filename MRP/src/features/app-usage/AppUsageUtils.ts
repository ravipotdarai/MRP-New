import {AppUsageSession} from './AppUsageScreen';

export const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds || 0));
  if (safe < 60) return `${safe}s`;
  const mins = Math.floor(safe / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
};

export const formatAppName = (name: string) => {
  if (!name) return 'Unknown';
  if (!name.includes('.')) {
    return name;
  }
  const parts = name.split('.');
  let lastPart = parts[parts.length - 1];
  if (lastPart.length < 3 && parts.length > 1) {
    lastPart = parts[parts.length - 2];
  }
  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
};

/** Prefer the real launcher label; fall back to a short package token. */
export const formatAppLabel = (appName: string, packageName?: string) => {
  if (appName && !appName.includes('.')) return appName;
  return formatAppName(appName || packageName || 'Unknown');
};

const IGNORED_PACKAGES = new Set([
  'android',
  'com.android.systemui',
  'com.android.systemui.overlay',
  'com.android.permissioncontroller',
  'com.google.android.permissioncontroller',
  'com.android.phone',
  'com.android.server.telecom',
  'com.android.providers.media',
  'com.android.providers.media.module',
  'com.android.providers.downloads',
  'com.google.android.packageinstaller',
  'com.android.packageinstaller',
  'com.android.intentresolver',
  'com.samsung.android.app.telephonyui',
  'com.miui.securitycenter',
]);

const IGNORED_PACKAGE_PREFIXES = [
  'com.android.launcher',
  'com.google.android.apps.nexuslauncher',
  'com.sec.android.app.launcher',
  'com.miui.home',
  'com.huawei.android.launcher',
  'com.oppo.launcher',
  'com.vivo.launcher',
  'com.nothing.launcher',
];

export function isNoisePackage(packageName: string): boolean {
  if (!packageName) return true;
  if (IGNORED_PACKAGES.has(packageName)) return true;
  return IGNORED_PACKAGE_PREFIXES.some(p => packageName.startsWith(p));
}

/** Drop exact duplicate rows (same package + start + end). */
export function dedupeSessions(sessions: AppUsageSession[]): AppUsageSession[] {
  const seen = new Set<string>();
  const unique: AppUsageSession[] = [];
  for (const s of sessions) {
    if (isNoisePackage(s.packageName)) continue;
    const key = `${s.packageName}_${s.startTime}_${s.endTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
  }
  return unique;
}

/** Merge overlapping / nested sessions for the same package so duration isn't double-counted. */
export function mergeOverlappingSessions(
  sessions: AppUsageSession[],
): AppUsageSession[] {
  const byPkg = new Map<string, AppUsageSession[]>();
  for (const s of dedupeSessions(sessions)) {
    const list = byPkg.get(s.packageName) || [];
    list.push(s);
    byPkg.set(s.packageName, list);
  }

  const merged: AppUsageSession[] = [];
  for (const [, list] of byPkg) {
    list.sort((a, b) => a.startTime - b.startTime);
    let cur: AppUsageSession | null = null;
    for (const s of list) {
      if (!cur) {
        cur = {...s};
        continue;
      }
      if (s.startTime <= cur.endTime + 1000) {
        cur.endTime = Math.max(cur.endTime, s.endTime);
        cur.durationSeconds = Math.max(0, (cur.endTime - cur.startTime) / 1000);
        if (s.appName && !s.appName.includes('.')) cur.appName = s.appName;
      } else {
        merged.push(cur);
        cur = {...s};
      }
    }
    if (cur) merged.push(cur);
  }
  return merged;
}

export type ConsolidatedApp = {
  packageName: string;
  appName: string;
  category: string;
  durationSeconds: number;
  lastUsed: number;
  sessionCount: number;
};

/**
 * One row per app for Timeline/Reports.
 * - Merges overlapping sessions per package
 * - Then merges packages that share the same display label (stops “Chrome” / “Chrome” dupes)
 */
export function consolidateSessionsByApp(
  sessions: AppUsageSession[],
): ConsolidatedApp[] {
  const mergedSessions = mergeOverlappingSessions(sessions);
  const byPkg: Record<string, ConsolidatedApp> = {};

  for (const s of mergedSessions) {
    if (!byPkg[s.packageName]) {
      byPkg[s.packageName] = {
        packageName: s.packageName,
        appName: s.appName || s.packageName,
        category: s.category || 'Other',
        durationSeconds: 0,
        lastUsed: s.endTime || s.startTime,
        sessionCount: 0,
      };
    }
    byPkg[s.packageName].durationSeconds += Math.max(0, s.durationSeconds || 0);
    byPkg[s.packageName].sessionCount += 1;
    const last = s.endTime || s.startTime;
    if (last > byPkg[s.packageName].lastUsed) {
      byPkg[s.packageName].lastUsed = last;
    }
    if (s.appName && !s.appName.includes('.')) {
      byPkg[s.packageName].appName = s.appName;
    }
  }

  // Second pass: merge same display label (case-insensitive)
  const byLabel: Record<string, ConsolidatedApp> = {};
  for (const app of Object.values(byPkg)) {
    const labelKey = formatAppLabel(app.appName, app.packageName).trim().toLowerCase();
    if (!byLabel[labelKey]) {
      byLabel[labelKey] = {...app};
      continue;
    }
    const existing = byLabel[labelKey];
    existing.durationSeconds += app.durationSeconds;
    existing.sessionCount += app.sessionCount;
    if (app.lastUsed > existing.lastUsed) existing.lastUsed = app.lastUsed;
    // Prefer shorter package as canonical (usually the main app)
    if (app.packageName.length < existing.packageName.length) {
      existing.packageName = app.packageName;
      existing.appName = app.appName;
    }
  }

  return Object.values(byLabel)
    .filter(a => a.durationSeconds >= 2)
    .sort((a, b) => b.durationSeconds - a.durationSeconds);
}

export const aggregateAppStats = (sessions: AppUsageSession[]) => {
  const consolidated = consolidateSessionsByApp(sessions);
  const sortedApps = consolidated.map(a => ({
    packageName: a.packageName,
    appName: formatAppLabel(a.appName, a.packageName),
    duration: a.durationSeconds,
    battery: 0,
  }));

  const mostUsedApp = sortedApps.length > 0 ? sortedApps[0] : null;
  const unique = mergeOverlappingSessions(sessions);
  const currentApp =
    unique.length > 0
      ? unique.slice().sort((a, b) => b.startTime - a.startTime)[0]
      : null;

  return {
    sortedApps,
    mostUsedApp,
    currentApp,
    totalDuration: sortedApps.reduce((sum, app) => sum + app.duration, 0),
    battery: 0,
  };
};

export type BatteryImpactApp = {
  packageName: string;
  appName: string;
  durationSeconds: number;
  /** Share of total foreground time in the window (0–100). */
  impactPercent: number;
};

/**
 * Rank apps by foreground duration as a battery-impact proxy.
 * Does not estimate mAh — Android does not expose per-app power to normal apps.
 */
export function rankBatteryImpact(
  sessions: AppUsageSession[],
  sinceMs: number,
  limit = 10,
): {apps: BatteryImpactApp[]; totalSeconds: number} {
  const windowed = sessions.filter(
    s => (s.endTime || s.startTime) >= sinceMs || s.startTime >= sinceMs,
  );
  // Clip duration to the window so "today" isn't inflated by overnight sessions
  const clipped = windowed.map(s => {
    const start = Math.max(s.startTime, sinceMs);
    const end = Math.max(s.endTime || s.startTime, start);
    const durationSeconds = Math.max(0, (end - start) / 1000);
    return {...s, startTime: start, endTime: end, durationSeconds};
  });
  const consolidated = consolidateSessionsByApp(clipped);
  const totalSeconds = consolidated.reduce((sum, a) => sum + a.durationSeconds, 0);
  const apps = consolidated.slice(0, limit).map(a => ({
    packageName: a.packageName,
    appName: formatAppLabel(a.appName, a.packageName),
    durationSeconds: a.durationSeconds,
    impactPercent: totalSeconds > 0 ? (a.durationSeconds / totalSeconds) * 100 : 0,
  }));
  return {apps, totalSeconds};
}

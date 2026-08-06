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
  'com.android.settings',
  'com.android.settings.intelligence',
  'com.google.android.googlequicksearchbox',
  'com.google.android.gms',
  'com.google.android.gsf',
  'com.google.android.ext.services',
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
  'com.google.android.inputmethod',
  'com.samsung.android.inputmethod',
  'com.android.inputmethod',
  'com.google.android.as',
  'com.google.android.apps.wellbeing',
];

const KEEP_ANDROID_PACKAGES = new Set([
  'com.android.chrome',
  'com.android.vending',
  'com.android.documentsui',
]);

const NOISE_LABELS = new Set([
  'android',
  'system',
  'system ui',
  'systemui',
  'google',
  'android system',
]);

export function isNoisePackage(packageName: string, appName?: string): boolean {
  if (!packageName) return true;
  const pkg = packageName.toLowerCase();
  if (IGNORED_PACKAGES.has(pkg)) return true;
  if (IGNORED_PACKAGE_PREFIXES.some(p => pkg.startsWith(p))) return true;
  if (pkg.startsWith('com.android.') && !KEEP_ANDROID_PACKAGES.has(pkg)) return true;
  if (pkg.includes('googlequicksearchbox')) return true;
  const label = formatAppLabel(appName || '', packageName).trim().toLowerCase();
  if (NOISE_LABELS.has(label)) return true;
  return false;
}

/** Drop exact duplicate rows (same package + start + end). */
export function dedupeSessions(sessions: AppUsageSession[]): AppUsageSession[] {
  const seen = new Set<string>();
  const unique: AppUsageSession[] = [];
  for (const s of sessions) {
    if (isNoisePackage(s.packageName, s.appName)) continue;
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
    if (isNoisePackage(s.packageName, s.appName)) continue;
    // Cap absurd durations (stuck sessions)
    const dur = Math.min(Math.max(0, s.durationSeconds || 0), 6 * 60 * 60);
    if (dur < 2) continue;
    if (!byPkg[s.packageName]) {
      byPkg[s.packageName] = {
        packageName: s.packageName,
        appName: s.appName || s.packageName,
        category: guessCategory(s),
        durationSeconds: 0,
        lastUsed: s.endTime || s.startTime,
        sessionCount: 0,
      };
    }
    byPkg[s.packageName].durationSeconds += dur;
    byPkg[s.packageName].sessionCount += 1;
    const last = s.endTime || s.startTime;
    if (last > byPkg[s.packageName].lastUsed) {
      byPkg[s.packageName].lastUsed = last;
    }
    if (s.appName && !s.appName.includes('.')) {
      byPkg[s.packageName].appName = s.appName;
    }
    const cat = guessCategory(s);
    if (cat !== 'Other') byPkg[s.packageName].category = cat;
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
    if (app.packageName.length < existing.packageName.length) {
      existing.packageName = app.packageName;
      existing.appName = app.appName;
    }
  }

  return Object.values(byLabel)
    .filter(a => a.durationSeconds >= 5)
    .filter(a => !isNoisePackage(a.packageName, a.appName))
    .sort((a, b) => b.durationSeconds - a.durationSeconds);
}

export function guessCategory(s: AppUsageSession): string {
  if (s.category && s.category !== 'Other' && s.category.trim()) return s.category.trim();
  const pkg = (s.packageName || '').toLowerCase();
  const name = (s.appName || '').toLowerCase();
  const blob = `${pkg} ${name}`;
  if (/chrome|browser|firefox|brave|edge|opera|samsung\.internet|miui\.browser/.test(blob))
    return 'Browser';
  if (/whatsapp|telegram|messenger|signal|sms|messages|discord|slack|teams/.test(blob))
    return 'Communication';
  if (/youtube|netflix|spotify|music|hotstar|prime.?video|mxplayer|gaana|wynk/.test(blob))
    return 'Media';
  if (/maps|uber|ola|rapido|transit|navigation/.test(blob)) return 'Maps & travel';
  if (/camera|gallery|photos|photoshop|snapseed/.test(blob)) return 'Photos';
  if (/gmail|mail|outlook|docs|sheets|slides|office|notion|drive|keep|calendar/.test(blob))
    return 'Productivity';
  if (/pay|paisa|phonepe|paytm|gpay|bank|wallet|upi|cred|bhim/.test(blob)) return 'Finance';
  if (/amazon|flipkart|myntra|meesho|shop|store|ajio/.test(blob)) return 'Shopping';
  if (/instagram|facebook|twitter|linkedin|snapchat|tiktok|reddit|pinterest/.test(blob))
    return 'Social';
  if (/game|unity|roblox|pubg|freefire|candy/.test(blob)) return 'Games';
  return 'Other';
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

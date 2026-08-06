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

/** Packages that must never appear in usage reports / dashboard. */
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
  "com.android.settings",
  "com.android.settings.intelligence",
  "com.google.android.googlequicksearchbox",
  "com.google.android.gms",
  "com.google.android.gsf",
  "com.google.android.ext.services",
  "com.samsung.android.app.telephonyui",
  "com.miui.securitycenter",
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
  "com.google.android.inputmethod",
  "com.samsung.android.inputmethod",
  "com.android.inputmethod",
  "com.google.android.as",
  "com.google.android.apps.wellbeing",
];

/** User-facing apps under com.android.* that we still want to show. */
const KEEP_ANDROID_PACKAGES = new Set([
  "com.android.chrome",
  "com.android.vending",
  "com.android.documentsui",
]);

const NOISE_LABELS = new Set([
  "android",
  "system",
  "system ui",
  "systemui",
  "google",
  "android system",
]);

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

export function isNoisePackage(packageName: string, appName?: string) {
  if (!packageName) return true;
  const pkg = packageName.toLowerCase();
  if (IGNORED_PACKAGES.has(pkg)) return true;
  if (IGNORED_PREFIXES.some((p) => pkg.startsWith(p))) return true;
  if (pkg.startsWith("com.android.") && !KEEP_ANDROID_PACKAGES.has(pkg)) return true;
  if (pkg.includes("googlequicksearchbox")) return true;
  const label = formatAppLabel(appName, packageName).trim().toLowerCase();
  if (NOISE_LABELS.has(label)) return true;
  return false;
}

export function dedupeSessions(sessions: AppUsageSession[]): AppUsageSession[] {
  const seen = new Set<string>();
  const unique: AppUsageSession[] = [];
  for (const s of sessions) {
    const pkg = s.packageName || "";
    if (isNoisePackage(pkg, s.appName)) continue;
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
        if (s.category && s.category !== "Other") cur.category = s.category;
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
  category: string;
};

export function consolidateSessionsByApp(sessions: AppUsageSession[]): ConsolidatedApp[] {
  const mergedSessions = mergeOverlappingSessions(sessions);
  const byPkg: Record<string, ConsolidatedApp> = {};
  for (const s of mergedSessions) {
    const pkg = s.packageName || "unknown";
    if (isNoisePackage(pkg, s.appName)) continue;
    const dur = Math.min(Math.max(0, s.durationSeconds || 0), 6 * 60 * 60);
    if (dur < 2) continue;
    if (!byPkg[pkg]) {
      byPkg[pkg] = {
        packageName: pkg,
        appName: s.appName || pkg,
        durationSeconds: 0,
        lastUsed: s.endTime || s.startTime || 0,
        sessionCount: 0,
        category: guessCategory(s),
      };
    }
    byPkg[pkg].durationSeconds += dur;
    byPkg[pkg].sessionCount += 1;
    const last = s.endTime || s.startTime || 0;
    if (last > byPkg[pkg].lastUsed) byPkg[pkg].lastUsed = last;
    if (s.appName && !s.appName.includes(".")) byPkg[pkg].appName = s.appName;
    const cat = guessCategory(s);
    if (cat !== "Other") byPkg[pkg].category = cat;
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
    if (app.category !== "Other") existing.category = app.category;
  }
  return Object.values(byLabel)
    .filter((a) => a.durationSeconds >= 5)
    .filter((a) => !isNoisePackage(a.packageName, a.appName))
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
  if (s.category && s.category !== "Other" && s.category.trim()) return s.category.trim();
  const pkg = (s.packageName || "").toLowerCase();
  const name = (s.appName || "").toLowerCase();
  const blob = `${pkg} ${name}`;
  if (/chrome|browser|firefox|brave|edge|opera|samsung\.internet|miui\.browser/.test(blob))
    return "Browser";
  if (/whatsapp|telegram|messenger|signal|sms|messages|discord|slack|teams/.test(blob))
    return "Communication";
  if (/youtube|netflix|spotify|music|hotstar|prime.?video|mxplayer|gaana|wynk/.test(blob))
    return "Media";
  if (/maps|uber|ola|rapido|transit|navigation/.test(blob)) return "Maps & travel";
  if (/camera|gallery|photos|photoshop|snapseed/.test(blob)) return "Photos";
  if (/gmail|mail|outlook|docs|sheets|slides|office|notion|drive|keep|calendar/.test(blob))
    return "Productivity";
  if (/pay|paisa|phonepe|paytm|gpay|bank|wallet|upi|cred|bhim/.test(blob)) return "Finance";
  if (/amazon|flipkart|myntra|meesho|shop|store|ajio/.test(blob)) return "Shopping";
  if (/instagram|facebook|twitter|linkedin|snapchat|tiktok|reddit|pinterest/.test(blob))
    return "Social";
  if (/game|unity|roblox|pubg|freefire|candy/.test(blob)) return "Games";
  return "Other";
}

/** Dedupe + shorten android.permission.* for Safety lists. */
export function formatPermissionList(perms: string[] | undefined): string {
  if (!perms?.length) return "—";
  const uniq = [...new Set(perms.map((p) => String(p || "").trim()).filter(Boolean))];
  return uniq
    .map((p) => p.replace(/^android\.permission\./i, ""))
    .sort()
    .join(", ");
}

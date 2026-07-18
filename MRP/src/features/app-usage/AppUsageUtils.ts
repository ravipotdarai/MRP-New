import {AppUsageSession} from './AppUsageScreen';

export const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
};

export const formatAppName = (name: string) => {
  if (!name) return 'Unknown';
  if (name.includes('.')) {
    const parts = name.split('.');
    let lastPart = parts[parts.length - 1];
    if (lastPart.length < 3 && parts.length > 1) {
      lastPart = parts[parts.length - 2];
    }
    return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
  }
  return name;
};

export const aggregateAppStats = (sessions: AppUsageSession[]) => {
  const appStats: Record<string, {appName: string; duration: number; battery: number}> = {};

  sessions.forEach(s => {
    if (!appStats[s.packageName]) {
      appStats[s.packageName] = {appName: formatAppName(s.appName), duration: 0, battery: 0};
    }
    appStats[s.packageName].duration += s.durationSeconds;
    // Use the most recent battery level seen for this app, not a running sum
    // (summing battery across sessions produced nonsense like 800%).
    if (s.batteryLevel != null) {
      appStats[s.packageName].battery = s.batteryLevel;
    }
  });

  const sortedApps = Object.entries(appStats)
    .map(([pkg, data]) => ({packageName: pkg, ...data}))
    .sort((a, b) => b.duration - a.duration);

  const mostUsedApp = sortedApps.length > 0 ? sortedApps[0] : null;
  // Most recent session = the app currently/last in foreground. Native returns
  // sessions DESC by start time, but sort defensively in case order changes.
  const currentApp =
    sessions.length > 0
      ? sessions.slice().sort((a, b) => b.startTime - a.startTime)[0]
      : null;

  return {
    sortedApps,
    mostUsedApp,
    currentApp,
    totalDuration: Object.values(appStats).reduce((sum, app) => sum + app.duration, 0),
    battery: sortedApps.length > 0 ? sortedApps[0].battery : 0,
  };
};

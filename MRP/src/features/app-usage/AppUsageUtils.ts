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
    if (s.batteryLevel) {
      appStats[s.packageName].battery += s.batteryLevel;
    }
  });

  const sortedApps = Object.entries(appStats)
    .map(([pkg, data]) => ({packageName: pkg, ...data}))
    .sort((a, b) => b.duration - a.duration);

  const mostUsedApp = sortedApps.length > 0 ? sortedApps[0] : null;
  const currentApp = sessions.length > 0 ? sessions[sessions.length - 1] : null;

  return {
    sortedApps,
    mostUsedApp,
    currentApp,
    totalDuration: Object.values(appStats).reduce((sum, app) => sum + app.duration, 0),
    battery: Object.values(appStats).reduce((sum, app) => sum + app.battery, 0),
  };
};

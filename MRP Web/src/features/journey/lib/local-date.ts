/** Local calendar helpers — avoid UTC `toISOString().slice(0,10)` date bugs. */

export function localTodayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shiftLocalDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localTodayISO(d);
}

export function dayBoundsLocal(isoDate: string): { from: number; to: number } {
  const from = new Date(`${isoDate}T00:00:00`);
  const to = new Date(`${isoDate}T23:59:59.999`);
  return { from: from.getTime(), to: to.getTime() };
}

export function formatJourneyClock(ms: number): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function formatLiveClock(d = new Date()): string {
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

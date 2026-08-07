import type { DayAnalytics } from "./journey-analytics";
import type { JourneyHeuristics } from "./journey-heuristics";
import type { GpsDayIndex, GpsPoint } from "../types";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Opens browser print dialog with a styled journey report (Save as PDF). */
export function printJourneyPdf(opts: {
  day: string;
  points: GpsPoint[];
  index: GpsDayIndex | null;
  analytics: DayAnalytics;
  heuristics: JourneyHeuristics;
  address?: string;
}) {
  const { day, points, index, analytics, heuristics, address } = opts;
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Journey ${esc(day)}</title>
<style>
  body{font-family:system-ui,sans-serif;padding:24px;color:#111;max-width:800px;margin:0 auto}
  h1{font-size:22px;margin:0 0 4px} .muted{color:#555;font-size:13px}
  table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}
  th,td{border:1px solid #ddd;padding:8px;text-align:left}
  th{background:#f5f5f5}
  .warn{color:#b45309} ul{line-height:1.6}
</style></head><body>
  <h1>Journey report — ${esc(day)}</h1>
  <p class="muted">MRP Emergency monitoring · ${new Date().toLocaleString()}</p>
  ${address ? `<p><strong>Current area:</strong> ${esc(address)}</p>` : ""}
  <p>${esc(heuristics.summary)}</p>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>Distance</td><td>${analytics.distanceKm.toFixed(2)} km</td></tr>
    <tr><td>Duration</td><td>${analytics.durationMin} min</td></tr>
    <tr><td>Moving / idle</td><td>${analytics.movingMin} / ${analytics.idleMin} min</td></tr>
    <tr><td>Max speed</td><td>${analytics.maxSpeedKmh.toFixed(1)} km/h</td></tr>
    <tr><td>GPS points</td><td>${points.length}</td></tr>
    <tr><td>Stops (heuristic)</td><td>${heuristics.stops.length}</td></tr>
    <tr><td>Unlocks</td><td>${analytics.unlockCount}</td></tr>
    <tr><td>Geofence in/out</td><td>${analytics.geofenceEnter} / ${analytics.geofenceExit}</td></tr>
    ${index ? `<tr><td>Day pack stops</td><td>${index.stopCount}</td></tr>` : ""}
  </table>
  <h2>Insights</h2>
  <ul>${heuristics.insights.map((i) => `<li class="${i.severity === "warn" ? "warn" : ""}"><strong>${esc(i.title)}</strong> — ${esc(i.detail)}</li>`).join("") || "<li>None</li>"}</ul>
  <h2>Top stops</h2>
  <ul>${heuristics.stops.slice(0, 8).map((s) => `<li>${esc(new Date(s.startMs).toLocaleTimeString())} · ${s.durationMin} min · ${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}</li>`).join("") || "<li>None detected</li>"}</ul>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.setTimeout(() => w.print(), 400);
}

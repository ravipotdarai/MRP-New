/**
 * Selectors / derivations over VaultPayload — no I/O.
 */

import type { VaultPayload } from "@/lib/vault-crypto";

export type TimelineRow = Record<string, unknown>;

export function asRows(vault: VaultPayload | null): TimelineRow[] {
  if (!vault?.timeline || !Array.isArray(vault.timeline)) return [];
  return vault.timeline as TimelineRow[];
}

export function eventType(row: TimelineRow): string {
  return String(row.eventType || row.event_type || row.type || "EVENT");
}

export function eventTimeMs(row: TimelineRow): number {
  const candidates = [row.timestamp, row.time, row.atMs, row.createdAtMs, row.ts];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string" && c.trim()) {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
      const d = Date.parse(c);
      if (!Number.isNaN(d)) return d;
    }
  }
  return 0;
}

export function rowLatLng(row: TimelineRow): { lat: number; lng: number } | null {
  const loc = (row.location || row.loc || {}) as Record<string, unknown>;
  const lat = num(loc.latitude ?? loc.lat ?? row.latitude ?? row.lat);
  const lng = num(loc.longitude ?? loc.lng ?? row.longitude ?? row.lng);
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function rowAddress(row: TimelineRow): string {
  const loc = (row.location || {}) as Record<string, unknown>;
  return String(
    loc.detailedAddress ||
      loc.detailed_address ||
      loc.address ||
      row.address ||
      "",
  );
}

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

export function severityOf(type: string): "alert" | "safe" | "neutral" {
  const t = type.toLowerCase();
  if (
    t.includes("sim") ||
    t.includes("tamper") ||
    t.includes("intruder") ||
    t.includes("wrong") ||
    t.includes("panic") ||
    t.includes("risk") ||
    t.includes("security_")
  ) {
    return "alert";
  }
  if (t.includes("geofence") || t.includes("unlock") || t.includes("safe")) return "safe";
  return "neutral";
}

export type LatLng = { lat: number; lng: number; t: number; row?: TimelineRow };

export function travelPoints(
  vault: VaultPayload | null,
  fromMs: number,
  toMs: number,
): LatLng[] {
  const out: LatLng[] = [];
  for (const row of asRows(vault)) {
    const t = eventTimeMs(row);
    if (t < fromMs || t > toMs) continue;
    const ll = rowLatLng(row);
    if (!ll) continue;
    out.push({ ...ll, t, row });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** Haversine km */
export function pathDistanceKm(points: LatLng[]): number {
  if (points.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += haversineKm(points[i - 1], points[i]);
  }
  return d;
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function liveLatLng(vault: VaultPayload | null): { lat: number; lng: number } | null {
  const live = vault?.liveLocation;
  if (!live) return null;
  const lat = num(live.latitude ?? live.lat);
  const lng = num(live.longitude ?? live.lng);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

export function computeSecurityScore(vault: VaultPayload | null): {
  score: number;
  risk: string;
  alertsToday: number;
} {
  const rows = asRows(vault);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const start = dayStart.getTime();
  let alerts = 0;
  for (const row of rows) {
    if (eventTimeMs(row) < start) continue;
    if (severityOf(eventType(row)) === "alert") alerts++;
  }
  const health = vault?.deviceHealth || {};
  const monitoringOn = health.monitoringOn !== false;
  let score = 100;
  if (!monitoringOn) score -= 25;
  score -= Math.min(40, alerts * 5);
  if (vault?.selfiesOmitted) score -= 5;
  score = Math.max(0, Math.min(100, score));
  const risk = score >= 80 ? "Low" : score >= 50 ? "Medium" : "High";
  return { score, risk, alertsToday: alerts };
}

export function selfieSrc(s: unknown): string | null {
  const o = s as Record<string, unknown>;
  const b64 = o.base64 || o.data;
  if (typeof b64 !== "string" || !b64) return null;
  const mime = String(o.mime || o.contentType || "image/jpeg");
  if (b64.startsWith("data:")) return b64;
  return `data:${mime};base64,${b64}`;
}

export function searchVault(vault: VaultPayload | null, q: string): Array<{ kind: string; label: string; detail: string }> {
  const query = q.trim().toLowerCase();
  if (!query || !vault) return [];
  const hits: Array<{ kind: string; label: string; detail: string }> = [];
  for (const row of asRows(vault).slice(-500)) {
    const t = eventType(row);
    const addr = rowAddress(row);
    const blob = `${t} ${addr} ${JSON.stringify(row)}`.toLowerCase();
    if (blob.includes(query)) {
      hits.push({
        kind: "event",
        label: t,
        detail: addr || new Date(eventTimeMs(row) || Date.now()).toLocaleString(),
      });
    }
    if (hits.length >= 40) break;
  }
  for (const s of vault.appUsage?.sessions || []) {
    const name = `${s.appName || ""} ${s.packageName || ""}`.toLowerCase();
    if (name.includes(query)) {
      hits.push({
        kind: "app",
        label: s.appName || s.packageName || "app",
        detail: s.packageName || "",
      });
    }
  }
  for (const g of vault.geofences || []) {
    const name = String(g.name || g.id || "").toLowerCase();
    if (name.includes(query)) {
      hits.push({
        kind: "geofence",
        label: g.name || g.id || "zone",
        detail: `${g.latitude}, ${g.longitude} · ${g.radiusMeters || "?"}m`,
      });
    }
  }
  return hits.slice(0, 50);
}

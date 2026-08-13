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

export function rowStatus(row: TimelineRow): string {
  return String(row.status || row.eventStatus || "").trim() || "—";
}

export type GeofenceBadge = {
  inside: boolean | null;
  fenceId: string | null;
  fenceName: string | null;
  label: string;
};

export function rowGeofence(row: TimelineRow): GeofenceBadge {
  const gs = (row.geofence_status || row.geofenceStatus || {}) as Record<string, unknown>;
  const meta = (row.metadata || {}) as Record<string, unknown>;
  const insideRaw = gs.inside_fence ?? gs.insideFence ?? row.inside_fence;
  const inside =
    typeof insideRaw === "boolean"
      ? insideRaw
      : typeof insideRaw === "string"
        ? insideRaw.toLowerCase() === "true"
        : null;
  const fenceId = String(
    gs.fence_id ?? gs.fenceId ?? meta.geofence_id ?? meta.geofenceId ?? row.geofence_id ?? "",
  ).trim() || null;
  const fenceName = String(
    meta.geofence_name ?? meta.geofenceName ?? row.geofence_name ?? "",
  ).trim() || null;

  let label = "No zone";
  if (inside === true) label = fenceName ? `Inside · ${fenceName}` : "Inside fence";
  else if (inside === false) label = fenceName ? `Outside · ${fenceName}` : "Outside fence";
  else if (fenceName) label = fenceName;

  return { inside, fenceId, fenceName, label };
}

/** Short display label for event types (parity with mobile wording). */
export function formatEventType(type: string): string {
  if (!type || type === "EVENT") return "Event";
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Compact glyph for timeline rows (CSS-friendly, no emoji dependency required). */
export function eventIcon(type: string): string {
  const t = type.toUpperCase();
  if (t.includes("SIM")) return "▣";
  if (t.includes("GEOFENCE") || t.includes("FENCE") || t.includes("ZONE")) return "◎";
  if (t.includes("WRONG") || t.includes("INTRUDER") || t.includes("UNLOCK_FAILED")) return "⚠";
  if (t.includes("PANIC") || t.includes("EMERGENCY")) return "◉";
  if (t.includes("USB")) return "▭";
  if (t.includes("WIFI") || t.includes("HOTSPOT") || t.includes("NETWORK") || t.includes("MOBILE_DATA"))
    return "≋";
  if (t.includes("AIRPLANE")) return "✈";
  if (t.includes("BOOT") || t.includes("FACTORY")) return "⏻";
  if (t.includes("APP_") || t.includes("MISUSE") || t.includes("POSTURE") || t.includes("RISK"))
    return "▦";
  if (t.includes("SCREEN") || t.includes("LOCK") || t.includes("BIOMETRIC") || t.includes("PASSWORD"))
    return "◫";
  if (t.includes("LOCATION") || t.includes("GPS") || t.includes("TRACK")) return "⌖";
  if (t.includes("CAMERA") || t.includes("SELFIE") || t.includes("PHOTO")) return "◌";
  return "●";
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
    t.includes("blocked") ||
    t.includes("scam") ||
    t.includes("malicious") ||
    t.includes("breach_email_found") ||
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

/** Recent GPS trail for Find-my-device / live movement (hours back). */
export function movementTrail(
  vault: VaultPayload | null,
  hoursBack = 6,
  nowMs = Date.now(),
): LatLng[] {
  const from = nowMs - hoursBack * 60 * 60 * 1000;
  const pts = travelPoints(vault, from, nowMs);
  const live = liveLatLng(vault);
  if (live) {
    const liveT = num(vault?.liveLocation?.atMs ?? vault?.liveLocation?.timestamp) ?? nowMs;
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last.lat - live.lat) > 1e-5 || Math.abs(last.lng - live.lng) > 1e-5) {
      pts.push({ ...live, t: liveT });
    }
  }
  return pts;
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

/** Normalized live-location snapshot for Locate UI (Android field names vary). */
export function liveLocationDetails(vault: VaultPayload | null): {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  network: string;
  batteryPct: number | null;
  address: string;
  insideGeofence: boolean | null;
  geofenceName: string;
  geofenceId: string;
  atMs: number | null;
  source: string;
} {
  const live = (vault?.liveLocation || {}) as Record<string, unknown>;
  const dh = (vault?.deviceHealth || {}) as Record<string, unknown>;
  const ll = liveLatLng(vault);
  const insideRaw = live.insideGeofence ?? live.inside_fence ?? live.insideFence;
  const inside =
    typeof insideRaw === "boolean"
      ? insideRaw
      : typeof insideRaw === "string"
        ? insideRaw.toLowerCase() === "true"
        : null;
  return {
    lat: ll?.lat ?? null,
    lng: ll?.lng ?? null,
    accuracyM: num(live.accuracyM ?? live.accuracy ?? live.accuracyMeters),
    network: String(live.network || live.networkType || "").trim() || "—",
    batteryPct: num(live.batteryPct ?? live.battery ?? dh.batteryPct),
    address: String(live.address || live.detailedAddress || "").trim(),
    insideGeofence: inside,
    geofenceName: String(live.geofenceName || live.geofence_name || "").trim(),
    geofenceId: String(live.geofenceId || live.geofence_id || "").trim(),
    atMs: num(live.atMs ?? live.timestamp),
    source: String(live.source || "").trim(),
  };
}

/** Match a selfie blob back to its timeline row for location / geofence. */
export function findRowForSelfie(
  vault: VaultPayload | null,
  selfie: unknown,
): TimelineRow | null {
  const rows = asRows(vault);
  if (!rows.length || !selfie) return null;
  const o = selfie as Record<string, unknown>;
  const id = String(o.eventId || o.event_id || "").trim();
  if (id) {
    const byId = rows.find((r) => String(r.id || r.eventId || "") === id);
    if (byId) return byId;
  }
  const type = eventType({
    eventType: o.eventType,
    event_type: o.event_type,
    event: o.event,
  }).toUpperCase();
  const at = num(o.atMs ?? o.timestamp ?? o.time) ?? 0;
  let best: { row: TimelineRow; dist: number } | null = null;
  for (const row of rows) {
    const rt = eventType(row).toUpperCase();
    if (type && rt && type !== rt && !type.includes(rt) && !rt.includes(type)) continue;
    const t = eventTimeMs(row);
    if (!at || !t) continue;
    const dist = Math.abs(at - t);
    if (dist > 5 * 60_000) continue;
    if (!best || dist < best.dist) best = { row, dist };
  }
  return best?.row ?? null;
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
  const b64 = o.base64 || o.data || o.dataBase64;
  if (typeof b64 !== "string" || !b64) return null;
  const mime = String(o.mime || o.contentType || "image/jpeg");
  if (b64.startsWith("data:")) return b64;
  return `data:${mime};base64,${b64}`;
}

/** Link selfie blob to timeline row via eventId, else time+type proximity. */
export function findSelfieForRow(
  vault: VaultPayload | null,
  row: TimelineRow,
): unknown | null {
  const selfies = vault?.selfies || [];
  if (!selfies.length) return null;
  const id = String(row.id || row.eventId || "").trim();
  if (id) {
    for (const s of selfies) {
      const o = s as Record<string, unknown>;
      if (String(o.eventId || o.event_id || "") === id) return s;
    }
  }
  const type = eventType(row).toUpperCase();
  const t = eventTimeMs(row);
  let best: { s: unknown; dist: number } | null = null;
  for (const s of selfies) {
    const o = s as Record<string, unknown>;
    const st = eventType({ eventType: o.eventType, event_type: o.event_type }).toUpperCase();
    if (type && st && type !== st && !type.includes(st) && !st.includes(type)) continue;
    const at = num(o.atMs ?? o.timestamp ?? o.time) ?? 0;
    if (!at || !t) continue;
    const dist = Math.abs(at - t);
    if (dist > 5 * 60_000) continue;
    if (!best || dist < best.dist) best = { s, dist };
  }
  return best?.s ?? null;
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
        label: formatEventType(t),
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

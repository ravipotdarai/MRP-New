/**
 * Drive appData GPS day-pack list / download / decrypt (JPNI).
 * Same PIN crypto as vault — never sends trail to Nest/Firebase.
 */

import { decryptVaultUtf8 } from "@/lib/vault-crypto";
import type { GpsDayIndex, GpsHourChunk, GpsPoint } from "../types";

export const GPS_INDEX_SUFFIX = "_index.enc";
export const GPS_NAME_PREFIX = "mrp_gps_";

type DriveFile = { id: string; name: string; modifiedTime?: string; size?: string };

function padHour(h: number): string {
  return h.toString().padStart(2, "0");
}

export function gpsIndexFileName(date: string): string {
  return `${GPS_NAME_PREFIX}${date}_index.enc`;
}

export function gpsHourFileName(date: string, hour: number): string {
  return `${GPS_NAME_PREFIX}${date}_${padHour(hour)}.enc`;
}

/** Parse date from mrp_gps_YYYY-MM-DD_index.enc */
export function dateFromIndexName(name: string): string | null {
  const m = /^mrp_gps_(\d{4}-\d{2}-\d{2})_index\.enc$/.exec(name);
  return m ? m[1] : null;
}

export async function listGpsIndexFiles(accessToken: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`name contains 'mrp_gps_' and trashed=false`);
  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?spaces=appDataFolder` +
    `&fields=files(id,name,modifiedTime,size)` +
    `&pageSize=200` +
    `&q=${q}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive GPS list failed (${res.status})`);
  const body = (await res.json()) as { files?: DriveFile[] };
  return (body.files || []).filter((f) => f.name.endsWith(GPS_INDEX_SUFFIX));
}

export async function downloadDriveBytes(
  accessToken: string,
  fileId: string,
): Promise<ArrayBuffer> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive GPS download failed (${res.status})`);
  return res.arrayBuffer();
}

export async function decryptJson<T>(blob: ArrayBuffer, pin: string): Promise<T> {
  const plain = await decryptVaultUtf8(blob, pin);
  return JSON.parse(plain) as T;
}

export async function loadDayIndex(
  accessToken: string,
  pin: string,
  file: DriveFile,
): Promise<GpsDayIndex> {
  const blob = await downloadDriveBytes(accessToken, file.id);
  return decryptJson<GpsDayIndex>(blob, pin);
}

export async function loadHourChunk(
  accessToken: string,
  pin: string,
  date: string,
  hour: number,
): Promise<GpsHourChunk | null> {
  const name = gpsHourFileName(date, hour);
  const q = encodeURIComponent(`name='${name}' and trashed=false`);
  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?spaces=appDataFolder` +
    `&fields=files(id,name,modifiedTime,size)` +
    `&q=${q}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive hour list failed (${res.status})`);
  const body = (await res.json()) as { files?: DriveFile[] };
  const file = body.files?.[0];
  if (!file) return null;
  const blob = await downloadDriveBytes(accessToken, file.id);
  return decryptJson<GpsHourChunk>(blob, pin);
}

/** Windowed loader: keep current hour + prefetch next; drop previous. */
export class GpsChunkWindow {
  private cache = new Map<number, GpsPoint[]>();
  private loading = new Set<number>();

  constructor(
    private accessToken: string,
    private pin: string,
    private date: string,
    private hours: number[],
  ) {}

  async ensureHour(hour: number): Promise<GpsPoint[]> {
    if (this.cache.has(hour)) return this.cache.get(hour)!;
    if (this.loading.has(hour)) {
      await new Promise((r) => setTimeout(r, 50));
      return this.cache.get(hour) || [];
    }
    this.loading.add(hour);
    try {
      const chunk = await loadHourChunk(this.accessToken, this.pin, this.date, hour);
      const pts = chunk?.points || [];
      this.cache.set(hour, pts);
      return pts;
    } finally {
      this.loading.delete(hour);
    }
  }

  async ensureWindow(currentHour: number): Promise<GpsPoint[]> {
    const idx = this.hours.indexOf(currentHour);
    const next = idx >= 0 && idx + 1 < this.hours.length ? this.hours[idx + 1] : null;
    const prevHours = this.hours.filter((h) => h < currentHour - 0);
    // Drop hours older than previous sibling of current
    const keep = new Set<number>([currentHour]);
    if (next != null) keep.add(next);
    if (idx > 0) keep.add(this.hours[idx - 1]);
    for (const h of [...this.cache.keys()]) {
      if (!keep.has(h)) this.cache.delete(h);
    }
    void prevHours;
    const cur = await this.ensureHour(currentHour);
    if (next != null) void this.ensureHour(next);
    return cur;
  }

  async loadAllAvailable(): Promise<GpsPoint[]> {
    const all: GpsPoint[] = [];
    for (const h of this.hours) {
      const pts = await this.ensureHour(h);
      all.push(...pts);
    }
    all.sort((a, b) => a.t - b.t);
    return all;
  }
}

export function sparsePointsFromVault(
  points: Array<{ lat: number; lng: number; t: number }>,
): GpsPoint[] {
  return points.map((p) => ({
    t: p.t,
    lat: p.lat,
    lng: p.lng,
    s: 0,
    h: 0,
    a: 50,
    m: "walk" as const,
  }));
}

/**
 * Merge day-pack GPS with vault event coords so the path always includes
 * locations already visible on timeline events (events ⇒ path).
 */
export function mergeTrailWithVaultEvents(
  trail: GpsPoint[],
  vaultPts: GpsPoint[],
): GpsPoint[] {
  if (!vaultPts.length) return trail;
  if (!trail.length) return [...vaultPts].sort((a, b) => a.t - b.t);
  const out = [...trail];
  for (const v of vaultPts) {
    const near = out.some(
      (p) =>
        Math.abs(p.t - v.t) < 90_000 &&
        Math.abs(p.lat - v.lat) < 1e-4 &&
        Math.abs(p.lng - v.lng) < 1e-4,
    );
    if (!near) out.push(v);
  }
  return out.sort((a, b) => a.t - b.t);
}

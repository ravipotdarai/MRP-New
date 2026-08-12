/**
 * Drive appData GPS day-pack list / download / decrypt (JPNI).
 * Same PIN crypto as vault — never sends trail to Nest/Firebase.
 *
 * Progressive: last hour first → map paint, then remaining hours in parallel.
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

/** Parse hour from mrp_gps_YYYY-MM-DD_HH.enc */
export function hourFromGpsFileName(name: string, date: string): number | null {
  const m = new RegExp(`^mrp_gps_${date}_(\\d{2})\\.enc$`).exec(name);
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : null;
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

/** One Drive list for all hour packs of a day (avoids N list round-trips). */
export async function listGpsHourFilesForDay(
  accessToken: string,
  date: string,
): Promise<Map<number, DriveFile>> {
  const prefix = `${GPS_NAME_PREFIX}${date}_`;
  const q = encodeURIComponent(`name contains '${prefix}' and trashed=false`);
  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?spaces=appDataFolder` +
    `&fields=files(id,name,modifiedTime,size)` +
    `&pageSize=100` +
    `&q=${q}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive GPS hour list failed (${res.status})`);
  const body = (await res.json()) as { files?: DriveFile[] };
  const map = new Map<number, DriveFile>();
  for (const f of body.files || []) {
    const h = hourFromGpsFileName(f.name, date);
    if (h != null) map.set(h, f);
  }
  return map;
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
  fileByHour?: Map<number, DriveFile>,
): Promise<GpsHourChunk | null> {
  let file = fileByHour?.get(hour);
  if (!file) {
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
    file = body.files?.[0];
  }
  if (!file) return null;
  const blob = await downloadDriveBytes(accessToken, file.id);
  return decryptJson<GpsHourChunk>(blob, pin);
}

function sortedPointsFromCache(cache: Map<number, GpsPoint[]>, hours: number[]): GpsPoint[] {
  const all: GpsPoint[] = [];
  for (const h of hours) {
    const pts = cache.get(h);
    if (pts?.length) all.push(...pts);
  }
  all.sort((a, b) => a.t - b.t);
  return all;
}

/** Windowed loader: keep current hour + prefetch next; drop previous. */
export class GpsChunkWindow {
  private cache = new Map<number, GpsPoint[]>();
  private loading = new Set<number>();
  private fileByHour: Map<number, DriveFile> | null = null;
  private fileListPromise: Promise<Map<number, DriveFile>> | null = null;

  constructor(
    private accessToken: string,
    private pin: string,
    private date: string,
    private hours: number[],
  ) {}

  private async ensureFileMap(): Promise<Map<number, DriveFile>> {
    if (this.fileByHour) return this.fileByHour;
    if (!this.fileListPromise) {
      this.fileListPromise = listGpsHourFilesForDay(this.accessToken, this.date).then((m) => {
        this.fileByHour = m;
        return m;
      });
    }
    return this.fileListPromise;
  }

  async ensureHour(hour: number): Promise<GpsPoint[]> {
    if (this.cache.has(hour)) return this.cache.get(hour)!;
    if (this.loading.has(hour)) {
      while (this.loading.has(hour)) {
        await new Promise((r) => setTimeout(r, 40));
      }
      return this.cache.get(hour) || [];
    }
    this.loading.add(hour);
    try {
      const files = await this.ensureFileMap();
      const chunk = await loadHourChunk(this.accessToken, this.pin, this.date, hour, files);
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
    const keep = new Set<number>([currentHour]);
    if (next != null) keep.add(next);
    if (idx > 0) keep.add(this.hours[idx - 1]);
    for (const h of [...this.cache.keys()]) {
      if (!keep.has(h)) this.cache.delete(h);
    }
    const cur = await this.ensureHour(currentHour);
    if (next != null) void this.ensureHour(next);
    return cur;
  }

  async loadAllAvailable(): Promise<GpsPoint[]> {
    await this.ensureFileMap();
    const concurrency = 4;
    let i = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, this.hours.length || 1) },
      async () => {
        while (i < this.hours.length) {
          const h = this.hours[i++];
          await this.ensureHour(h);
        }
      },
    );
    await Promise.all(workers);
    return sortedPointsFromCache(this.cache, this.hours);
  }

  /**
   * Load preferred hour (default: latest available / current clock hour) first,
   * call onPartial, then load the rest of the day.
   */
  async loadRecentThenRest(
    onPartial?: (pts: GpsPoint[]) => void,
    preferHour?: number,
  ): Promise<GpsPoint[]> {
    if (!this.hours.length) return [];
    await this.ensureFileMap();

    const clockHour = new Date().getHours();
    const target =
      preferHour != null && this.hours.includes(preferHour)
        ? preferHour
        : this.hours.includes(clockHour)
          ? clockHour
          : this.hours[this.hours.length - 1];

    const first = await this.ensureHour(target);
    const prev = target > 0 && this.hours.includes(target - 1) ? target - 1 : null;
    if (prev != null) await this.ensureHour(prev);

    if (onPartial) {
      const early = sortedPointsFromCache(
        this.cache,
        [prev, target].filter((h): h is number => h != null),
      );
      if (early.length || first.length) onPartial(early.length ? early : first);
    }

    const rest = this.hours.filter((h) => h !== target && h !== prev);
    const concurrency = 4;
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, rest.length || 1) }, async () => {
        while (i < rest.length) {
          const h = rest[i++];
          await this.ensureHour(h);
        }
      }),
    );

    return sortedPointsFromCache(this.cache, this.hours);
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

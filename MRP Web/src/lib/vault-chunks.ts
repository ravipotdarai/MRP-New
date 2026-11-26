/**
 * Append-only Drive chunk files (event / selfie / live) — merge on read.
 * Progressive unlock: last ~1h packs + live first, then full history async.
 */

import {
  BACKUP_FILE_NAME,
  EXTRAS_FILE_NAME,
  downloadDriveFile,
} from "@/lib/drive-appdata";
import {
  decryptVaultUtf8,
  parseVaultJson,
  type VaultPayload,
} from "@/lib/vault-crypto";

export const LIVE_FILE_NAME = "mrp_live.enc";
export const EXTRAS_FILE = EXTRAS_FILE_NAME;
export const EVT_PREFIX = "mrp_evt_";
export const SELFIE_PREFIX = "mrp_selfie_";

/** Prefer recent packs for first paint (map / live). */
export const RECENT_WINDOW_MS = 60 * 60 * 1000;

type ListedFile = { id: string; name: string; modifiedTime?: string; size?: string };

export type ChunkMergeResult = {
  vault: VaultPayload;
  meta: { name: string; modifiedTime?: string; sizeBytes?: number };
  sources: { vault: boolean; evtPacks: number; selfies: number; live: boolean };
  /** True when more packs / legacy vault are still loading. */
  partial?: boolean;
};

export type ProgressiveVaultHandlers = {
  onStage?: (msg: string) => void;
  /** Fired once recent window is ready — UI may unlock. */
  onPartial?: (result: ChunkMergeResult) => void;
  /**
   * Fired after vault/extras (+ recent events) — stop blocking the UI.
   * Photo packs and older history load after this (or on Media demand).
   */
  onReady?: (result: ChunkMergeResult) => void;
  /** Optional progress while older evt packs decrypt in the background. */
  onHistoryProgress?: (result: ChunkMergeResult) => void;
  signal?: AbortSignal;
};

/** Max older event packs decrypted during unlock (rest stays out of the critical path). */
const MAX_OLDER_EVT_PACKS_ON_UNLOCK = 36;

async function listAppDataContaining(
  accessToken: string,
  nameContains: string,
): Promise<ListedFile[]> {
  const q = encodeURIComponent(`name contains '${nameContains}' and trashed=false`);
  const out: ListedFile[] = [];
  let pageToken: string | undefined;
  do {
    const url =
      `https://www.googleapis.com/drive/v3/files` +
      `?spaces=appDataFolder` +
      `&pageSize=1000` +
      `&fields=nextPageToken,files(id,name,modifiedTime,size)` +
      `&q=${q}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Drive list failed (${res.status})`);
    const body = (await res.json()) as {
      files?: ListedFile[];
      nextPageToken?: string;
    };
    out.push(...(body.files || []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return out;
}

async function listExact(
  accessToken: string,
  name: string,
): Promise<ListedFile[]> {
  const q = encodeURIComponent(`name='${name}' and trashed=false`);
  const url =
    `https://www.googleapis.com/drive/v3/files` +
    `?spaces=appDataFolder` +
    `&fields=files(id,name,modifiedTime,size)` +
    `&q=${q}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive list failed (${res.status})`);
  const body = (await res.json()) as { files?: ListedFile[] };
  return body.files || [];
}

function eventId(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const id = o.id ?? o.eventId ?? o.event_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function mergeTimeline(base: unknown[], packs: unknown[]): unknown[] {
  const map = new Map<string, unknown>();
  let anon = 0;
  for (const row of [...base, ...packs]) {
    const id = eventId(row) || `__anon_${anon++}`;
    map.set(id, row);
  }
  return Array.from(map.values());
}

function mergeSelfies(base: unknown[], packs: unknown[]): unknown[] {
  const map = new Map<string, unknown>();
  for (const row of [...base, ...packs]) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = String(o.eventId || o.event_id || o.fileName || Math.random());
    map.set(id, row);
  }
  return Array.from(map.values());
}

function liveAtMs(live: Record<string, unknown> | undefined): number {
  if (!live) return 0;
  const v = live.atMs ?? live.updatedAtMs ?? live.t;
  return typeof v === "number" ? v : Number(v) || 0;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

/** mrp_evt_YYYY-MM-DD_HH_seq.enc → hour bucket start ms (local). */
export function evtPackHourStartMs(name: string): number | null {
  const m = /^mrp_evt_(\d{4}-\d{2}-\d{2})_(\d{2})_/.exec(name);
  if (!m) return null;
  const [y, mo, d] = m[1].split("-").map(Number);
  const hour = Number(m[2]);
  if (![y, mo, d, hour].every((n) => Number.isFinite(n))) return null;
  return new Date(y, mo - 1, d, hour, 0, 0, 0).getTime();
}

function fileRecencyMs(f: ListedFile): number {
  const fromName = evtPackHourStartMs(f.name);
  if (fromName != null) return fromName;
  if (f.modifiedTime) {
    const t = Date.parse(f.modifiedTime);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

/**
 * Split event packs into recent (overlap last window) vs older.
 * Includes the prior clock-hour so a pack at HH:00 still covers “last 60m”.
 */
export function partitionRecentEvtPacks(
  packs: ListedFile[],
  nowMs = Date.now(),
  windowMs = RECENT_WINDOW_MS,
): { recent: ListedFile[]; older: ListedFile[] } {
  const cutoff = nowMs - windowMs;
  // Also keep packs whose hour bucket starts within window+1h (overlap).
  const hourCutoff = cutoff - 60 * 60 * 1000;
  const recent: ListedFile[] = [];
  const older: ListedFile[] = [];
  for (const f of packs) {
    const t = fileRecencyMs(f);
    if (t >= hourCutoff) recent.push(f);
    else older.push(f);
  }
  // Always prefer newest packs if partition empty (clock skew / odd names)
  if (!recent.length && packs.length) {
    const sorted = [...packs].sort((a, b) => fileRecencyMs(b) - fileRecencyMs(a));
    return { recent: sorted.slice(0, Math.min(4, sorted.length)), older: sorted.slice(4) };
  }
  return { recent, older };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      throwIfAborted(signal);
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function decryptEvtPack(
  accessToken: string,
  pin: string,
  f: ListedFile,
): Promise<{ events: unknown[]; bytes: number; modifiedTime?: string } | null> {
  try {
    const blob = await downloadDriveFile(accessToken, f.id);
    const plain = await decryptVaultUtf8(blob, pin);
    const json = JSON.parse(plain) as { events?: unknown[] };
    return {
      events: Array.isArray(json.events) ? json.events : [],
      bytes: blob.byteLength,
      modifiedTime: f.modifiedTime,
    };
  } catch {
    return null;
  }
}

async function decryptSelfiePack(
  accessToken: string,
  pin: string,
  f: ListedFile,
): Promise<{ row: unknown; bytes: number; modifiedTime?: string } | null> {
  try {
    const blob = await downloadDriveFile(accessToken, f.id);
    const plain = await decryptVaultUtf8(blob, pin);
    return {
      row: JSON.parse(plain) as unknown,
      bytes: blob.byteLength,
      modifiedTime: f.modifiedTime,
    };
  } catch {
    return null;
  }
}

/**
 * Load selfie packs on demand (Media page) — not during unlock.
 * Newest packs first; [limit] caps how many to decrypt this call.
 */
export async function fetchSelfiePacks(opts: {
  accessToken: string;
  pin: string;
  limit?: number;
  signal?: AbortSignal;
  onStage?: (msg: string) => void;
}): Promise<{ selfies: unknown[]; loaded: number; totalListed: number }> {
  const { accessToken, pin, signal, onStage } = opts;
  const limit = Math.max(1, opts.limit ?? 40);
  throwIfAborted(signal);
  onStage?.("Listing photo packs…");
  const files = (await listAppDataContaining(accessToken, SELFIE_PREFIX)).filter(
    (f) => f.name.startsWith(SELFIE_PREFIX) && f.name.endsWith(".enc"),
  );
  const sorted = [...files].sort((a, b) =>
    (b.modifiedTime || b.name).localeCompare(a.modifiedTime || a.name),
  );
  const slice = sorted.slice(0, limit);
  if (!slice.length) return { selfies: [], loaded: 0, totalListed: files.length };
  onStage?.(`Loading ${slice.length} of ${files.length} photo(s)…`);
  const results = await mapPool(slice, 6, async (f) => decryptSelfiePack(accessToken, pin, f), signal);
  const selfies: unknown[] = [];
  for (const r of results) {
    if (r) selfies.push(r.row);
  }
  return { selfies, loaded: selfies.length, totalListed: files.length };
}

function filterTimelineRecent(timeline: unknown[], windowMs: number, nowMs: number): unknown[] {
  const cutoff = nowMs - windowMs;
  const kept = timeline.filter((row) => {
    if (!row || typeof row !== "object") return true;
    const o = row as Record<string, unknown>;
    const candidates = [o.timestamp, o.time, o.atMs, o.createdAtMs, o.ts];
    for (const c of candidates) {
      const n = typeof c === "number" ? c : typeof c === "string" ? Number(c) || Date.parse(c) : NaN;
      if (Number.isFinite(n) && n > 0) return n >= cutoff;
    }
    return true;
  });
  return kept.length ? kept : timeline.slice(-80);
}

function createdAtMs(obj: unknown): number {
  if (!obj || typeof obj !== "object") return 0;
  const v = (obj as Record<string, unknown>).createdAtMs ?? (obj as Record<string, unknown>).exportedAtMs;
  return typeof v === "number" ? v : Number(v) || 0;
}

/** Prefer newer extras pack fields over a stale full-vault snapshot. */
function mergeExtrasIntoVault(base: VaultPayload, extras: VaultPayload | null): VaultPayload {
  if (!extras) return base;
  const extrasAt = createdAtMs(extras);
  const baseAt = createdAtMs(base);
  const preferExtras = extrasAt >= baseAt || !base.geofences?.length;

  const geofences =
    preferExtras && Array.isArray(extras.geofences) && extras.geofences.length
      ? extras.geofences
      : base.geofences?.length
        ? base.geofences
        : extras.geofences;

  const appUsage =
    preferExtras && extras.appUsage
      ? extras.appUsage
      : base.appUsage || extras.appUsage;

  const deviceHealth =
    preferExtras && extras.deviceHealth
      ? extras.deviceHealth
      : base.deviceHealth || extras.deviceHealth;

  return {
    ...base,
    version: base.version ?? extras.version ?? 3,
    geofences,
    appUsage,
    deviceHealth,
    trackingConfigSnapshot:
      (preferExtras && extras.trackingConfigSnapshot) ||
      base.trackingConfigSnapshot ||
      extras.trackingConfigSnapshot,
    pendingSync: preferExtras && extras.pendingSync ? extras.pendingSync : base.pendingSync || extras.pendingSync,
    simHistory: preferExtras && extras.simHistory ? extras.simHistory : base.simHistory || extras.simHistory,
    email: base.email || extras.email,
  };
}

function assembleVault(opts: {
  base: VaultPayload;
  timelineExtra: unknown[];
  selfieExtra: unknown[];
  liveFromPack?: Record<string, unknown>;
  filterRecentMs?: number;
  nowMs?: number;
}): VaultPayload {
  const timeline = mergeTimeline(opts.base.timeline || [], opts.timelineExtra);
  const selfies = mergeSelfies(opts.base.selfies || [], opts.selfieExtra);
  const vaultLive = opts.base.liveLocation as Record<string, unknown> | undefined;
  const liveLocation =
    liveAtMs(opts.liveFromPack) >= liveAtMs(vaultLive)
      ? opts.liveFromPack || vaultLive
      : vaultLive || opts.liveFromPack;

  let outTimeline = timeline;
  if (opts.filterRecentMs != null) {
    outTimeline = filterTimelineRecent(timeline, opts.filterRecentMs, opts.nowMs ?? Date.now());
  }

  return {
    ...opts.base,
    version: opts.base.version ?? 3,
    timeline: outTimeline,
    selfies,
    // Keep base omitted flag when blobs are deferred / still loading
    selfiesOmitted: selfies.length > 0 ? false : Boolean(opts.base.selfiesOmitted),
    liveLocation: liveLocation as VaultPayload["liveLocation"],
  };
}

/**
 * Unlock payload: recent packs first (onPartial), then full history.
 * Legacy vault snapshot is deferred until after the recent window paints.
 */
export async function fetchAndMergeVaultPayload(
  accessToken: string,
  pin: string,
  onStageOrHandlers?: ((msg: string) => void) | ProgressiveVaultHandlers,
): Promise<ChunkMergeResult> {
  const handlers: ProgressiveVaultHandlers =
    typeof onStageOrHandlers === "function"
      ? { onStage: onStageOrHandlers }
      : onStageOrHandlers || {};
  const { onStage, onPartial, onReady, onHistoryProgress, signal } = handlers;
  const nowMs = Date.now();

  onStage?.("Listing Drive app data…");
  throwIfAborted(signal);
  // Skip listing selfie packs on unlock — Media loads them on demand (can be 100s of files).
  const [vaultFiles, extrasFiles, evtFiles, liveFiles] = await Promise.all([
    listExact(accessToken, BACKUP_FILE_NAME),
    listExact(accessToken, EXTRAS_FILE),
    listAppDataContaining(accessToken, EVT_PREFIX),
    listExact(accessToken, LIVE_FILE_NAME),
  ]);

  const evtPacks = evtFiles.filter((f) => f.name.startsWith(EVT_PREFIX) && f.name.endsWith(".enc"));
  const latestVault = [...vaultFiles].sort((a, b) =>
    (b.modifiedTime || "").localeCompare(a.modifiedTime || ""),
  )[0];
  const latestExtras = [...extrasFiles].sort((a, b) =>
    (b.modifiedTime || "").localeCompare(a.modifiedTime || ""),
  )[0];
  const latestLive = [...liveFiles].sort((a, b) =>
    (b.modifiedTime || "").localeCompare(a.modifiedTime || ""),
  )[0];

  if (!latestVault && !latestExtras && evtPacks.length === 0 && !latestLive) {
    throw new Error("No encrypted device backup or event packs found in Drive app data");
  }

  const { recent: recentEvt, older: olderEvt } = partitionRecentEvtPacks(evtPacks, nowMs);
  const sortedRecent = [...recentEvt].sort((a, b) =>
    (a.modifiedTime || a.name).localeCompare(b.modifiedTime || b.name),
  );
  const sortedOlder = [...olderEvt].sort((a, b) =>
    (a.modifiedTime || a.name).localeCompare(b.modifiedTime || b.name),
  );

  let sizeBytes = 0;
  let metaModified: string | undefined;
  let liveFromPack: Record<string, unknown> | undefined;
  const timelineExtra: unknown[] = [];
  let partialFired = false;

  // --- Phase 1: live + recent event packs (parallel) ---
  onStage?.("Loading last hour…");
  throwIfAborted(signal);

  const phase1Jobs: Array<Promise<void>> = [];

  if (latestLive) {
    phase1Jobs.push(
      (async () => {
        try {
          const blob = await downloadDriveFile(accessToken, latestLive.id);
          sizeBytes += blob.byteLength;
          const plain = await decryptVaultUtf8(blob, pin);
          const json = JSON.parse(plain) as { liveLocation?: Record<string, unknown> };
          liveFromPack = json.liveLocation;
          metaModified = latestLive.modifiedTime || metaModified;
        } catch {
          /* skip */
        }
      })(),
    );
  }

  phase1Jobs.push(
    (async () => {
      const results = await mapPool(sortedRecent, 4, async (f) => decryptEvtPack(accessToken, pin, f), signal);
      for (const r of results) {
        if (!r) continue;
        timelineExtra.push(...r.events);
        sizeBytes += r.bytes;
        metaModified = r.modifiedTime || metaModified;
      }
    })(),
  );

  await Promise.all(phase1Jobs);
  throwIfAborted(signal);

  const emptyBase: VaultPayload = {
    version: 3,
    timeline: [],
    selfies: [],
    selfiesOmitted: true,
  };

  if ((liveFromPack || timelineExtra.length > 0) && onPartial) {
    const partialVault = assembleVault({
      base: emptyBase,
      timelineExtra: [...timelineExtra],
      selfieExtra: [],
      liveFromPack,
      filterRecentMs: RECENT_WINDOW_MS,
      nowMs,
    });
    if (partialVault.timeline?.length || partialVault.liveLocation) {
      onPartial({
        vault: partialVault,
        meta: {
          name: "Recent activity",
          modifiedTime: metaModified,
          sizeBytes,
        },
        sources: {
          vault: false,
          evtPacks: sortedRecent.length,
          selfies: 0,
          live: Boolean(liveFromPack),
        },
        partial: true,
      });
      partialFired = true;
    }
  }

  // --- Phase 2: vault + extras snapshot (appUsage / geofences / deviceHealth) ---
  let merged: VaultPayload = emptyBase;
  let hadVault = false;
  let hadExtras = false;
  let metaName = "Event packs";
  let extrasPayload: VaultPayload | null = null;

  if (latestExtras) {
    onStage?.(partialFired ? "Loading zones & usage…" : "Decrypting extras snapshot…");
    throwIfAborted(signal);
    try {
      const blob = await downloadDriveFile(accessToken, latestExtras.id);
      sizeBytes += blob.byteLength;
      const plain = await decryptVaultUtf8(blob, pin);
      extrasPayload = parseVaultJson(plain);
      hadExtras = true;
      metaName = latestExtras.name || EXTRAS_FILE;
      metaModified = latestExtras.modifiedTime || metaModified;
      merged = mergeExtrasIntoVault(merged, extrasPayload);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      /* extras optional when vault or events exist */
    }
  }

  if (latestVault) {
    onStage?.(
      partialFired ? "Loading device snapshot…" : "Decrypting vault snapshot…",
    );
    throwIfAborted(signal);
    try {
      const blob = await downloadDriveFile(accessToken, latestVault.id);
      sizeBytes += blob.byteLength;
      const plain = await decryptVaultUtf8(blob, pin);
      await new Promise<void>((r) => setTimeout(r, 0));
      throwIfAborted(signal);
      const vaultSnap = parseVaultJson(plain);
      hadVault = true;
      metaName = latestVault.name || BACKUP_FILE_NAME;
      metaModified = latestVault.modifiedTime || metaModified;
      // Vault carries timeline/selfies; extras win for geofences/appUsage when newer.
      merged = mergeExtrasIntoVault(vaultSnap, extrasPayload);

      // Keep vault-embedded selfie blobs for Media; packs load only on the Media page.
      const paintSelfies = merged.selfies || [];

      if (onPartial) {
        const partialVault = assembleVault({
          base: { ...merged, selfies: paintSelfies, selfiesOmitted: false },
          timelineExtra: [...timelineExtra],
          selfieExtra: [],
          liveFromPack,
          filterRecentMs: partialFired ? undefined : RECENT_WINDOW_MS,
          nowMs,
        });
        onPartial({
          vault: partialVault,
          meta: {
            name: metaName,
            modifiedTime: metaModified,
            sizeBytes,
          },
          sources: {
            vault: true,
            evtPacks: sortedRecent.length,
            selfies: paintSelfies.length,
            live: Boolean(liveFromPack || partialVault.liveLocation),
          },
          partial: true,
        });
        partialFired = true;
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      if (!timelineExtra.length && !liveFromPack && !hadExtras) throw e;
      /* keep chunk-only merge */
    }
  } else if (hadExtras && onPartial) {
    const partialVault = assembleVault({
      base: merged,
      timelineExtra: [...timelineExtra],
      selfieExtra: [],
      liveFromPack,
      filterRecentMs: partialFired ? undefined : RECENT_WINDOW_MS,
      nowMs,
    });
    onPartial({
      vault: partialVault,
      meta: { name: metaName, modifiedTime: metaModified, sizeBytes },
      sources: {
        vault: false,
        evtPacks: sortedRecent.length,
        selfies: 0,
        live: Boolean(liveFromPack || partialVault.liveLocation),
      },
      partial: true,
    });
    partialFired = true;
  }

  // Photo packs are NOT decrypted on unlock (can be hundreds). Media page loads on demand.
  if (!(merged.selfies && merged.selfies.length)) {
    merged = { ...merged, selfiesOmitted: true, selfies: merged.selfies || [] };
  }

  // UI-ready: vault/extras + recent events — do not wait for photos or full history.
  const olderForUnlock = sortedOlder
    .slice()
    .sort((a, b) => (b.modifiedTime || b.name).localeCompare(a.modifiedTime || a.name))
    .slice(0, MAX_OLDER_EVT_PACKS_ON_UNLOCK);
  const readyVault = assembleVault({
    base: merged,
    timelineExtra: [...timelineExtra],
    selfieExtra: [],
    liveFromPack,
  });
  if (onReady || onPartial) {
    const readyResult: ChunkMergeResult = {
      vault: readyVault,
      meta: {
        name: hadVault || hadExtras ? metaName : "Recent activity",
        modifiedTime: metaModified,
        sizeBytes,
      },
      sources: {
        vault: hadVault || hadExtras,
        evtPacks: sortedRecent.length,
        selfies: readyVault.selfies?.length || 0,
        live: Boolean(liveFromPack),
      },
      partial: olderForUnlock.length > 0,
    };
    if (onReady) onReady(readyResult);
    else onPartial?.(readyResult);
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  // --- Cap older event packs (background; UI already ready) ---
  if (olderForUnlock.length) {
    onStage?.(
      olderForUnlock.length < sortedOlder.length
        ? `Updating recent history (${olderForUnlock.length} of ${sortedOlder.length} packs)…`
        : `Updating history (${olderForUnlock.length} packs)…`,
    );
    throwIfAborted(signal);
    const BATCH = 10;
    for (let i = 0; i < olderForUnlock.length; i += BATCH) {
      throwIfAborted(signal);
      const slice = olderForUnlock.slice(i, i + BATCH);
      const results = await mapPool(slice, 5, async (f) => decryptEvtPack(accessToken, pin, f), signal);
      for (const r of results) {
        if (!r) continue;
        timelineExtra.push(...r.events);
        sizeBytes += r.bytes;
        metaModified = r.modifiedTime || metaModified;
      }
      if (onHistoryProgress) {
        onHistoryProgress({
          vault: assembleVault({
            base: merged,
            timelineExtra: [...timelineExtra],
            selfieExtra: [],
            liveFromPack,
          }),
          meta: {
            name: hadVault || hadExtras ? metaName : "Event packs",
            modifiedTime: metaModified,
            sizeBytes,
          },
          sources: {
            vault: hadVault || hadExtras,
            evtPacks: sortedRecent.length + Math.min(i + BATCH, olderForUnlock.length),
            selfies: merged.selfies?.length || 0,
            live: Boolean(liveFromPack),
          },
          partial: i + BATCH < olderForUnlock.length,
        });
      }
      if (i + BATCH < olderForUnlock.length) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
  }

  const vault = assembleVault({
    base: merged,
    timelineExtra,
    selfieExtra: [],
    liveFromPack,
  });

  if (
    !hadVault &&
    !hadExtras &&
    (vault.timeline?.length ?? 0) === 0 &&
    !vault.liveLocation
  ) {
    throw new Error("Could not decrypt any Drive chunk packs — check PIN");
  }

  return {
    vault,
    meta: {
      name: hadVault || hadExtras ? metaName : "Event packs",
      modifiedTime: metaModified,
      sizeBytes,
    },
    sources: {
      vault: hadVault || hadExtras,
      evtPacks: evtPacks.length,
      selfies: vault.selfies?.length || 0,
      live: Boolean(liveFromPack),
    },
    partial: false,
  };
}

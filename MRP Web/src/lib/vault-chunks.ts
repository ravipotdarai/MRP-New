/**
 * Append-only Drive chunk files (event / selfie / live) — merge on read.
 * Writers never download; Web/restore list+decrypt+merge.
 */

import {
  BACKUP_FILE_NAME,
  downloadDriveFile,
} from "@/lib/drive-appdata";
import {
  decryptVaultUtf8,
  parseVaultJson,
  type VaultPayload,
} from "@/lib/vault-crypto";

export const LIVE_FILE_NAME = "mrp_live.enc";
export const EVT_PREFIX = "mrp_evt_";
export const SELFIE_PREFIX = "mrp_selfie_";

type ListedFile = { id: string; name: string; modifiedTime?: string; size?: string };

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

export type ChunkMergeResult = {
  vault: VaultPayload;
  meta: { name: string; modifiedTime?: string; sizeBytes?: number };
  sources: { vault: boolean; evtPacks: number; selfies: number; live: boolean };
};

/**
 * Unlock payload: optional legacy vault baseline + evt/selfie/live chunks.
 * Succeeds with chunks only (no vault required).
 */
export async function fetchAndMergeVaultPayload(
  accessToken: string,
  pin: string,
  onStage?: (msg: string) => void,
): Promise<ChunkMergeResult> {
  onStage?.("Listing Drive app data…");
  const [vaultFiles, evtFiles, selfieFiles, liveFiles] = await Promise.all([
    listExact(accessToken, BACKUP_FILE_NAME),
    listAppDataContaining(accessToken, EVT_PREFIX),
    listAppDataContaining(accessToken, SELFIE_PREFIX),
    listExact(accessToken, LIVE_FILE_NAME),
  ]);

  const evtPacks = evtFiles.filter((f) => f.name.startsWith(EVT_PREFIX) && f.name.endsWith(".enc"));
  const selfiePacks = selfieFiles.filter(
    (f) => f.name.startsWith(SELFIE_PREFIX) && f.name.endsWith(".enc"),
  );
  const latestVault = [...vaultFiles].sort((a, b) =>
    (b.modifiedTime || "").localeCompare(a.modifiedTime || ""),
  )[0];
  const latestLive = [...liveFiles].sort((a, b) =>
    (b.modifiedTime || "").localeCompare(a.modifiedTime || ""),
  )[0];

  if (!latestVault && evtPacks.length === 0 && !latestLive) {
    throw new Error("No encrypted device backup or event packs found in Drive app data");
  }

  let merged: VaultPayload = {
    version: 3,
    timeline: [],
    selfies: [],
    selfiesOmitted: true,
  };
  let metaName = "Chunk packs";
  let metaModified: string | undefined;
  let sizeBytes = 0;
  let hadVault = false;

  if (latestVault) {
    onStage?.("Downloading legacy vault snapshot…");
    const blob = await downloadDriveFile(accessToken, latestVault.id);
    sizeBytes += blob.byteLength;
    onStage?.("Decrypting vault snapshot…");
    const plain = await decryptVaultUtf8(blob, pin);
    merged = parseVaultJson(plain);
    hadVault = true;
    metaName = latestVault.name || BACKUP_FILE_NAME;
    metaModified = latestVault.modifiedTime;
  }

  const timelineExtra: unknown[] = [];
  // Newest packs last so they win on id merge
  const sortedEvt = [...evtPacks].sort((a, b) =>
    (a.modifiedTime || a.name).localeCompare(b.modifiedTime || b.name),
  );
  for (const f of sortedEvt) {
    onStage?.(`Decrypting ${f.name}…`);
    try {
      const blob = await downloadDriveFile(accessToken, f.id);
      sizeBytes += blob.byteLength;
      const plain = await decryptVaultUtf8(blob, pin);
      const json = JSON.parse(plain) as { events?: unknown[] };
      if (Array.isArray(json.events)) timelineExtra.push(...json.events);
      metaModified = f.modifiedTime || metaModified;
    } catch {
      /* skip corrupt pack */
    }
  }

  const selfieExtra: unknown[] = [];
  for (const f of selfiePacks) {
    onStage?.(`Decrypting selfie ${f.name}…`);
    try {
      const blob = await downloadDriveFile(accessToken, f.id);
      sizeBytes += blob.byteLength;
      const plain = await decryptVaultUtf8(blob, pin);
      const json = JSON.parse(plain) as Record<string, unknown>;
      selfieExtra.push(json);
      metaModified = f.modifiedTime || metaModified;
    } catch {
      /* skip */
    }
  }

  let liveFromPack: Record<string, unknown> | undefined;
  if (latestLive) {
    onStage?.("Decrypting live location…");
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
  }

  const timeline = mergeTimeline(merged.timeline || [], timelineExtra);
  const selfies = mergeSelfies(merged.selfies || [], selfieExtra);
  const vaultLive = merged.liveLocation as Record<string, unknown> | undefined;
  const liveLocation =
    liveAtMs(liveFromPack) >= liveAtMs(vaultLive) ? liveFromPack || vaultLive : vaultLive || liveFromPack;

  const vault: VaultPayload = {
    ...merged,
    version: merged.version ?? 3,
    timeline,
    selfies,
    selfiesOmitted: selfies.length === 0,
    liveLocation: liveLocation as VaultPayload["liveLocation"],
  };

  if (!hadVault && timeline.length === 0 && !liveLocation) {
    throw new Error("Could not decrypt any Drive chunk packs — check PIN");
  }

  return {
    vault,
    meta: {
      name: hadVault ? metaName : "Event packs",
      modifiedTime: metaModified,
      sizeBytes,
    },
    sources: {
      vault: hadVault,
      evtPacks: sortedEvt.length,
      selfies: selfieExtra.length,
      live: Boolean(liveFromPack),
    },
  };
}

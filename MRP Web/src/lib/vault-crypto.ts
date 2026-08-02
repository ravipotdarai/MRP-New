/**
 * Matches mobile VaultBackupCrypto (AES-256-GCM, PBKDF2 120k, MRP "MRP1").
 * Runs in the browser — plaintext never sent to Nest/Firebase.
 */

const ITERATIONS = 120_000;
const SALT_LEN = 16;
const IV_LEN = 12;
const MAGIC = "MRP1";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

export type DecryptProgress = "derive" | "decrypt" | "decode";

/** In-tab PBKDF2 cache — same PIN+salt skips 120k iterations on refresh. */
const keyCache = new Map<string, CryptoKey>();

function saltKey(pin: string, salt: Uint8Array): string {
  let h = pin.length * 31;
  for (let i = 0; i < salt.length; i++) h = (h * 33 + salt[i]) | 0;
  return `${pin}\0${h}\0${salt.length}`;
}

export async function decryptVaultUtf8(
  blob: ArrayBuffer,
  pin: string,
  onStage?: (stage: DecryptProgress) => void,
): Promise<string> {
  const bytes = new Uint8Array(blob);
  assert(bytes.byteLength > MAGIC.length + 1 + SALT_LEN + IV_LEN, "Backup file too small");

  const magic = new TextDecoder().decode(bytes.slice(0, MAGIC.length));
  assert(magic === MAGIC, "Not an MRP backup");
  const version = bytes[MAGIC.length];
  assert(version === 1, `Unsupported backup version ${version}`);

  const saltStart = MAGIC.length + 1;
  const salt = bytes.slice(saltStart, saltStart + SALT_LEN);
  const iv = bytes.slice(saltStart + SALT_LEN, saltStart + SALT_LEN + IV_LEN);
  const ct = bytes.slice(saltStart + SALT_LEN + IV_LEN);

  const cacheId = saltKey(pin, salt);
  let key = keyCache.get(cacheId);
  if (!key) {
    onStage?.("derive");
    key = await deriveKey(pin, salt);
    keyCache.set(cacheId, key);
  }

  onStage?.("decrypt");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 },
    key,
    ct as BufferSource,
  );
  onStage?.("decode");
  return new TextDecoder().decode(plain);
}

/** Drop heavy selfie blobs so React can paint ops UI first; hydrate after unlock. */
export function vaultWithoutSelfieBlobs(vault: VaultPayload): VaultPayload {
  if (!vault.selfies?.length) return vault;
  return {
    ...vault,
    selfies: vault.selfies.map((s) => {
      const o = { ...(s as Record<string, unknown>) };
      const had =
        Boolean(o.dataBase64 || o.base64 || o.data) || o.blobDeferred === true;
      delete o.dataBase64;
      delete o.base64;
      delete o.data;
      if (had) o.blobDeferred = true;
      return o;
    }),
  };
}

export function clearVaultKeyCache(): void {
  keyCache.clear();
}

export type VaultPayload = {
  version?: number;
  createdAtMs?: number;
  syncReason?: string;
  email?: string;
  timeline?: unknown[];
  liveLocation?: Record<string, unknown>;
  selfies?: unknown[];
  selfiesOmitted?: boolean;
  pendingSync?: unknown[];
  simHistory?: unknown[];
  trackingConfigSnapshot?: Record<string, unknown>;
  /** v3 — today's usage sessions + safety permission sections */
  appUsage?: {
    dayStartMs?: number;
    exportedAtMs?: number;
    sessionCount?: number;
    sessions?: Array<{
      packageName?: string;
      appName?: string;
      startTime?: number;
      endTime?: number;
      durationSeconds?: number;
    }>;
    safety?: {
      sms?: Array<{ packageName?: string; appName?: string; permissions?: string[] }>;
      camera?: Array<{ packageName?: string; appName?: string; permissions?: string[] }>;
      microphone?: Array<{ packageName?: string; appName?: string; permissions?: string[] }>;
      scannedAtMs?: number;
    };
  };
  deviceHealth?: Record<string, unknown>;
  geofences?: Array<{
    id?: string;
    name?: string;
    latitude?: number;
    longitude?: number;
    radiusMeters?: number;
  }>;
};

export function parseVaultJson(plain: string): VaultPayload {
  return JSON.parse(plain) as VaultPayload;
}

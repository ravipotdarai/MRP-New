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

export async function decryptVaultUtf8(blob: ArrayBuffer, pin: string): Promise<string> {
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

  const key = await deriveKey(pin, salt);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 },
    key,
    ct as BufferSource,
  );
  return new TextDecoder().decode(plain);
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
};

export function parseVaultJson(plain: string): VaultPayload {
  return JSON.parse(plain) as VaultPayload;
}

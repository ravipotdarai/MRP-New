import { get, push, ref, update } from "firebase/database";
import { getFirebaseDb } from "./firebase";

/** Sync policy only — never lat/lng/timeline/selfies (matches mobile + RTDB rules). */
export type DeviceConfig = {
  movementTracking?: boolean;
  backgroundTracking?: boolean;
  highAccuracy?: boolean;
  eventSyncEnabled?: boolean;
  syncOnWifi?: boolean;
  syncOnMobileData?: boolean;
  syncLocation?: boolean;
  syncGeofenceChanges?: boolean;
  syncSelfiesPremium?: boolean;
  syncFrequencyMinutes?: number;
  emergencyTracking?: boolean;
  emergencyIntervalMinutes?: number;
  /** Optional identity hint for admin search (email only — never vault). */
  accountEmail?: string;
  updatedAtMs?: number;
  source?: string;
};

export type DeviceConfigRow = {
  uid: string;
  config: DeviceConfig;
};

export type AdminAuditEntry = {
  id: string;
  atMs: number;
  actorEmail: string;
  actorUid: string;
  action: string;
  targetUid: string;
  note?: string;
};

export const DEVICE_CONFIG_DEFAULTS: DeviceConfig = {
  movementTracking: true,
  backgroundTracking: false,
  highAccuracy: false,
  eventSyncEnabled: true,
  syncOnWifi: true,
  syncOnMobileData: false,
  syncLocation: true,
  syncGeofenceChanges: true,
  syncSelfiesPremium: true,
  syncFrequencyMinutes: 15,
  emergencyTracking: false,
  emergencyIntervalMinutes: 5,
};

const FORBIDDEN = ["lat", "lng", "address", "timeline", "selfie", "selfies"] as const;

function scrub(payload: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...payload };
  for (const k of FORBIDDEN) delete clean[k];
  return clean;
}

export async function readDeviceConfig(uid: string): Promise<DeviceConfig | null> {
  const snap = await get(ref(getFirebaseDb(), `device_config/${uid}`));
  if (!snap.exists()) return null;
  return snap.val() as DeviceConfig;
}

/** Admin-only: list all device_config children (RTDB parent read). */
export async function listDeviceConfigs(): Promise<DeviceConfigRow[]> {
  const snap = await get(ref(getFirebaseDb(), "device_config"));
  if (!snap.exists()) return [];
  const val = snap.val() as Record<string, DeviceConfig>;
  return Object.entries(val).map(([uid, config]) => ({ uid, config: config || {} }));
}

export async function writeDeviceConfig(
  uid: string,
  patch: DeviceConfig,
  source: "web" | "admin" = "web",
): Promise<void> {
  const emerg = Math.max(1, Number(patch.emergencyIntervalMinutes ?? 1));
  const freq = Math.max(10, Number(patch.syncFrequencyMinutes ?? 15));
  const payload: DeviceConfig = {
    ...patch,
    emergencyIntervalMinutes: emerg,
    syncFrequencyMinutes: freq,
    updatedAtMs: Date.now(),
    source,
  };
  await update(ref(getFirebaseDb(), `device_config/${uid}`), scrub(payload as Record<string, unknown>));
}

export async function appendAdminAudit(entry: {
  actorEmail: string;
  actorUid: string;
  action: string;
  targetUid: string;
  note?: string;
}): Promise<void> {
  const row = scrub({
    atMs: Date.now(),
    actorEmail: entry.actorEmail,
    actorUid: entry.actorUid,
    action: entry.action,
    targetUid: entry.targetUid,
    note: entry.note || "",
  });
  await push(ref(getFirebaseDb(), "admin_audit"), row);
}

export async function listAdminAudit(limit = 40): Promise<AdminAuditEntry[]> {
  const snap = await get(ref(getFirebaseDb(), "admin_audit"));
  if (!snap.exists()) return [];
  const val = snap.val() as Record<string, Omit<AdminAuditEntry, "id">>;
  return Object.entries(val)
    .map(([id, row]) => ({ id, ...row }))
    .sort((a, b) => (b.atMs || 0) - (a.atMs || 0))
    .slice(0, limit);
}

export function formatConfigTime(ms?: number): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

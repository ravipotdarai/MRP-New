import { DeviceTrackingConfig } from './device.service';
import { getAdminDb, isAdminSdkConfigured } from '../firebase/admin';

const FORBIDDEN = new Set([
  'lat',
  'lng',
  'address',
  'timeline',
  'selfie',
  'selfies',
]);

export function scrubConfig(
  patch: Partial<DeviceTrackingConfig> & Record<string, unknown>,
): Partial<DeviceTrackingConfig> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (FORBIDDEN.has(k)) continue;
    out[k] = v;
  }
  return out as Partial<DeviceTrackingConfig>;
}

/**
 * Write device_config/{uid} via Admin SDK when credentials exist.
 * Returns null if Admin SDK is not configured (web client should write RTDB).
 */
export async function writeDeviceConfigAdmin(
  uid: string,
  applied: DeviceTrackingConfig & { updatedAtMs: number; source: string },
): Promise<{ written: boolean; path: string; note: string }> {
  const path = `device_config/${uid}`;
  if (!isAdminSdkConfigured()) {
    return {
      written: false,
      path,
      note: 'Admin SDK not configured — use MRP Web client RTDB write, or set FIREBASE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS',
    };
  }
  const db = getAdminDb();
  if (!db) {
    return { written: false, path, note: 'Admin DB unavailable' };
  }
  const clean = scrubConfig(applied as unknown as Record<string, unknown>);
  await db.ref(path).update({
    ...clean,
    updatedAtMs: applied.updatedAtMs,
    source: applied.source,
  });
  return { written: true, path, note: 'RTDB device_config updated via Admin SDK' };
}

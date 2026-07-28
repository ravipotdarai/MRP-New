/**
 * Device sync **policy** stubs (P6). Privacy MVP:
 * Firebase RTDB = device_config/{uid} only (what / when / frequency).
 * Data plane = device local + Google Drive encrypted vault.
 * Circle live RTDB is unchanged for now.
 */
import { writeDeviceConfigAdmin } from './device-config.rtdb';

export type DeviceTrackingConfig = {
  movementTracking: boolean;
  backgroundTracking: boolean;
  highAccuracy: boolean;
  eventSyncEnabled: boolean;
  syncOnWifi: boolean;
  syncOnMobileData: boolean;
  syncLocation: boolean;
  syncGeofenceChanges: boolean;
  syncSelfiesPremium: boolean;
  syncFrequencyMinutes: number;
  emergencyTracking: boolean;
  emergencyIntervalMinutes: number;
  accountEmail?: string;
  updatedAtMs?: number;
  source?: 'device' | 'web' | 'admin';
};

export class DeviceService {
  defaults(): DeviceTrackingConfig {
    return {
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
  }

  /**
   * Apply policy and optionally write Firebase Admin RTDB device_config/{uid}.
   * Rejects payload-like fields.
   */
  async patchConfig(
    uid: string,
    patch: Partial<DeviceTrackingConfig>,
    source: 'web' | 'admin' = 'web',
  ) {
    const emerg = Math.max(1, patch.emergencyIntervalMinutes ?? 5);
    const freq = Math.max(10, patch.syncFrequencyMinutes ?? 15);
    const applied: DeviceTrackingConfig & { updatedAtMs: number; source: string } = {
      ...this.defaults(),
      ...patch,
      emergencyIntervalMinutes: emerg,
      syncFrequencyMinutes: freq,
      updatedAtMs: Date.now(),
      source,
    };
    // Strip forbidden keys if present on patch
    const appliedRec = applied as unknown as Record<string, unknown>;
    for (const k of ['lat', 'lng', 'address', 'timeline', 'selfie', 'selfies']) {
      delete appliedRec[k];
    }

    const rtdb = await writeDeviceConfigAdmin(uid, applied);
    return {
      ok: true,
      uid,
      applied,
      rtdb,
      note: rtdb.written
        ? rtdb.note
        : 'Config-only response — wire credentials for Admin RTDB write, or use MRP Web client',
    };
  }

  /** Web should decrypt Drive vault for live/timeline — not RTDB device_live. */
  liveStub(uid: string) {
    return {
      uid,
      dataPlane: 'google_drive_appdata',
      configPath: `device_config/${uid}`,
      note: 'Read sync policy from RTDB; read location/events from user Drive vault (P6 web)',
    };
  }
}

import {NativeModules} from 'react-native';

export type DeviceTrackingConfig = {
  movementTracking: boolean;
  backgroundTracking: boolean;
  highAccuracy: boolean;
  /** Queue Drive sync on security events (not Firebase). */
  eventSyncEnabled: boolean;
  syncOnWifi: boolean;
  syncOnMobileData: boolean;
  syncLocation: boolean;
  syncGeofenceChanges: boolean;
  /** Premium+ selfie bytes in Drive vault. */
  syncSelfiesPremium: boolean;
  /** Normal Drive sync cadence (minutes, min 10). Emergency uses its own interval. */
  syncFrequencyMinutes: number;
  emergencyTracking: boolean;
  /** Emergency sync interval (minutes, min 1, default 1). */
  emergencyIntervalMinutes: number;
};

const MIN_SYNC_FREQUENCY_MINUTES = 10;

const defaults: DeviceTrackingConfig = {
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
  emergencyIntervalMinutes: 1,
};

type Native = {
  getConfig(): Promise<DeviceTrackingConfig>;
  setConfig(config: DeviceTrackingConfig): Promise<boolean>;
  pullRemoteConfig(): Promise<boolean>;
  startPresence(): Promise<boolean>;
  stopPresence(): Promise<boolean>;
};

const native = NativeModules.DeviceTracking as Native | undefined;

export async function getTrackingConfig(): Promise<DeviceTrackingConfig> {
  if (!native?.getConfig) return {...defaults};
  const cfg = await native.getConfig();
  return {
    ...defaults,
    ...cfg,
    syncFrequencyMinutes: Math.max(
      MIN_SYNC_FREQUENCY_MINUTES,
      Number(cfg.syncFrequencyMinutes) || 15,
    ),
    emergencyIntervalMinutes: Math.max(1, Number(cfg.emergencyIntervalMinutes) || 1),
  };
}

export async function setTrackingConfig(cfg: DeviceTrackingConfig): Promise<boolean> {
  if (!native?.setConfig) return false;
  return native.setConfig({
    ...cfg,
    syncFrequencyMinutes: Math.max(
      MIN_SYNC_FREQUENCY_MINUTES,
      cfg.syncFrequencyMinutes || 15,
    ),
    emergencyIntervalMinutes: Math.max(1, cfg.emergencyIntervalMinutes || 1),
  });
}

export async function pullRemoteTrackingConfig(): Promise<boolean> {
  if (!native?.pullRemoteConfig) return false;
  return native.pullRemoteConfig();
}

export async function startDevicePresence(): Promise<boolean> {
  if (!native?.startPresence) return false;
  return native.startPresence();
}

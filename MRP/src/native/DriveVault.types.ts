import {NativeModules} from 'react-native';

export type DriveVaultStatus = {
  googleSignedIn: boolean;
  driveConnected: boolean;
  recoveryAcknowledged: boolean;
  wifiOnly: boolean;
  pausedQuota: boolean;
  lastBackupMs: number;
  lastFileId?: string | null;
  pendingSyncCount: number;
  timelineCount: number;
  remoteModifiedTime?: string | null;
  remoteSizeBytes?: number | null;
  email?: string | null;
};

export type DriveBackupResult = {
  ok: boolean;
  fileId: string;
  timelineCount: number;
  bytes: number;
  modifiedTime?: string | null;
  purgedOldBackups?: number;
  pendingSyncDrained?: number;
};

export type DriveRestoreResult = {
  ok: boolean;
  restoredEvents: number;
  backupEvents: number;
  fileId: string;
  modifiedTime?: string | null;
};

type DriveVaultNative = {
  getStatus(): Promise<DriveVaultStatus>;
  setWifiOnly(enabled: boolean): Promise<boolean>;
  connectDrive(): Promise<boolean>;
  backupNow(pin: string): Promise<DriveBackupResult>;
  restoreLatest(pin: string): Promise<DriveRestoreResult>;
  getAllowedDriveScopes(): Promise<string[]>;
};

const native = NativeModules.DriveVault as DriveVaultNative | undefined;

export async function getDriveStatus(): Promise<DriveVaultStatus> {
  if (!native?.getStatus) {
    throw new Error('DriveVault native module missing — reinstall the app');
  }
  return native.getStatus();
}

export async function setDriveWifiOnly(enabled: boolean): Promise<boolean> {
  if (!native?.setWifiOnly) return false;
  return native.setWifiOnly(enabled);
}

export async function connectDrive(): Promise<boolean> {
  if (!native?.connectDrive) {
    throw new Error('DriveVault native module missing — reinstall the app');
  }
  return native.connectDrive();
}

export async function backupNow(pin: string): Promise<DriveBackupResult> {
  if (!native?.backupNow) {
    throw new Error('DriveVault native module missing — reinstall the app');
  }
  return native.backupNow(pin);
}

export async function restoreLatest(pin: string): Promise<DriveRestoreResult> {
  if (!native?.restoreLatest) {
    throw new Error('DriveVault native module missing — reinstall the app');
  }
  return native.restoreLatest(pin);
}

export async function getAllowedDriveScopes(): Promise<string[]> {
  if (!native?.getAllowedDriveScopes) {
    return ['https://www.googleapis.com/auth/drive.appdata'];
  }
  return native.getAllowedDriveScopes();
}

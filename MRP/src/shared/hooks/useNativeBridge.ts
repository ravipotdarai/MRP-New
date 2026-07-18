import {NativeModules, NativeEventEmitter} from 'react-native';

const MrpNative = NativeModules.MrpNative || NativeModules.MrpNativeModule;

export interface MrpNativeInterface {
  startMonitoring(): Promise<boolean>;
  stopMonitoring(): Promise<boolean>;
  requestAccessibilityEnable(): Promise<boolean>;
  requestDeviceAdminEnable(): Promise<boolean>;
  disableDeviceAdmin(): Promise<boolean>;
  isAccessibilityEnabled(): Promise<boolean>;
  isDeviceAdminEnabled(): Promise<boolean>;
  checkOverlayPermission(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  requestCameraPermission(): Promise<boolean>;
  checkCameraPermission(): Promise<boolean>;
  requestLocationPermission(): Promise<boolean>;
  checkLocationPermission(): Promise<boolean>;
  getEvents(): Promise<any[]>;
  getEventById(id: string): Promise<any | null>;
  deleteEvent(id: string): Promise<boolean>;
  clearAllEvents(): Promise<boolean>;
  getPhotos(): Promise<any[]>;
  deletePhoto(path: string): Promise<boolean>;
  deleteAllPhotos(): Promise<boolean>;
  takePhoto(): Promise<boolean>;
  testPhotoCapture(eventName: string): Promise<boolean>;
  getServiceRunning(): Promise<boolean>;
  openAppSettings(): Promise<boolean>;
  getSettings(): Promise<any>;
  saveSettings(settings: any): Promise<boolean>;
  getTimeline(): Promise<any[]>;
  deleteTimelineEntry(entryId: string): Promise<boolean>;
  clearTimeline(): Promise<boolean>;
  getPhotosDirectory(): Promise<string>;
  getTimelineFilePath(): Promise<string>;
  getAppUsage(): Promise<any[]>;
  getAppUsageForRange(days: number): Promise<any[]>;
  hasUsageStatsPermission(): Promise<boolean>;
  requestUsageStatsPermission(): Promise<boolean>;
  getMrpBatteryUsage(): Promise<any>;
  clearPermissionCache(): Promise<boolean>;
  getDeviceBatteryLevel(): Promise<number>;
  getNetworkInfo(): Promise<{
    carrierName: string;
    connectionType: string;
    isWifi: boolean;
    isMobile: boolean;
  }>;
  getGpsStatus(): Promise<{
    gpsActive: boolean;
    networkLocationActive: boolean;
    permissionGranted: boolean;
    isLocationAvailable: boolean;
  }>;
  getCurrentLocationWithAddress(): Promise<{
    latitude: number;
    longitude: number;
    accuracy_meters: number;
    detailed_address: string;
    provider: string;
  } | null>;
  getSimRecoveryStatus(): Promise<any>;
  setSimRecoveryEnabled(enabled: boolean, consent: boolean): Promise<boolean>;
  getRecoveryContacts(): Promise<any[]>;
  saveRecoveryContact(
    name: string,
    phone: string,
    relationship: string,
    priority: number,
  ): Promise<any>;
  deleteRecoveryContact(id: string): Promise<boolean>;
  testRecoverySms(): Promise<boolean | {success: boolean; message: string}>;
  getSimChangeHistory(): Promise<string>;
  deleteSimChangeHistory(): Promise<boolean>;
  checkSmsPermission(): Promise<boolean>;
  checkPhonePermission(): Promise<boolean>;
  requestRuntimePermissions(permissions: string[]): Promise<boolean>;
  getCurrentSimPhoneNumber(): Promise<{
    available: boolean;
    phoneNumber: string;
    phoneNumberMasked: string;
    carrier: string;
    simSlot: number;
  }>;
}

const mrpmModule = MrpNative as MrpNativeInterface;
export const eventEmitter = new NativeEventEmitter(MrpNative);

// Re-export types
export type {MonitoringEvent, Photo, MonitoringSettings, TimelineEntry} from '../types';

export default mrpmModule;
import {NativeModules, NativeEventEmitter} from 'react-native';

const {MrpNative} = NativeModules;

export interface MrpNativeInterface {
  startMonitoring(): Promise<boolean>;
  stopMonitoring(): Promise<boolean>;
  requestAccessibilityEnable(): Promise<boolean>;
  requestDeviceAdminEnable(): Promise<boolean>;
  disableDeviceAdmin(): Promise<boolean>;
  isAccessibilityEnabled(): Promise<boolean>;
  isDeviceAdminEnabled(): Promise<boolean>;
  getEvents(): Promise<any[]>;
  getEventById(id: string): Promise<any | null>;
  deleteEvent(id: string): Promise<boolean>;
  clearAllEvents(): Promise<boolean>;
  getPhotos(): Promise<any[]>;
  deletePhoto(path: string): Promise<boolean>;
  takePhoto(): Promise<boolean>;
  getServiceRunning(): Promise<boolean>;
  openAppSettings(): Promise<boolean>;
  getSettings(): Promise<any>;
  saveSettings(settings: any): Promise<boolean>;
  getTimeline(): Promise<any[]>;
  deleteTimelineEntry(entryId: string): Promise<boolean>;
  clearTimeline(): Promise<boolean>;
  getPhotosDirectory(): Promise<string>;
  getTimelineFilePath(): Promise<string>;
}

const mrpmModule = MrpNative as MrpNativeInterface;
export const eventEmitter = new NativeEventEmitter(MrpNative);

// Re-export types
export type {MonitoringEvent, Photo, MonitoringSettings, TimelineEntry} from '../types';

export default mrpmModule;
import {NativeModules} from 'react-native';

interface PhotoData {
  path: string;
  timestamp: number;
  name: string;
}

interface MrpNativeInterface {
  startMonitoring(): Promise<boolean>;
  stopMonitoring(): Promise<boolean>;
  requestAccessibilityEnable(): Promise<boolean>;
  isAccessibilityEnabled(): Promise<boolean>;
  getPhotos(): Promise<PhotoData[]>;
  deletePhoto(path: string): Promise<boolean>;
  takePhoto(): Promise<boolean>;
  getServiceRunning(): Promise<boolean>;
  openAppSettings(): Promise<boolean>;
  requestCameraPermission(): Promise<boolean>;
  requestLocationPermission(): Promise<boolean>;
  checkCameraPermission(): Promise<boolean>;
  checkLocationPermission(): Promise<boolean>;
  clearPermissionCache(): Promise<boolean>;
}

const {MrpNative} = NativeModules;

export default MrpNative as MrpNativeInterface;
export type {PhotoData};
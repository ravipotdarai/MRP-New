// Domain types matching the new JSON schema

export type EventType =
  | 'WRONG_PASSWORD'
  | 'WRONG_BIOMETRIC'
  | 'SCREEN_LOCK'
  | 'SCREEN_UNLOCK'
  | 'UNLOCK_FAILED'
  | 'AIRPLANE_MODE_TOGGLE'
  | 'WIFI_TOGGLE'
  | 'MOBILE_DATA_TOGGLE'
  | 'HOTSPOT_TOGGLE'
  | 'SIM_REMOVED'
  | 'SIM_INSERTED'
  | 'FACTORY_RESET'
  | 'DEVICE_BOOT'
  | 'USB_CONNECTED';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  detailed_address: string;
}

export interface GeofenceStatus {
  inside_fence: boolean;
  fence_id: string | null;
}

export interface TimelineEntry {
  id: string;
  timestamp: string;
  event_type: string;
  status: string;
  location: LocationData;
  geofence_status: GeofenceStatus;
  metadata: Record<string, any>;
}

export interface MonitoringSettings {
  isMonitoringEnabled: boolean;
  captureOnWrongUnlock: boolean;
  captureOnAirplaneMode: boolean;
  captureOnWifiToggle: boolean;
  captureOnMobileData: boolean;
  captureOnHotspot: boolean;
  captureOnSimChange: boolean;
  captureOnFactoryReset: boolean;
  captureOnUsb: boolean;
  maxFailedAttempts: number;
  lockAfterFailedAttempts: boolean;
  autoDeleteAfterDays: number;
}

export interface Photo {
  id: string;
  path: string;
  timestamp: number;
}

export interface MonitoringEvent {
  id: string;
  type: EventType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: number;
  metadata: Record<string, any>;
}
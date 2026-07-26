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
export declare class DeviceService {
    defaults(): DeviceTrackingConfig;
    patchConfig(uid: string, patch: Partial<DeviceTrackingConfig>, source?: 'web' | 'admin'): Promise<{
        ok: boolean;
        uid: string;
        applied: DeviceTrackingConfig & {
            updatedAtMs: number;
            source: string;
        };
        rtdb: {
            written: boolean;
            path: string;
            note: string;
        };
        note: string;
    }>;
    liveStub(uid: string): {
        uid: string;
        dataPlane: string;
        configPath: string;
        note: string;
    };
}

import { AuthUser } from '../auth/auth.types';
import { DeviceService, DeviceTrackingConfig } from './device.service';
export declare class DeviceController {
    private readonly devices;
    constructor(devices: DeviceService);
    defaults(uid: string, user: AuthUser): DeviceTrackingConfig;
    live(uid: string, user: AuthUser): {
        uid: string;
        dataPlane: string;
        configPath: string;
        note: string;
    };
    patchConfig(uid: string, user: AuthUser, body: Partial<DeviceTrackingConfig> & {
        source?: 'web' | 'admin';
    }): Promise<{
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
    registerFcm(uid: string, user: AuthUser, body: {
        deviceId: string;
        fcmToken: string;
    }): Promise<{
        ok: boolean;
        uid: string;
        deviceId: string;
        rtdb: {
            written: boolean;
            path: string;
        };
    }>;
}

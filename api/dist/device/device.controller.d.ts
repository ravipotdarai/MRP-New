import { DeviceService, DeviceTrackingConfig } from './device.service';
export declare class DeviceController {
    private readonly devices;
    constructor(devices: DeviceService);
    defaults(): DeviceTrackingConfig;
    live(uid: string): {
        uid: string;
        dataPlane: string;
        configPath: string;
        note: string;
    };
    patchConfig(uid: string, body: Partial<DeviceTrackingConfig> & {
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
}

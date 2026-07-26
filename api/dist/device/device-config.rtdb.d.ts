import { DeviceTrackingConfig } from './device.service';
export declare function scrubConfig(patch: Partial<DeviceTrackingConfig> & Record<string, unknown>): Partial<DeviceTrackingConfig>;
export declare function writeDeviceConfigAdmin(uid: string, applied: DeviceTrackingConfig & {
    updatedAtMs: number;
    source: string;
}): Promise<{
    written: boolean;
    path: string;
    note: string;
}>;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceService = void 0;
const device_config_rtdb_1 = require("./device-config.rtdb");
class DeviceService {
    defaults() {
        return {
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
    }
    async patchConfig(uid, patch, source = 'web') {
        const emerg = Math.max(1, patch.emergencyIntervalMinutes ?? 1);
        const freq = Math.max(10, patch.syncFrequencyMinutes ?? 15);
        const applied = {
            ...this.defaults(),
            ...patch,
            emergencyIntervalMinutes: emerg,
            syncFrequencyMinutes: freq,
            updatedAtMs: Date.now(),
            source,
        };
        const appliedRec = applied;
        for (const k of ['lat', 'lng', 'address', 'timeline', 'selfie', 'selfies']) {
            delete appliedRec[k];
        }
        const rtdb = await (0, device_config_rtdb_1.writeDeviceConfigAdmin)(uid, applied);
        return {
            ok: true,
            uid,
            applied,
            rtdb,
            note: rtdb.written
                ? rtdb.note
                : 'Config-only response — wire credentials for Admin RTDB write, or use MRP Web client',
        };
    }
    liveStub(uid) {
        return {
            uid,
            dataPlane: 'google_drive_appdata',
            configPath: `device_config/${uid}`,
            note: 'Read sync policy from RTDB; read location/events from user Drive vault (P6 web)',
        };
    }
}
exports.DeviceService = DeviceService;
//# sourceMappingURL=device.service.js.map
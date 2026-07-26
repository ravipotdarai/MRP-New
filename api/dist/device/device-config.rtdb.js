"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrubConfig = scrubConfig;
exports.writeDeviceConfigAdmin = writeDeviceConfigAdmin;
const admin_1 = require("../firebase/admin");
const FORBIDDEN = new Set([
    'lat',
    'lng',
    'address',
    'timeline',
    'selfie',
    'selfies',
]);
function scrubConfig(patch) {
    const out = {};
    for (const [k, v] of Object.entries(patch)) {
        if (FORBIDDEN.has(k))
            continue;
        out[k] = v;
    }
    return out;
}
async function writeDeviceConfigAdmin(uid, applied) {
    const path = `device_config/${uid}`;
    if (!(0, admin_1.isAdminSdkConfigured)()) {
        return {
            written: false,
            path,
            note: 'Admin SDK not configured — use MRP Web client RTDB write, or set FIREBASE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS',
        };
    }
    const db = (0, admin_1.getAdminDb)();
    if (!db) {
        return { written: false, path, note: 'Admin DB unavailable' };
    }
    const clean = scrubConfig(applied);
    await db.ref(path).update({
        ...clean,
        updatedAtMs: applied.updatedAtMs,
        source: applied.source,
    });
    return { written: true, path, note: 'RTDB device_config updated via Admin SDK' };
}
//# sourceMappingURL=device-config.rtdb.js.map
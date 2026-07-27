"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminPushPort = void 0;
exports.lookupFcmTokensForUid = lookupFcmTokensForUid;
exports.writeFcmTokenAdmin = writeFcmTokenAdmin;
const admin = require("firebase-admin");
const admin_1 = require("../firebase/admin");
const push_port_1 = require("./push.port");
async function lookupFcmTokensForUid(uid) {
    const db = (0, admin_1.getAdminDb)();
    if (!db)
        return [];
    const snap = await db.ref(`devices/${uid}`).once('value');
    if (!snap.exists())
        return [];
    const tokens = [];
    snap.forEach((child) => {
        const token = child.child('fcmToken').val();
        if (typeof token === 'string' && token.length > 20) {
            tokens.push(token);
        }
    });
    return [...new Set(tokens)];
}
async function writeFcmTokenAdmin(uid, deviceId, fcmToken) {
    const db = (0, admin_1.getAdminDb)();
    const path = `devices/${uid}/${deviceId}`;
    if (!db) {
        return { written: false, path };
    }
    await db.ref(path).update({
        fcmToken,
        updatedAtMs: Date.now(),
        platform: 'android',
    });
    return { written: true, path };
}
class AdminPushPort {
    constructor() {
        this.stub = new push_port_1.StubPushPort();
    }
    async sendCircleInvite(input) {
        const app = (0, admin_1.getAdminApp)();
        if (!app) {
            return this.stub.sendCircleInvite(input);
        }
        let tokens = [];
        if (input.targetFcmToken) {
            tokens = [input.targetFcmToken];
        }
        else {
            tokens = await lookupFcmTokensForUid(input.targetUid);
        }
        if (tokens.length === 0) {
            return {
                ok: false,
                reason: 'no_token',
                message: 'No FCM token for target UID — ask them to open MRP signed-in, or share deep link / invite code',
            };
        }
        const data = {
            type: 'circle_invite',
            inviteCode: input.inviteCode,
            circleId: input.circleId,
            deepLink: input.deepLink,
            fromUid: input.fromUid,
            title: 'MRP Circle invite',
            body: `Code ${input.inviteCode} — tap to join`,
        };
        try {
            const messaging = admin.messaging(app);
            const results = await Promise.all(tokens.map((token) => messaging.send({
                token,
                data,
                android: {
                    priority: 'high',
                },
            })));
            return { ok: true, messageId: results[0] || 'sent' };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'FCM send failed';
            return { ok: false, reason: 'send_failed', message: msg };
        }
    }
}
exports.AdminPushPort = AdminPushPort;
//# sourceMappingURL=admin-push.port.js.map
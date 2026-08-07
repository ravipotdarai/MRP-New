"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminPushPort = void 0;
exports.lookupFcmTokensForUid = lookupFcmTokensForUid;
exports.writeFcmTokenAdmin = writeFcmTokenAdmin;
const admin = __importStar(require("firebase-admin"));
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
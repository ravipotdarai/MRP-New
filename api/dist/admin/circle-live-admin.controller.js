"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircleLiveAdminController = void 0;
const common_1 = require("@nestjs/common");
const auth_decorators_1 = require("../auth/auth.decorators");
const admin_1 = require("../firebase/admin");
const TTL_MS = 15 * 60 * 1000;
const PURGE_TIMEOUT_MS = 20_000;
function withTimeout(p, ms, label) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        p.then((v) => {
            clearTimeout(t);
            resolve(v);
        }, (e) => {
            clearTimeout(t);
            reject(e);
        });
    });
}
let CircleLiveAdminController = class CircleLiveAdminController {
    async purge() {
        if (!(0, admin_1.isAdminSdkConfigured)()) {
            throw new common_1.ServiceUnavailableException('Firebase Admin credentials required (FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS)');
        }
        const db = (0, admin_1.getAdminDb)();
        if (!db) {
            throw new common_1.ServiceUnavailableException('RTDB Admin unavailable');
        }
        try {
            const snap = await withTimeout(db.ref('circle_live').once('value'), PURGE_TIMEOUT_MS, 'circle_live read');
            const now = Date.now();
            const updates = {};
            let scanned = 0;
            snap.forEach((circleSnap) => {
                circleSnap.forEach((memberSnap) => {
                    scanned += 1;
                    const atMs = memberSnap.child('atMs').val();
                    const shareOn = memberSnap.child('shareOn').val();
                    const staleByAge = typeof atMs === 'number' && atMs > 0 && now - atMs > TTL_MS;
                    const staleShareOff = shareOn === false;
                    if (staleByAge || staleShareOff) {
                        updates[`circle_live/${circleSnap.key}/${memberSnap.key}`] = null;
                    }
                });
            });
            const deleted = Object.keys(updates).length;
            if (deleted > 0) {
                await withTimeout(db.ref().update(updates), PURGE_TIMEOUT_MS, 'circle_live update');
            }
            return { ok: true, scanned, deleted, ttlMs: TTL_MS };
        }
        catch (e) {
            throw new common_1.ServiceUnavailableException(e instanceof Error ? e.message : 'purge_failed');
        }
    }
    status() {
        return {
            ok: true,
            firebaseAdmin: (0, admin_1.isAdminSdkConfigured)(),
            ttlMs: TTL_MS,
            note: 'Scheduled CF needs Blaze. Nest purge needs Admin credentials.',
        };
    }
};
exports.CircleLiveAdminController = CircleLiveAdminController;
__decorate([
    (0, auth_decorators_1.AdminOnly)(),
    (0, common_1.Post)('purge'),
    (0, common_1.HttpCode)(200),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CircleLiveAdminController.prototype, "purge", null);
__decorate([
    (0, common_1.Post)('purge-status'),
    (0, auth_decorators_1.AdminOnly)(),
    (0, common_1.HttpCode)(200),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CircleLiveAdminController.prototype, "status", null);
exports.CircleLiveAdminController = CircleLiveAdminController = __decorate([
    (0, common_1.Controller)('admin/circle-live')
], CircleLiveAdminController);
//# sourceMappingURL=circle-live-admin.controller.js.map
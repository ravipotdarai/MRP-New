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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceController = void 0;
const common_1 = require("@nestjs/common");
const auth_decorators_1 = require("../auth/auth.decorators");
const ownership_1 = require("../auth/ownership");
const admin_push_port_1 = require("../push/admin-push.port");
const device_service_1 = require("./device.service");
let DeviceController = class DeviceController {
    constructor(devices) {
        this.devices = devices;
    }
    defaults(uid, user) {
        (0, ownership_1.assertUidAccess)(user, uid);
        return this.devices.defaults();
    }
    live(uid, user) {
        (0, ownership_1.assertUidAccess)(user, uid);
        return this.devices.liveStub(uid);
    }
    async patchConfig(uid, user, body) {
        (0, ownership_1.assertUidAccess)(user, uid);
        const { source, ...patch } = body;
        if (source === 'admin' && !user.isAdmin) {
            throw new common_1.ForbiddenException('source=admin requires allowlisted admin');
        }
        return this.devices.patchConfig(uid, patch, source === 'admin' ? 'admin' : 'web');
    }
    async registerFcm(uid, user, body) {
        (0, ownership_1.assertUidAccess)(user, uid);
        if (!body?.deviceId?.trim() || !body?.fcmToken?.trim()) {
            throw new common_1.BadRequestException('deviceId and fcmToken required');
        }
        const rtdb = await (0, admin_push_port_1.writeFcmTokenAdmin)(uid, body.deviceId.trim(), body.fcmToken.trim());
        return {
            ok: true,
            uid,
            deviceId: body.deviceId.trim(),
            rtdb,
        };
    }
};
exports.DeviceController = DeviceController;
__decorate([
    (0, common_1.Get)(':uid/config/defaults'),
    __param(0, (0, common_1.Param)('uid')),
    __param(1, (0, auth_decorators_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DeviceController.prototype, "defaults", null);
__decorate([
    (0, common_1.Get)(':uid/live'),
    __param(0, (0, common_1.Param)('uid')),
    __param(1, (0, auth_decorators_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DeviceController.prototype, "live", null);
__decorate([
    (0, common_1.Patch)(':uid/config'),
    __param(0, (0, common_1.Param)('uid')),
    __param(1, (0, auth_decorators_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], DeviceController.prototype, "patchConfig", null);
__decorate([
    (0, common_1.Put)(':uid/fcm'),
    __param(0, (0, common_1.Param)('uid')),
    __param(1, (0, auth_decorators_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], DeviceController.prototype, "registerFcm", null);
exports.DeviceController = DeviceController = __decorate([
    (0, common_1.Controller)('devices'),
    __metadata("design:paramtypes", [device_service_1.DeviceService])
], DeviceController);
//# sourceMappingURL=device.controller.js.map
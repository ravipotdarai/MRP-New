"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("./auth/auth.module");
const health_controller_1 = require("./health.controller");
const circle_module_1 = require("./circle/circle.module");
const device_module_1 = require("./device/device.module");
const circle_live_admin_controller_1 = require("./admin/circle-live-admin.controller");
const geocoding_module_1 = require("./geocoding/geocoding.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule, circle_module_1.CircleModule, device_module_1.DeviceModule, geocoding_module_1.GeocodingModule],
        controllers: [health_controller_1.HealthController, circle_live_admin_controller_1.CircleLiveAdminController],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
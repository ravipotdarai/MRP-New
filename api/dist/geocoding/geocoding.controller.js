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
exports.GeocodingController = void 0;
const common_1 = require("@nestjs/common");
const auth_decorators_1 = require("../auth/auth.decorators");
const geocoding_service_1 = require("./geocoding.service");
let GeocodingController = class GeocodingController {
    constructor(geo) {
        this.geo = geo;
    }
    reverse(user, body) {
        const lat = Number(body?.lat);
        const lng = Number(body?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            throw new common_1.BadRequestException('lat and lng required');
        }
        return this.geo.reverse(user.uid, lat, lng);
    }
    nearby(user, body) {
        const lat = Number(body?.lat);
        const lng = Number(body?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            throw new common_1.BadRequestException('lat and lng required');
        }
        return this.geo.nearby(user.uid, lat, lng, body?.radiusM, body?.categories);
    }
};
exports.GeocodingController = GeocodingController;
__decorate([
    (0, common_1.Post)('reverse'),
    __param(0, (0, auth_decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], GeocodingController.prototype, "reverse", null);
__decorate([
    (0, common_1.Post)('nearby'),
    __param(0, (0, auth_decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], GeocodingController.prototype, "nearby", null);
exports.GeocodingController = GeocodingController = __decorate([
    (0, common_1.Controller)('geocoding'),
    __metadata("design:paramtypes", [geocoding_service_1.GeocodingService])
], GeocodingController);
//# sourceMappingURL=geocoding.controller.js.map
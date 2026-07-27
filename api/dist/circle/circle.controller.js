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
exports.CircleController = void 0;
const common_1 = require("@nestjs/common");
const auth_decorators_1 = require("../auth/auth.decorators");
const ownership_1 = require("../auth/ownership");
const circle_service_1 = require("./circle.service");
let CircleController = class CircleController {
    constructor(circles) {
        this.circles = circles;
    }
    list(user) {
        return this.circles.listForUid(user.uid, user.isAdmin);
    }
    create(user, body) {
        const ownerUid = (0, ownership_1.assertActorUid)(user, body.ownerUid ?? user.uid, 'ownerUid');
        return this.circles.create({
            name: body.name,
            category: body.category,
            ownerUid,
        });
    }
    join(id, user, body) {
        const uid = (0, ownership_1.assertActorUid)(user, body.uid ?? user.uid);
        return this.circles.join(id, {
            inviteCode: body.inviteCode,
            uid,
            displayName: body.displayName,
        });
    }
    consent(id, user, body) {
        const uid = (0, ownership_1.assertActorUid)(user, body.uid ?? user.uid);
        return this.circles.setConsent(id, { uid, consentLive: body.consentLive });
    }
    invitePush(id, user, body) {
        return this.circles.invitePush(id, user.uid, body);
    }
};
exports.CircleController = CircleController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, auth_decorators_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CircleController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, auth_decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CircleController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/join'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, auth_decorators_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], CircleController.prototype, "join", null);
__decorate([
    (0, common_1.Post)(':id/consent'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, auth_decorators_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], CircleController.prototype, "consent", null);
__decorate([
    (0, common_1.Post)(':id/invite/push'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, auth_decorators_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], CircleController.prototype, "invitePush", null);
exports.CircleController = CircleController = __decorate([
    (0, common_1.Controller)('circles'),
    __metadata("design:paramtypes", [circle_service_1.CircleService])
], CircleController);
//# sourceMappingURL=circle.controller.js.map
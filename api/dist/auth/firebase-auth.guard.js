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
exports.FirebaseAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const admin = require("firebase-admin");
const admin_1 = require("../firebase/admin");
const auth_decorators_1 = require("./auth.decorators");
const admin_emails_1 = require("./admin-emails");
const auth_types_1 = require("./auth.types");
function headerValue(headers, name) {
    const v = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(v))
        return v[0];
    return v;
}
let FirebaseAuthGuard = class FirebaseAuthGuard {
    constructor(reflector) {
        this.reflector = reflector;
    }
    async canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(auth_decorators_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic)
            return true;
        const req = context.switchToHttp().getRequest();
        const user = await this.resolveUser(req);
        req[auth_types_1.AUTH_USER_KEY] = user;
        const adminOnly = this.reflector.getAllAndOverride(auth_decorators_1.IS_ADMIN_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (adminOnly && !user.isAdmin) {
            throw new common_1.UnauthorizedException('Admin allowlist required');
        }
        return true;
    }
    async resolveUser(req) {
        const bypass = process.env.MRP_AUTH_BYPASS === '1' &&
            process.env.NODE_ENV !== 'production';
        if (bypass) {
            const devUid = headerValue(req.headers, 'x-mrp-dev-uid')?.trim();
            if (devUid) {
                const email = headerValue(req.headers, 'x-mrp-dev-email')?.trim().toLowerCase() ||
                    null;
                return {
                    uid: devUid,
                    email,
                    isAdmin: (0, admin_emails_1.isAllowlistedAdmin)(email),
                };
            }
        }
        const authHeader = headerValue(req.headers, 'authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw new common_1.UnauthorizedException('Missing Bearer token');
        }
        const token = authHeader.slice('Bearer '.length).trim();
        if (!token) {
            throw new common_1.UnauthorizedException('Empty Bearer token');
        }
        const app = (0, admin_1.getAdminApp)();
        if (!app) {
            throw new common_1.ServiceUnavailableException('Firebase Admin not configured — cannot verify JWT');
        }
        try {
            const decoded = await admin.auth(app).verifyIdToken(token);
            const email = decoded.email?.toLowerCase() ?? null;
            return {
                uid: decoded.uid,
                email,
                isAdmin: (0, admin_emails_1.isAllowlistedAdmin)(email),
            };
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid or expired Firebase ID token');
        }
    }
};
exports.FirebaseAuthGuard = FirebaseAuthGuard;
exports.FirebaseAuthGuard = FirebaseAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], FirebaseAuthGuard);
//# sourceMappingURL=firebase-auth.guard.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentUser = exports.AdminOnly = exports.IS_ADMIN_KEY = exports.Public = exports.IS_PUBLIC_KEY = void 0;
const common_1 = require("@nestjs/common");
const auth_types_1 = require("./auth.types");
exports.IS_PUBLIC_KEY = 'isPublic';
const Public = () => (0, common_1.SetMetadata)(exports.IS_PUBLIC_KEY, true);
exports.Public = Public;
exports.IS_ADMIN_KEY = 'isAdmin';
const AdminOnly = () => (0, common_1.SetMetadata)(exports.IS_ADMIN_KEY, true);
exports.AdminOnly = AdminOnly;
exports.CurrentUser = (0, common_1.createParamDecorator)((_data, ctx) => {
    const req = ctx.switchToHttp().getRequest();
    const user = req[auth_types_1.AUTH_USER_KEY];
    if (!user) {
        throw new common_1.UnauthorizedException('Not authenticated');
    }
    return user;
});
//# sourceMappingURL=auth.decorators.js.map
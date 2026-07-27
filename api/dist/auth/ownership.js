"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertUidAccess = assertUidAccess;
exports.assertActorUid = assertActorUid;
const common_1 = require("@nestjs/common");
function assertUidAccess(user, resourceUid) {
    if (user.isAdmin)
        return;
    if (user.uid === resourceUid)
        return;
    throw new common_1.ForbiddenException('UID mismatch — not owner or admin');
}
function assertActorUid(user, actorUid, field = 'uid') {
    if (!actorUid) {
        throw new common_1.ForbiddenException(`${field} required`);
    }
    if (user.isAdmin || user.uid === actorUid)
        return actorUid;
    throw new common_1.ForbiddenException(`${field} must match authenticated user`);
}
//# sourceMappingURL=ownership.js.map
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircleService = void 0;
const common_1 = require("@nestjs/common");
const admin_push_port_1 = require("../push/admin-push.port");
const push_port_1 = require("../push/push.port");
const CAPS = {
    one_to_one: 2,
    friend: 2,
    friends_group: 10,
    family: 8,
    peer: 6,
};
let CircleService = class CircleService {
    constructor() {
        this.circles = new Map();
        this.push = new admin_push_port_1.AdminPushPort();
    }
    list() {
        return [...this.circles.values()];
    }
    listForUid(uid, isAdmin) {
        const all = this.list();
        if (isAdmin)
            return all;
        return all.filter((c) => c.members.some((m) => m.uid === uid));
    }
    create(input) {
        const id = `c_${Date.now().toString(36)}`;
        const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        const circle = {
            id,
            name: input.name,
            category: input.category,
            inviteCode,
            maxMembers: CAPS[input.category] ?? 8,
            members: [
                {
                    uid: input.ownerUid,
                    displayName: 'Owner',
                    consentLive: false,
                    role: 'owner',
                },
            ],
            createdAtMs: Date.now(),
        };
        this.circles.set(id, circle);
        return circle;
    }
    join(id, body) {
        const circle = this.circles.get(id);
        if (!circle)
            return { ok: false, reason: 'not_found' };
        if (circle.inviteCode !== body.inviteCode.toUpperCase()) {
            return { ok: false, reason: 'bad_invite' };
        }
        if (circle.members.length >= circle.maxMembers) {
            return { ok: false, reason: 'full' };
        }
        if (circle.members.some((m) => m.uid === body.uid)) {
            return { ok: false, reason: 'already_member' };
        }
        circle.members.push({
            uid: body.uid,
            displayName: body.displayName || 'Member',
            consentLive: false,
            role: 'member',
        });
        return { ok: true, circle };
    }
    setConsent(id, body) {
        const circle = this.circles.get(id);
        if (!circle)
            return { ok: false, reason: 'not_found' };
        const m = circle.members.find((x) => x.uid === body.uid);
        if (!m)
            return { ok: false, reason: 'not_member' };
        m.consentLive = body.consentLive;
        const liveReady = circle.members.length >= 2 && circle.members.every((x) => x.consentLive);
        return { ok: true, liveReady, circle };
    }
    async invitePush(id, requesterUid, body) {
        const circle = this.circles.get(id);
        if (!circle)
            return { ok: false, reason: 'not_found' };
        if (!circle.members.some((m) => m.uid === requesterUid)) {
            return { ok: false, reason: 'not_member' };
        }
        const httpsLink = (0, push_port_1.defaultCircleInviteDeepLink)(circle.inviteCode);
        const appLink = (0, push_port_1.circleInviteAppSchemeLink)(circle.inviteCode);
        if (!body.targetUid) {
            return {
                ok: false,
                reason: 'need_target',
                circleId: id,
                inviteCode: circle.inviteCode,
                deepLink: httpsLink,
                appLink,
                message: 'Pass targetUid (Firebase UID of invitee) to send FCM, or share deepLink / invite code.',
            };
        }
        const result = await this.push.sendCircleInvite({
            circleId: id,
            inviteCode: circle.inviteCode,
            fromUid: requesterUid,
            targetUid: body.targetUid,
            targetFcmToken: body.targetFcmToken,
            deepLink: httpsLink,
        });
        return {
            ...result,
            circleId: id,
            inviteCode: circle.inviteCode,
            deepLink: httpsLink,
            appLink,
        };
    }
};
exports.CircleService = CircleService;
exports.CircleService = CircleService = __decorate([
    (0, common_1.Injectable)()
], CircleService);
//# sourceMappingURL=circle.service.js.map
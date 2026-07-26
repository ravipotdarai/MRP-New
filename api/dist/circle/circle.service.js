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
    }
    list() {
        return [...this.circles.values()];
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
    invitePushStub(id, _targetUid) {
        return {
            ok: false,
            reason: 'fcm_pending',
            message: `FCM invite for circle ${id} ships when PushPort is wired (P6). Use invite code for now.`,
        };
    }
};
exports.CircleService = CircleService;
exports.CircleService = CircleService = __decorate([
    (0, common_1.Injectable)()
], CircleService);
//# sourceMappingURL=circle.service.js.map
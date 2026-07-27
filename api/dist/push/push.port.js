"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StubPushPort = void 0;
exports.defaultCircleInviteDeepLink = defaultCircleInviteDeepLink;
exports.circleInviteAppSchemeLink = circleInviteAppSchemeLink;
class StubPushPort {
    async sendCircleInvite(input) {
        if (!input.targetFcmToken) {
            return {
                ok: false,
                reason: 'no_token',
                message: 'No FCM token for target — share invite code / deep link instead',
            };
        }
        return {
            ok: false,
            reason: 'fcm_pending',
            message: `Admin messaging not configured (circle ${input.circleId})`,
        };
    }
}
exports.StubPushPort = StubPushPort;
function defaultCircleInviteDeepLink(inviteCode) {
    const code = encodeURIComponent(inviteCode.trim().toUpperCase());
    return `https://mobileresilienceplatform.web.app/circle/join?code=${code}`;
}
function circleInviteAppSchemeLink(inviteCode) {
    const code = encodeURIComponent(inviteCode.trim().toUpperCase());
    return `mrp://circle/join?code=${code}`;
}
//# sourceMappingURL=push.port.js.map
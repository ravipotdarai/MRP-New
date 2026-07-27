export type CircleInvitePushInput = {
    circleId: string;
    inviteCode: string;
    fromUid: string;
    targetUid: string;
    targetFcmToken?: string;
    deepLink: string;
};
export type CircleInvitePushResult = {
    ok: true;
    messageId: string;
} | {
    ok: false;
    reason: 'fcm_pending' | 'no_token' | 'send_failed';
    message: string;
};
export interface PushPort {
    sendCircleInvite(input: CircleInvitePushInput): Promise<CircleInvitePushResult>;
}
export declare class StubPushPort implements PushPort {
    sendCircleInvite(input: CircleInvitePushInput): Promise<CircleInvitePushResult>;
}
export declare function defaultCircleInviteDeepLink(inviteCode: string): string;
export declare function circleInviteAppSchemeLink(inviteCode: string): string;

import { CircleInvitePushInput, CircleInvitePushResult, PushPort } from './push.port';
export declare function lookupFcmTokensForUid(uid: string): Promise<string[]>;
export declare function writeFcmTokenAdmin(uid: string, deviceId: string, fcmToken: string): Promise<{
    written: boolean;
    path: string;
}>;
export declare class AdminPushPort implements PushPort {
    private readonly stub;
    sendCircleInvite(input: CircleInvitePushInput): Promise<CircleInvitePushResult>;
}

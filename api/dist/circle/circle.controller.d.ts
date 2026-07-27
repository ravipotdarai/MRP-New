import { AuthUser } from '../auth/auth.types';
import { CircleService } from './circle.service';
export declare class CircleController {
    private readonly circles;
    constructor(circles: CircleService);
    list(user: AuthUser): {
        id: string;
        name: string;
        category: string;
        inviteCode: string;
        maxMembers: number;
        members: {
            uid: string;
            displayName: string;
            consentLive: boolean;
            role: "owner" | "member";
        }[];
        createdAtMs: number;
    }[];
    create(user: AuthUser, body: {
        name: string;
        category: string;
        ownerUid?: string;
    }): {
        id: string;
        name: string;
        category: string;
        inviteCode: string;
        maxMembers: number;
        members: {
            uid: string;
            displayName: string;
            consentLive: boolean;
            role: "owner" | "member";
        }[];
        createdAtMs: number;
    };
    join(id: string, user: AuthUser, body: {
        inviteCode: string;
        uid?: string;
        displayName: string;
    }): {
        ok: boolean;
        reason: string;
        circle?: undefined;
    } | {
        ok: boolean;
        circle: {
            id: string;
            name: string;
            category: string;
            inviteCode: string;
            maxMembers: number;
            members: {
                uid: string;
                displayName: string;
                consentLive: boolean;
                role: "owner" | "member";
            }[];
            createdAtMs: number;
        };
        reason?: undefined;
    };
    consent(id: string, user: AuthUser, body: {
        uid?: string;
        consentLive: boolean;
    }): {
        ok: boolean;
        reason: string;
        liveReady?: undefined;
        circle?: undefined;
    } | {
        ok: boolean;
        liveReady: boolean;
        circle: {
            id: string;
            name: string;
            category: string;
            inviteCode: string;
            maxMembers: number;
            members: {
                uid: string;
                displayName: string;
                consentLive: boolean;
                role: "owner" | "member";
            }[];
            createdAtMs: number;
        };
        reason?: undefined;
    };
    invitePush(id: string, user: AuthUser, body: {
        targetUid?: string;
        targetFcmToken?: string;
    }): Promise<{
        ok: boolean;
        reason: string;
        circleId?: undefined;
        inviteCode?: undefined;
        deepLink?: undefined;
        appLink?: undefined;
        message?: undefined;
    } | {
        ok: boolean;
        reason: string;
        circleId: string;
        inviteCode: string;
        deepLink: string;
        appLink: string;
        message: string;
    } | {
        circleId: string;
        inviteCode: string;
        deepLink: string;
        appLink: string;
        ok: true;
        messageId: string;
        reason?: undefined;
        message?: undefined;
    }>;
}

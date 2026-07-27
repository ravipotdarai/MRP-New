type Member = {
    uid: string;
    displayName: string;
    consentLive: boolean;
    role: 'owner' | 'member';
};
type Circle = {
    id: string;
    name: string;
    category: string;
    inviteCode: string;
    maxMembers: number;
    members: Member[];
    createdAtMs: number;
};
export declare class CircleService {
    private circles;
    private readonly push;
    list(): Circle[];
    listForUid(uid: string, isAdmin: boolean): Circle[];
    create(input: {
        name: string;
        category: string;
        ownerUid: string;
    }): Circle;
    join(id: string, body: {
        inviteCode: string;
        uid: string;
        displayName: string;
    }): {
        ok: boolean;
        reason: string;
        circle?: undefined;
    } | {
        ok: boolean;
        circle: Circle;
        reason?: undefined;
    };
    setConsent(id: string, body: {
        uid: string;
        consentLive: boolean;
    }): {
        ok: boolean;
        reason: string;
        liveReady?: undefined;
        circle?: undefined;
    } | {
        ok: boolean;
        liveReady: boolean;
        circle: Circle;
        reason?: undefined;
    };
    invitePush(id: string, requesterUid: string, body: {
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
export {};

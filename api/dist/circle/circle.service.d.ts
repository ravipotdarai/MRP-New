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
    list(): Circle[];
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
    invitePushStub(id: string, _targetUid?: string): {
        ok: boolean;
        reason: string;
        message: string;
    };
}
export {};

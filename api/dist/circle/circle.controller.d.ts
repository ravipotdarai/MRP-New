import { CircleService } from './circle.service';
export declare class CircleController {
    private readonly circles;
    constructor(circles: CircleService);
    list(): {
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
    create(body: {
        name: string;
        category: string;
        ownerUid: string;
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
    consent(id: string, body: {
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
    invitePush(id: string, body: {
        targetUid?: string;
    }): {
        ok: boolean;
        reason: string;
        message: string;
    };
}

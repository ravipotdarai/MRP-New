export declare class CircleLiveAdminController {
    purge(): Promise<{
        ok: boolean;
        scanned: number;
        deleted: number;
        ttlMs: number;
    }>;
    status(): {
        ok: boolean;
        firebaseAdmin: boolean;
        ttlMs: number;
        note: string;
    };
}

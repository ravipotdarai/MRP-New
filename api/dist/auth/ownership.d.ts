import { AuthUser } from './auth.types';
export declare function assertUidAccess(user: AuthUser, resourceUid: string): void;
export declare function assertActorUid(user: AuthUser, actorUid: string | undefined, field?: string): string;

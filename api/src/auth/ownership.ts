import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from './auth.types';

/** Own resource or allowlisted admin. */
export function assertUidAccess(user: AuthUser, resourceUid: string): void {
  if (user.isAdmin) return;
  if (user.uid === resourceUid) return;
  throw new ForbiddenException('UID mismatch — not owner or admin');
}

/** Body/param uid must match token (admins may impersonate for support). */
export function assertActorUid(
  user: AuthUser,
  actorUid: string | undefined,
  field = 'uid',
): string {
  if (!actorUid) {
    throw new ForbiddenException(`${field} required`);
  }
  if (user.isAdmin || user.uid === actorUid) return actorUid;
  throw new ForbiddenException(`${field} must match authenticated user`);
}

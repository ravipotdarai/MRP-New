import { Injectable } from '@nestjs/common';
import { AdminPushPort } from '../push/admin-push.port';
import {
  circleInviteAppSchemeLink,
  defaultCircleInviteDeepLink,
  type PushPort,
} from '../push/push.port';

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

const CAPS: Record<string, number> = {
  one_to_one: 2,
  friend: 2,
  friends_group: 10,
  family: 8,
  peer: 6,
};

/** In-memory until Firestore in P6. */
@Injectable()
export class CircleService {
  private circles = new Map<string, Circle>();
  private readonly push: PushPort = new AdminPushPort();

  list() {
    return [...this.circles.values()];
  }

  /** Non-admins only see circles they belong to. */
  listForUid(uid: string, isAdmin: boolean) {
    const all = this.list();
    if (isAdmin) return all;
    return all.filter((c) => c.members.some((m) => m.uid === uid));
  }

  create(input: { name: string; category: string; ownerUid: string }) {
    const id = `c_${Date.now().toString(36)}`;
    const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    const circle: Circle = {
      id,
      name: input.name,
      category: input.category,
      inviteCode,
      maxMembers: CAPS[input.category] ?? 8,
      members: [
        {
          uid: input.ownerUid,
          displayName: 'Owner',
          consentLive: false,
          role: 'owner',
        },
      ],
      createdAtMs: Date.now(),
    };
    this.circles.set(id, circle);
    return circle;
  }

  join(
    id: string,
    body: { inviteCode: string; uid: string; displayName: string },
  ) {
    const circle = this.circles.get(id);
    if (!circle) return { ok: false, reason: 'not_found' };
    if (circle.inviteCode !== body.inviteCode.toUpperCase()) {
      return { ok: false, reason: 'bad_invite' };
    }
    if (circle.members.length >= circle.maxMembers) {
      return { ok: false, reason: 'full' };
    }
    if (circle.members.some((m) => m.uid === body.uid)) {
      return { ok: false, reason: 'already_member' };
    }
    circle.members.push({
      uid: body.uid,
      displayName: body.displayName || 'Member',
      consentLive: false,
      role: 'member',
    });
    return { ok: true, circle };
  }

  setConsent(id: string, body: { uid: string; consentLive: boolean }) {
    const circle = this.circles.get(id);
    if (!circle) return { ok: false, reason: 'not_found' };
    const m = circle.members.find((x) => x.uid === body.uid);
    if (!m) return { ok: false, reason: 'not_member' };
    m.consentLive = body.consentLive;
    const liveReady =
      circle.members.length >= 2 && circle.members.every((x) => x.consentLive);
    return { ok: true, liveReady, circle };
  }

  async invitePush(
    id: string,
    requesterUid: string,
    body: { targetUid?: string; targetFcmToken?: string },
  ) {
    const circle = this.circles.get(id);
    if (!circle) return { ok: false, reason: 'not_found' };
    if (!circle.members.some((m) => m.uid === requesterUid)) {
      return { ok: false, reason: 'not_member' };
    }

    const httpsLink = defaultCircleInviteDeepLink(circle.inviteCode);
    const appLink = circleInviteAppSchemeLink(circle.inviteCode);

    if (!body.targetUid) {
      return {
        ok: false,
        reason: 'need_target',
        circleId: id,
        inviteCode: circle.inviteCode,
        deepLink: httpsLink,
        appLink,
        message:
          'Pass targetUid (Firebase UID of invitee) to send FCM, or share deepLink / invite code.',
      };
    }

    const result = await this.push.sendCircleInvite({
      circleId: id,
      inviteCode: circle.inviteCode,
      fromUid: requesterUid,
      targetUid: body.targetUid,
      targetFcmToken: body.targetFcmToken,
      deepLink: httpsLink,
    });

    return {
      ...result,
      circleId: id,
      inviteCode: circle.inviteCode,
      deepLink: httpsLink,
      appLink,
    };
  }
}

import * as admin from 'firebase-admin';
import { getAdminApp, getAdminDb } from '../firebase/admin';
import {
  CircleInvitePushInput,
  CircleInvitePushResult,
  PushPort,
  StubPushPort,
} from './push.port';

/** Read latest fcmToken under devices/{uid}/{deviceId}. */
export async function lookupFcmTokensForUid(uid: string): Promise<string[]> {
  const db = getAdminDb();
  if (!db) return [];
  const snap = await db.ref(`devices/${uid}`).once('value');
  if (!snap.exists()) return [];
  const tokens: string[] = [];
  snap.forEach((child) => {
    const token = child.child('fcmToken').val();
    if (typeof token === 'string' && token.length > 20) {
      tokens.push(token);
    }
  });
  return [...new Set(tokens)];
}

export async function writeFcmTokenAdmin(
  uid: string,
  deviceId: string,
  fcmToken: string,
): Promise<{ written: boolean; path: string }> {
  const db = getAdminDb();
  const path = `devices/${uid}/${deviceId}`;
  if (!db) {
    return { written: false, path };
  }
  await db.ref(path).update({
    fcmToken,
    updatedAtMs: Date.now(),
    platform: 'android',
  });
  return { written: true, path };
}

/**
 * Sends Circle invite via Firebase Cloud Messaging (Admin SDK).
 * Falls back to StubPushPort behavior when Admin is unavailable.
 */
export class AdminPushPort implements PushPort {
  private readonly stub = new StubPushPort();

  async sendCircleInvite(
    input: CircleInvitePushInput,
  ): Promise<CircleInvitePushResult> {
    const app = getAdminApp();
    if (!app) {
      return this.stub.sendCircleInvite(input);
    }

    let tokens: string[] = [];
    if (input.targetFcmToken) {
      tokens = [input.targetFcmToken];
    } else {
      tokens = await lookupFcmTokensForUid(input.targetUid);
    }

    if (tokens.length === 0) {
      return {
        ok: false,
        reason: 'no_token',
        message:
          'No FCM token for target UID — ask them to open MRP signed-in, or share deep link / invite code',
      };
    }

    const data = {
      type: 'circle_invite',
      inviteCode: input.inviteCode,
      circleId: input.circleId,
      deepLink: input.deepLink,
      fromUid: input.fromUid,
      title: 'MRP Circle invite',
      body: `Code ${input.inviteCode} — tap to join`,
    };

    try {
      const messaging = admin.messaging(app);
      const results = await Promise.all(
        tokens.map((token) =>
          messaging.send({
            token,
            // Data-only so MrpFirebaseMessagingService always handles display + deep link
            data,
            android: {
              priority: 'high',
            },
          }),
        ),
      );
      return { ok: true, messageId: results[0] || 'sent' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'FCM send failed';
      return { ok: false, reason: 'send_failed', message: msg };
    }
  }
}

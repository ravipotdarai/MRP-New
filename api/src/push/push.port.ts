/**
 * P8-4 — FCM invite push port + deep links.
 */
export type CircleInvitePushInput = {
  circleId: string;
  inviteCode: string;
  fromUid: string;
  targetUid: string;
  /** FCM registration token for target device (when known). */
  targetFcmToken?: string;
  deepLink: string;
};

export type CircleInvitePushResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      reason: 'fcm_pending' | 'no_token' | 'send_failed';
      message: string;
    };

export interface PushPort {
  sendCircleInvite(input: CircleInvitePushInput): Promise<CircleInvitePushResult>;
}

/** Used when Admin SDK is missing or as fallback. */
export class StubPushPort implements PushPort {
  async sendCircleInvite(
    input: CircleInvitePushInput,
  ): Promise<CircleInvitePushResult> {
    if (!input.targetFcmToken) {
      return {
        ok: false,
        reason: 'no_token',
        message: 'No FCM token for target — share invite code / deep link instead',
      };
    }
    return {
      ok: false,
      reason: 'fcm_pending',
      message: `Admin messaging not configured (circle ${input.circleId})`,
    };
  }
}

export function defaultCircleInviteDeepLink(inviteCode: string): string {
  const code = encodeURIComponent(inviteCode.trim().toUpperCase());
  return `https://mobileresilienceplatform.web.app/circle/join?code=${code}`;
}

export function circleInviteAppSchemeLink(inviteCode: string): string {
  const code = encodeURIComponent(inviteCode.trim().toUpperCase());
  return `mrp://circle/join?code=${code}`;
}

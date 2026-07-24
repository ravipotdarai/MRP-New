import {NativeModules, NativeEventEmitter, EmitterSubscription} from 'react-native';

export type LivePointNative = {
  uid: string;
  lat: number;
  lng: number;
  atMs: number;
  shareOn: boolean;
  displayName: string;
  colorIndex: number;
};

export type RemoteCircle = {
  id: string;
  name: string;
  category: string;
  inviteCode: string;
  maxMembers: number;
  memberCount: number;
  liveReady: boolean;
  groupKey: string;
  myUid: string;
  members: Array<{
    id: string;
    displayName: string;
    role: string;
    consentLive: boolean;
    joinedAtMs: number;
  }>;
};

type CircleLiveNative = {
  getFirebaseUid(): Promise<string | null>;
  publishCircleDirectory(
    circleId: string,
    name: string,
    category: string,
    inviteCode: string,
    maxMembers: number,
    groupKey: string,
    displayName: string,
  ): Promise<{ok: boolean; groupKey: string; circleId: string}>;
  joinCircleByInvite(inviteCode: string, displayName: string): Promise<RemoteCircle>;
  setRemoteConsent(circleId: string, consentLive: boolean): Promise<boolean>;
  fetchRemoteCircle(circleId: string): Promise<RemoteCircle>;
  publishLivePoint(
    circleId: string,
    lat: number,
    lng: number,
    displayName: string,
    colorIndex: number,
    shareOn: boolean,
    groupKey: string,
    inviteCode: string,
  ): Promise<boolean>;
  stopSharing(circleId: string): Promise<boolean>;
  startListening(
    circleId: string,
    groupKey: string,
    inviteCode: string,
    ttlMs: number,
  ): Promise<boolean>;
  stopListening(): Promise<boolean>;
};

const native = NativeModules.CircleLive as CircleLiveNative | undefined;
const emitter = native ? new NativeEventEmitter(NativeModules.CircleLive) : null;

export const LIVE_TTL_MS = 15 * 60 * 1000;

export async function getFirebaseUid(): Promise<string | null> {
  if (!native?.getFirebaseUid) return null;
  return native.getFirebaseUid();
}

export async function publishCircleDirectory(args: {
  circleId: string;
  name: string;
  category: string;
  inviteCode: string;
  maxMembers: number;
  groupKey?: string;
  displayName?: string;
}): Promise<{ok: boolean; groupKey: string; circleId: string}> {
  if (!native?.publishCircleDirectory) {
    throw new Error('CircleLive native module missing — reinstall');
  }
  return native.publishCircleDirectory(
    args.circleId,
    args.name,
    args.category,
    args.inviteCode,
    args.maxMembers,
    args.groupKey || '',
    args.displayName || 'You',
  );
}

export async function joinCircleByInvite(
  inviteCode: string,
  displayName: string,
): Promise<RemoteCircle> {
  if (!native?.joinCircleByInvite) {
    throw new Error('CircleLive native module missing — reinstall');
  }
  return native.joinCircleByInvite(inviteCode, displayName);
}

export async function setRemoteConsent(circleId: string, consentLive: boolean): Promise<boolean> {
  if (!native?.setRemoteConsent) return false;
  return native.setRemoteConsent(circleId, consentLive);
}

export async function fetchRemoteCircle(circleId: string): Promise<RemoteCircle | null> {
  if (!native?.fetchRemoteCircle) return null;
  try {
    return await native.fetchRemoteCircle(circleId);
  } catch {
    return null;
  }
}

export async function publishLivePoint(args: {
  circleId: string;
  lat: number;
  lng: number;
  displayName: string;
  colorIndex: number;
  shareOn: boolean;
  groupKey?: string;
  inviteCode?: string;
}): Promise<boolean> {
  if (!native?.publishLivePoint) {
    throw new Error('CircleLive native module missing — reinstall the app');
  }
  return native.publishLivePoint(
    args.circleId,
    args.lat,
    args.lng,
    args.displayName,
    args.colorIndex,
    args.shareOn,
    args.groupKey || '',
    args.inviteCode || '',
  );
}

export async function stopSharing(circleId: string): Promise<boolean> {
  if (!native?.stopSharing) return false;
  return native.stopSharing(circleId);
}

export function subscribeLivePoints(
  circleId: string,
  onPoints: (points: LivePointNative[]) => void,
  opts?: {groupKey?: string; inviteCode?: string; ttlMs?: number},
): {unsubscribe: () => void} {
  let sub: EmitterSubscription | null = null;
  (async () => {
    if (!native?.startListening || !emitter) return;
    await native.startListening(
      circleId,
      opts?.groupKey || '',
      opts?.inviteCode || '',
      opts?.ttlMs ?? LIVE_TTL_MS,
    );
    sub = emitter.addListener('CircleLivePoints', (arr: LivePointNative[]) => {
      onPoints(Array.isArray(arr) ? arr : []);
    });
  })();
  return {
    unsubscribe: () => {
      sub?.remove();
      native?.stopListening?.();
    },
  };
}

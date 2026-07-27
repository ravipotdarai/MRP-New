import type {CircleMember, LocalCircle} from './circleTypes';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeInviteCode(now = Date.now()): string {
  let code = '';
  let n = Math.abs(now ^ Math.floor(Math.random() * 0xffffff)) || 1;
  for (let i = 0; i < 6; i++) {
    const idx = n % INVITE_ALPHABET.length;
    code += INVITE_ALPHABET[idx];
    n = Math.abs(Math.floor(n / INVITE_ALPHABET.length) ^ (i + 1) * 997) || i + 1;
  }
  return code;
}

export function makeMemberId(prefix: string, now = Date.now()): string {
  return `${prefix}_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function computeLiveReady(members: CircleMember[]): boolean {
  if (members.length < 2) return false;
  return members.every(m => m.consentLive);
}

export function withLiveReady(circle: LocalCircle): LocalCircle {
  const members = circle.members ?? [];
  return {
    ...circle,
    members,
    memberCount: members.length,
    liveReady: computeLiveReady(members),
  };
}

/** Migrate circles created before invite/consent fields existed. */
export function normalizeCircle(raw: Partial<LocalCircle> & {id: string; name: string}): LocalCircle {
  const now = Date.now();
  let members = Array.isArray(raw.members) ? [...raw.members] : [];
  if (members.length === 0) {
    members = [
      {
        id: makeMemberId('owner', raw.createdAtMs ?? now),
        displayName: 'You',
        role: 'owner',
        consentLive: false,
        joinedAtMs: raw.createdAtMs ?? now,
      },
    ];
  }
  const inviteCode =
    typeof raw.inviteCode === 'string' && raw.inviteCode.length >= 4
      ? raw.inviteCode.toUpperCase()
      : makeInviteCode(raw.createdAtMs ?? now);

  return withLiveReady({
    id: raw.id,
    name: raw.name,
    category: (raw.category as LocalCircle['category']) || 'family',
    maxMembers: typeof raw.maxMembers === 'number' ? raw.maxMembers : 8,
    memberCount: members.length,
    createdAtMs: raw.createdAtMs ?? now,
    inviteCode,
    members,
    liveReady: false,
    shareEnabled: !!raw.shareEnabled,
    intervalSec: ([20, 60, 600] as const).includes(raw.intervalSec as 20)
      ? (raw.intervalSec as 20 | 60 | 600)
      : 60,
    groupKey: typeof raw.groupKey === 'string' ? raw.groupKey : undefined,
  });
}

export function setMemberConsent(
  circle: LocalCircle,
  memberId: string,
  consentLive: boolean,
): LocalCircle {
  const members = circle.members.map(m =>
    m.id === memberId ? {...m, consentLive} : m,
  );
  return withLiveReady({...circle, members});
}

export function revokeAllConsent(circle: LocalCircle): LocalCircle {
  const members = circle.members.map(m => ({...m, consentLive: false}));
  return withLiveReady({...circle, members});
}

export function addMemberByInvite(
  circles: LocalCircle[],
  inviteCode: string,
  displayName: string,
  now = Date.now(),
):
  | {ok: true; circles: LocalCircle[]; circleId: string}
  | {ok: false; reason: string} {
  const code = inviteCode.trim().toUpperCase();
  if (code.length < 4) {
    return {ok: false, reason: 'Enter a valid invite code'};
  }
  const idx = circles.findIndex(c => c.inviteCode === code);
  if (idx < 0) {
    return {ok: false, reason: 'No circle found for that invite code on this device'};
  }
  const circle = circles[idx];
  if (circle.members.length >= circle.maxMembers) {
    return {ok: false, reason: `Circle is full (max ${circle.maxMembers})`};
  }
  const name = displayName.trim() || 'Member';
  if (circle.members.some(m => m.displayName.toLowerCase() === name.toLowerCase())) {
    return {ok: false, reason: 'That display name is already in this circle'};
  }
  const member: CircleMember = {
    id: makeMemberId('member', now),
    displayName: name,
    role: 'member',
    consentLive: false,
    joinedAtMs: now,
  };
  const nextCircle = withLiveReady({
    ...circle,
    members: [...circle.members, member],
  });
  const next = [...circles];
  next[idx] = nextCircle;
  return {ok: true, circles: next, circleId: circle.id};
}

/** Same-device tester: add a simulated peer without typing a second identity. */
export function addSimulatedPeer(
  circle: LocalCircle,
  now = Date.now(),
  displayName?: string,
  consentLive = false,
): {ok: true; circle: LocalCircle} | {ok: false; reason: string} {
  if (circle.members.length >= circle.maxMembers) {
    return {ok: false, reason: `Circle is full (max ${circle.maxMembers})`};
  }
  const n = circle.members.filter(m => m.role === 'member').length + 1;
  const member: CircleMember = {
    id: makeMemberId('peer', now),
    displayName: (displayName || `Peer ${n}`).trim() || `Peer ${n}`,
    role: 'member',
    consentLive,
    joinedAtMs: now,
  };
  return {
    ok: true,
    circle: withLiveReady({...circle, members: [...circle.members, member]}),
  };
}

/** Seed category-appropriate test peers (all consented) for same-device map demos. */
export function seedDemoPeers(
  circle: LocalCircle,
  count: number,
  nameFor: (ordinal: number) => string,
  now = Date.now(),
): LocalCircle {
  let next = circle;
  const existingPeers = next.members.filter(m => m.id.startsWith('peer_')).length;
  for (let i = 0; i < count; i++) {
    if (next.members.length >= next.maxMembers) break;
    const result = addSimulatedPeer(
      next,
      now + i + 1,
      nameFor(existingPeers + i),
      true,
    );
    if (!result.ok) break;
    next = result.circle;
  }
  // Owner consent so liveReady can become true once peers are consented.
  const members = next.members.map(m =>
    m.role === 'owner' ? {...m, consentLive: true} : m,
  );
  return withLiveReady({...next, members});
}

export function removeMember(circle: LocalCircle, memberId: string): LocalCircle {
  const members = circle.members.filter(m => m.id !== memberId);
  return withLiveReady({...circle, members});
}

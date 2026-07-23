import type {CircleCategory, CircleCategoryCode, LocalCircle, CreateCircleInput} from './circleTypes';
import {makeInviteCode, makeMemberId, withLiveReady} from './circleInvite';

/** P4 categories from PROJECT_IMPLEMENTATION_PLAN §5.3 */
export const CIRCLE_CATEGORIES: CircleCategory[] = [
  {
    code: 'one_to_one',
    label: 'One to one',
    description: 'Private live share with one other person',
    maxMembers: 2,
    featureKey: 'circle.one_to_one',
  },
  {
    code: 'friend',
    label: 'Friend',
    description: 'Share live location with a friend',
    maxMembers: 2,
    featureKey: 'circle.friend',
  },
  {
    code: 'friends_group',
    label: 'Friends group',
    description: 'Small friend group live map',
    maxMembers: 10,
    featureKey: 'circle.friends_group',
  },
  {
    code: 'family',
    label: 'Family',
    description: 'Family circle with guardian roles (later)',
    maxMembers: 8,
    featureKey: 'circle.family',
  },
  {
    code: 'peer',
    label: 'Peer',
    description: 'Peer / team circle',
    maxMembers: 6,
    featureKey: 'circle.peer',
  },
];

export function getCircleCategory(code: CircleCategoryCode): CircleCategory | undefined {
  return CIRCLE_CATEGORIES.find(c => c.code === code);
}

export function createLocalCircle(
  input: CreateCircleInput,
  now = Date.now(),
): {ok: true; circle: LocalCircle} | {ok: false; reason: string} {
  const name = input.name.trim();
  if (!name) {
    return {ok: false, reason: 'Enter a name for this circle'};
  }
  if (name.length > 48) {
    return {ok: false, reason: 'Name must be 48 characters or fewer'};
  }
  const category = getCircleCategory(input.category);
  if (!category) {
    return {ok: false, reason: 'Unknown circle category'};
  }
  const ownerId = makeMemberId('owner', now);
  const circle = withLiveReady({
    id: `c_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    category: category.code,
    maxMembers: category.maxMembers,
    memberCount: 1,
    createdAtMs: now,
    inviteCode: makeInviteCode(now),
    members: [
      {
        id: ownerId,
        displayName: 'You',
        role: 'owner',
        consentLive: false,
        joinedAtMs: now,
      },
    ],
    liveReady: false,
  });
  return {ok: true, circle};
}

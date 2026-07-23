import type {FeatureKey} from '../../services/entitlements/FeatureGate';

export type CircleCategoryCode =
  | 'one_to_one'
  | 'friend'
  | 'friends_group'
  | 'family'
  | 'peer';

export type CircleCategory = {
  code: CircleCategoryCode;
  label: string;
  description: string;
  maxMembers: number;
  featureKey: FeatureKey;
};

export type CircleMemberRole = 'owner' | 'member';

export type CircleMember = {
  id: string;
  displayName: string;
  role: CircleMemberRole;
  /** Mutual consent for live share (P4-4). No live until all true. */
  consentLive: boolean;
  joinedAtMs: number;
};

export type LocalCircle = {
  id: string;
  name: string;
  category: CircleCategoryCode;
  maxMembers: number;
  memberCount: number;
  createdAtMs: number;
  /** Shareable code for invite + accept (local until NestJS/FCM). */
  inviteCode: string;
  members: CircleMember[];
  /** True only when every member has consentLive — gates future live map. */
  liveReady: boolean;
};

export type CreateCircleInput = {
  name: string;
  category: CircleCategoryCode;
};

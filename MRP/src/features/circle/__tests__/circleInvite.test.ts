import {createLocalCircle} from '../circleCatalog';
import {
  addMemberByInvite,
  addSimulatedPeer,
  computeLiveReady,
  setMemberConsent,
} from '../circleInvite';

describe('circleInvite', () => {
  it('creates a circle with invite code and owner without live consent', () => {
    const result = createLocalCircle({name: 'Home', category: 'family'}, 1_700_000_000_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.circle.inviteCode.length).toBe(6);
    expect(result.circle.members).toHaveLength(1);
    expect(result.circle.members[0].role).toBe('owner');
    expect(result.circle.liveReady).toBe(false);
  });

  it('joins by invite code and stays blocked until mutual consent', () => {
    const created = createLocalCircle({name: 'Pair', category: 'one_to_one'}, 100);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const joined = addMemberByInvite([created.circle], created.circle.inviteCode, 'Alex', 200);
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.circles[0].members).toHaveLength(2);
    expect(joined.circles[0].liveReady).toBe(false);

    let circle = joined.circles[0];
    const ownerId = circle.members.find(m => m.role === 'owner')!.id;
    const memberId = circle.members.find(m => m.role === 'member')!.id;
    circle = setMemberConsent(circle, ownerId, true);
    expect(circle.liveReady).toBe(false);
    circle = setMemberConsent(circle, memberId, true);
    expect(circle.liveReady).toBe(true);
    expect(computeLiveReady(circle.members)).toBe(true);
  });

  it('rejects a third member on one_to_one', () => {
    const created = createLocalCircle({name: 'Duo', category: 'one_to_one'}, 1);
    if (!created.ok) return;
    const withPeer = addSimulatedPeer(created.circle, 2);
    expect(withPeer.ok).toBe(true);
    if (!withPeer.ok) return;
    const third = addSimulatedPeer(withPeer.circle, 3);
    expect(third.ok).toBe(false);
  });
});

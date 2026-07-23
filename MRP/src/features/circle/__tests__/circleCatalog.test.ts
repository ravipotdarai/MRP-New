import {CIRCLE_CATEGORIES, createLocalCircle, getCircleCategory} from '../circleCatalog';

describe('circleCatalog', () => {
  it('defines five categories with plan caps', () => {
    expect(CIRCLE_CATEGORIES).toHaveLength(5);
    expect(getCircleCategory('one_to_one')?.maxMembers).toBe(2);
    expect(getCircleCategory('friend')?.maxMembers).toBe(2);
    expect(getCircleCategory('friends_group')?.maxMembers).toBe(10);
    expect(getCircleCategory('family')?.maxMembers).toBe(8);
    expect(getCircleCategory('peer')?.maxMembers).toBe(6);
  });

  it('creates a local circle for a valid category', () => {
    const result = createLocalCircle({name: 'Home', category: 'family'}, 1_700_000_000_000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.circle.name).toBe('Home');
      expect(result.circle.maxMembers).toBe(8);
      expect(result.circle.memberCount).toBe(1);
      expect(result.circle.inviteCode).toBeTruthy();
    }
  });

  it('rejects empty names', () => {
    const result = createLocalCircle({name: '  ', category: 'peer'});
    expect(result.ok).toBe(false);
  });
});

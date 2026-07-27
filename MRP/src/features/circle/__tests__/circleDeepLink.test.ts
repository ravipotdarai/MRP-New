import {describe, expect, it} from '@jest/globals';
import {
  circleInviteAppLink,
  circleInviteHttpsLink,
  parseInviteCodeFromUrl,
  shareInviteMessage,
} from '../circleDeepLink';

describe('circleDeepLink', () => {
  it('builds https and app scheme links', () => {
    expect(circleInviteHttpsLink('ab12cd')).toContain('code=AB12CD');
    expect(circleInviteAppLink('ab12cd')).toBe('mrp://circle/join?code=AB12CD');
  });

  it('parses mrp and https URLs', () => {
    expect(parseInviteCodeFromUrl('mrp://circle/join?code=XY99ZZ')).toBe('XY99ZZ');
    expect(
      parseInviteCodeFromUrl(
        'https://mobileresilienceplatform.web.app/circle/join?code=ab12cd',
      ),
    ).toBe('AB12CD');
  });

  it('rejects short codes', () => {
    expect(parseInviteCodeFromUrl('mrp://circle/join?code=AB')).toBeNull();
  });

  it('includes code in share message', () => {
    const msg = shareInviteMessage('Family', 'HELLO1');
    expect(msg).toContain('HELLO1');
    expect(msg).toContain('mobileresilienceplatform.web.app');
  });
});

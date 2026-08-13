import {describe, expect, it} from '@jest/globals';
import {parseSafeLinkText} from '../useSafeLinkShareDeepLink';

describe('safeLinkShareDeepLink', () => {
  it('extracts encoded text from mrp safe-link URLs', () => {
    expect(
      parseSafeLinkText(
        'mrp://safe-link?text=https%3A%2F%2Fexample.com%2Flogin%3Fa%3D1',
      ),
    ).toBe('https://example.com/login?a=1');
  });

  it('ignores unrelated deep links', () => {
    expect(parseSafeLinkText('mrp://circle/join?code=ABC123')).toBeNull();
  });

  it('returns null when the text parameter is missing', () => {
    expect(parseSafeLinkText('mrp://safe-link')).toBeNull();
  });

  it('ignores URLs that only contain the safe-link substring', () => {
    expect(parseSafeLinkText('https://example.com/safe-link?text=https://evil.test')).toBeNull();
    expect(parseSafeLinkText('android-app://com.mrp/https/example.com')).toBeNull();
  });
});

import {describe, expect, it} from '@jest/globals';
import {extractFirstUrl} from '../extractUrlFromText';

describe('extractFirstUrl', () => {
  it('extracts https URLs from surrounding text', () => {
    expect(extractFirstUrl('see https://example.com/login now')).toBe(
      'https://example.com/login',
    );
  });

  it('normalizes www hosts to https', () => {
    expect(extractFirstUrl('www.example.com/a')).toBe('https://www.example.com/a');
  });

  it('ignores non-URL clipboard text', () => {
    expect(extractFirstUrl('otp 123456 do not share')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(extractFirstUrl('')).toBeNull();
    expect(extractFirstUrl(null)).toBeNull();
  });
});

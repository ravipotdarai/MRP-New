import {describe, expect, it} from '@jest/globals';
import {scanUrlOrPayload} from '../../security-center/urlScan';

describe('urlScan brand enrichment', () => {
  it('adds brand impersonation on unofficial lookalikes', () => {
    const r = scanUrlOrPayload('http://paytm.tk/login');
    expect(r.reasonCodes).toContain('BRAND_IMPERSONATION');
    expect(r.score).toBeGreaterThan(40);
  });

  it('does not brand-flag official hosts', () => {
    const r = scanUrlOrPayload('https://paytm.com');
    expect(r.reasonCodes).not.toContain('BRAND_IMPERSONATION');
  });
});

import {describe, expect, it} from '@jest/globals';
import {checkBrandImpersonation} from '../brandImpersonation';

describe('brandImpersonation', () => {
  it('does not flag official domains', () => {
    expect(checkBrandImpersonation('paytm.com')).toBeNull();
    expect(checkBrandImpersonation('www.hdfcbank.com')).toBeNull();
    expect(checkBrandImpersonation('accounts.google.com')).toBeNull();
  });

  it('flags unofficial exact brand domains', () => {
    const hit = checkBrandImpersonation('paytm.tk');
    expect(hit?.code).toBe('BRAND_IMPERSONATION');
    expect(hit?.brand).toBe('paytm');
  });

  it('flags hyphenated impersonation tokens', () => {
    const hit = checkBrandImpersonation('paytm-secure.xyz');
    expect(hit?.code).toBe('BRAND_IMPERSONATION');
  });

  it('flags close typosquats for longer brands', () => {
    const hit = checkBrandImpersonation('whatsappp.com');
    expect(hit?.code).toBe('TYPOSQUAT');
  });

  it('does not flag unrelated short collisions', () => {
    expect(checkBrandImpersonation('maxis.com')).toBeNull();
  });
});

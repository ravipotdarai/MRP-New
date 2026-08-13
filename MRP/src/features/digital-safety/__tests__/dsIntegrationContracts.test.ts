/**
 * Lightweight integration contracts for Digital Safety go-live.
 * Device-bound VPN→browser and Drive restore remain manual / instrumentation.
 */
import {parseSafeLinkText} from '../useSafeLinkShareDeepLink';
import {SECURE_VAULT_CRYPTO_VERSION} from '../vaultCryptoVersion';

describe('Digital Safety integration contracts', () => {
  it('parses share deep links for Safe Link automation', () => {
    const text = parseSafeLinkText('mrp://safe-link?text=' + encodeURIComponent('https://paytm.tk'));
    expect(text).toContain('paytm.tk');
    expect(parseSafeLinkText('https://example.com')).toBeNull();
  });

  it('keeps vault crypto version documented for restore path', () => {
    expect(SECURE_VAULT_CRYPTO_VERSION).toBe(1);
  });
});

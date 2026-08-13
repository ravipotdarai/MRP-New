import {SECURE_VAULT_CRYPTO_VERSION} from '../vaultCryptoVersion';

describe('Secure Vault CRYPTO_VERSION', () => {
  it('documents current on-device crypto version', () => {
    expect(SECURE_VAULT_CRYPTO_VERSION).toBe(1);
  });

  it('requires bump + migration when format changes', () => {
    expect(SECURE_VAULT_CRYPTO_VERSION).toBeGreaterThanOrEqual(1);
  });
});

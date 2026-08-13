import {
  capabilityLevel,
  hasCapability,
  hasFullCapability,
  TIMELINE_RETENTION_DAYS,
} from '../DigitalSafetyCapabilityMatrix';

describe('DigitalSafetyCapabilityMatrix', () => {
  it('allows free-tier manual safe link and QR', () => {
    expect(hasCapability('free', 'safeLinkManual')).toBe(true);
    expect(hasCapability('free', 'qrProtection')).toBe(true);
    expect(hasCapability('free', 'networkGuardian')).toBe(false);
  });

  it('unlocks clipboard and breach on basic', () => {
    expect(hasCapability('basic', 'clipboardUrlScan')).toBe(true);
    expect(hasCapability('basic', 'breachEmailMonitoring')).toBe(true);
    expect(hasFullCapability('basic', 'secureVault')).toBe(false);
    expect(capabilityLevel('basic', 'secureVault')).toBe('limited');
  });

  it('unlocks guardian on premium', () => {
    expect(hasCapability('premium', 'networkGuardian')).toBe(true);
    expect(hasFullCapability('premium', 'secureVaultBackup')).toBe(true);
    expect(hasCapability('premium', 'smsScamAutoScan')).toBe(true);
  });

  it('sets timeline retention per tier', () => {
    expect(TIMELINE_RETENTION_DAYS.free).toBe(7);
    expect(TIMELINE_RETENTION_DAYS.basic).toBe(30);
    expect(TIMELINE_RETENTION_DAYS.premium).toBe(90);
    expect(TIMELINE_RETENTION_DAYS.family).toBe(180);
  });
});

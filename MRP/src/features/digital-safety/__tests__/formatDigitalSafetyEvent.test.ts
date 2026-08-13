import {formatDigitalSafetyEventType} from '../formatDigitalSafetyEvent';

describe('formatDigitalSafetyEventType', () => {
  it('uses claim-safe labels for core DS events', () => {
    expect(formatDigitalSafetyEventType('SAFE_LINK_BLOCKED')).toBe('Safe Link — high risk');
    expect(formatDigitalSafetyEventType('NETWORK_GUARDIAN_ENABLED')).toBe('Network Guardian on');
    expect(formatDigitalSafetyEventType('AD_BLOCKED')).toContain('DNS');
    expect(formatDigitalSafetyEventType('CELLULAR_ANOMALY')).toBe('Cellular anomaly signal');
    expect(formatDigitalSafetyEventType('BREACH_EMAIL_FOUND')).toContain('Breach watch');
  });

  it('does not invent fake-tower certainty', () => {
    expect(formatDigitalSafetyEventType('CELLULAR_ANOMALY').toLowerCase()).not.toContain('fake tower');
  });
});

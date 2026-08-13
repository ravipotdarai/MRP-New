import {scanOtpSms} from '../../security-center/otpHeuristics';
import {scanUrlOrPayload} from '../../security-center/urlScan';

describe('Scam protection integration', () => {
  it('paste URL path produces unified risk bands via urlScan', () => {
    const r = scanUrlOrPayload('http://paytm.tk/login');
    expect(r.score).toBeGreaterThan(40);
    expect(r.reasonCodes.length).toBeGreaterThan(0);
  });

  it('paste OTP scam phrase scores caution or higher', () => {
    const r = scanOtpSms('Cyber cell asked me to share OTP 123456 immediately');
    expect(['caution', 'scam_likely']).toContain(r.verdict);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('payment UPI payload stays distinct from http URL scan path', () => {
    const r = scanUrlOrPayload('upi://pay?pa=test@upi');
    expect(r.input).toContain('upi://');
    expect(r.reasonCodes).not.toContain('HTTP_INSECURE');
  });
});

/**
 * OTP / SMS scam heuristics — paste-only (no READ_SMS, no cloud OTP storage).
 */

export type OtpVerdict = 'ok' | 'caution' | 'scam_likely' | 'empty';

export type OtpScanResult = {
  verdict: OtpVerdict;
  reasons: string[];
  tips: string[];
};

const OTP_CODE = /\b(\d{4,8})\b/;
const URL_IN_SMS = /https?:\/\/[^\s]+/i;
const SHORT_LINK = /\b(bit\.ly|tinyurl|t\.co|cutt\.ly|is\.gd|rb\.gy)\b/i;

const SCAM_PHRASES = [
  /digital\s*arrest/i,
  /cyber\s*cell/i,
  /share\s*(your\s*)?(otp|one[\s-]?time)/i,
  /send\s*(your\s*)?otp/i,
  /forward\s*(this\s*)?otp/i,
  /otp\s*(to|for)\s*(agent|officer|bank\s*staff)/i,
  /kyc\s*(update|pending|fail)/i,
  /account\s*(will\s*)?(be\s*)?(block|suspend|frozen)/i,
  /click\s*(here|link)\s*(to\s*)?(verify|unlock|claim)/i,
  /won\s*(a\s*)?(prize|lottery|iPhone)/i,
  /upi\s*(pin|pass)/i,
  /customer\s*care\s*(ask|need|demand).{0,20}otp/i,
  /remote\s*(access|anydesk|teamviewer)/i,
  /अरेस्ट|गिरफ्तार|ओटीपी\s*भेज|केवाईसी/i,
];

const BANKISH = /\b(sbi|hdfc|icici|axis|kotak|paytm|phonepe|gpay|google\s*pay|upi|bank|otp)\b/i;

export function scanOtpSms(raw: string): OtpScanResult {
  const text = raw.trim();
  if (!text) {
    return {
      verdict: 'empty',
      reasons: ['Paste an SMS you received (MRP does not read your inbox).'],
      tips: [
        'Banks never ask for OTP on a call.',
        'Never share OTP with anyone claiming to be cyber police.',
      ],
    };
  }

  const reasons: string[] = [];
  let score = 0;

  const hasOtp = OTP_CODE.test(text);
  if (hasOtp) {
    reasons.push('Looks like it contains a numeric OTP / code');
  }

  for (const re of SCAM_PHRASES) {
    if (re.test(text)) {
      score += 40;
      reasons.push(`Suspicious phrase match: ${re.source.slice(0, 48)}`);
      break;
    }
  }

  if (URL_IN_SMS.test(text) && hasOtp) {
    score += 25;
    reasons.push('OTP message also contains a link — verify sender before tapping');
  }
  if (SHORT_LINK.test(text)) {
    score += 20;
    reasons.push('Uses a URL shortener');
  }
  if (BANKISH.test(text) && URL_IN_SMS.test(text) && !/@[a-z0-9.-]+\b/i.test(text)) {
    score += 15;
    reasons.push('Bank/UPI wording without a clear official sender domain');
  }
  if (/whatsapp|telegram|anydesk|teamviewer/i.test(text) && hasOtp) {
    score += 30;
    reasons.push('Mentions remote/chat app with OTP — common scam pattern');
  }

  const tips = [
    'MRP never asks for OTPs or remote access.',
    'If unsure, hang up and open your bank app yourself — do not use links from SMS.',
    'Report fraud SMS via Sanchar Saathi / cybercrime.gov.in.',
  ];

  if (score === 0 && hasOtp) {
    reasons.push('No strong scam signals — still never share this OTP with callers');
  } else if (score === 0) {
    reasons.push('No OTP code detected; review wording carefully');
  }

  const verdict: OtpVerdict =
    score >= 40 ? 'scam_likely' : score >= 20 ? 'caution' : 'ok';

  return {verdict, reasons, tips};
}

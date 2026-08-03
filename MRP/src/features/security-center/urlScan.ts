/**
 * On-device URL / QR payload heuristics — not Safe Browsing / antivirus.
 * User-paste only; never reads vault or contacts.
 */

export type UrlScanVerdict = 'safe' | 'caution' | 'risky' | 'invalid';

export type UrlScanResult = {
  input: string;
  normalized: string | null;
  verdict: UrlScanVerdict;
  reasons: string[];
};

/** Known-bad / abuse TLDs and host fragments (local blocklist; keep small). */
const BLOCK_HOST_FRAGMENTS = [
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'cutt.ly',
];

const RISKY_TLDS = ['.tk', '.ml', '.ga', '.cf', '.gq', '.zip', '.mov', '.top', '.xyz'];

const PHISH_WORDS = [
  'verify-account',
  'secure-login',
  'update-kyc',
  'unlock-account',
  'claim-prize',
  'free-recharge',
  'otp-verify',
  'bank-secure',
  'upi-refund',
  'digital-arrest',
];

function extractUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const wifiMatch = trimmed.match(/^WIFI:.*?;S:([^;]*);/i);
  if (wifiMatch) {
    return null; // Wi‑Fi QR handled separately by caller
  }
  const urlInText = trimmed.match(/https?:\/\/[^\s<>"']+/i);
  if (urlInText) return urlInText[0].replace(/[.,;)\]]+$/, '');
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed) && !trimmed.includes(' ')) {
    return `https://${trimmed}`;
  }
  if (trimmed.toLowerCase().startsWith('www.')) {
    return `https://${trimmed}`;
  }
  return null;
}

export function isWifiQrPayload(raw: string): boolean {
  return /^\s*WIFI:/i.test(raw.trim());
}

export function parseWifiQr(raw: string): {ssid: string; security: string} | null {
  if (!isWifiQrPayload(raw)) return null;
  const s = raw.trim();
  const ssid = s.match(/;S:([^;]*);/i)?.[1] ?? '';
  const security = s.match(/;T:([^;]*);/i)?.[1] ?? 'unknown';
  return {ssid, security};
}

export function scanUrlOrPayload(raw: string): UrlScanResult {
  const input = raw.trim();
  if (!input) {
    return {input, normalized: null, verdict: 'invalid', reasons: ['Empty input']};
  }

  if (isWifiQrPayload(input)) {
    const wifi = parseWifiQr(input);
    const sec = (wifi?.security || '').toUpperCase();
    const open = !sec || sec === 'NOPASS' || sec === 'NONE';
    const wep = sec === 'WEP';
    const reasons: string[] = [
      `Wi‑Fi QR · SSID “${wifi?.ssid || '?'}” · ${sec || 'unknown'}`,
    ];
    if (open) {
      reasons.push('Open network QR — traffic is unencrypted');
      return {input, normalized: null, verdict: 'risky', reasons};
    }
    if (wep) {
      reasons.push('WEP is obsolete — treat as weak');
      return {input, normalized: null, verdict: 'caution', reasons};
    }
    reasons.push('Local decode only — confirm SSID before joining');
    return {input, normalized: null, verdict: 'caution', reasons};
  }

  const url = extractUrl(input);
  if (!url) {
    return {
      input,
      normalized: null,
      verdict: 'invalid',
      reasons: ['No http(s) URL found. Paste a full link or domain.'],
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {input, normalized: null, verdict: 'invalid', reasons: ['Malformed URL']};
  }

  const reasons: string[] = [];
  let score = 0;
  const host = parsed.hostname.toLowerCase();
  const path = `${parsed.pathname}${parsed.search}`.toLowerCase();

  if (parsed.protocol === 'http:') {
    score += 25;
    reasons.push('Uses HTTP (not HTTPS)');
  }
  if (parsed.username || parsed.password) {
    score += 40;
    reasons.push('URL embeds credentials');
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    score += 30;
    reasons.push('IP address host (common in phishing)');
  }
  if (host.includes('xn--')) {
    score += 25;
    reasons.push('Punycode / IDN host — verify carefully');
  }
  if ((host.match(/\./g) || []).length >= 4) {
    score += 15;
    reasons.push('Many subdomains');
  }
  if (BLOCK_HOST_FRAGMENTS.some(f => host === f || host.endsWith(`.${f}`))) {
    score += 20;
    reasons.push('URL shortener — destination hidden until opened');
  }
  if (RISKY_TLDS.some(t => host.endsWith(t))) {
    score += 20;
    reasons.push(`Higher-abuse TLD (${host.split('.').pop()})`);
  }
  for (const w of PHISH_WORDS) {
    if (host.includes(w) || path.includes(w)) {
      score += 35;
      reasons.push(`Suspicious keyword “${w}”`);
      break;
    }
  }
  if (/%[0-9a-f]{2}/i.test(parsed.href) && (parsed.href.match(/%/g) || []).length > 4) {
    score += 10;
    reasons.push('Heavy URL encoding');
  }

  if (reasons.length === 0) {
    reasons.push('No local red flags — still verify before entering passwords / OTP');
  }

  const verdict: UrlScanVerdict =
    score >= 50 ? 'risky' : score >= 20 ? 'caution' : 'safe';

  return {input, normalized: parsed.href, verdict, reasons};
}

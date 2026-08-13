/**
 * Conservative brand impersonation / typosquat checks.
 * Keep aligned with BrandImpersonationChecker.kt.
 */

export type BrandHit = {
  brand: string;
  reason: string;
  code: string;
  score: number;
};

const BRANDS = [
  'paytm',
  'phonepe',
  'googlepay',
  'whatsapp',
  'instagram',
  'facebook',
  'flipkart',
  'amazon',
  'hdfc',
  'icici',
  'kotak',
  'axisbank',
  'irctc',
  'uidai',
  'aadhaar',
  'npci',
  'sbi',
];

const OFFICIAL = new Set([
  'paytm.com',
  'phonepe.com',
  'google.com',
  'google.co.in',
  'whatsapp.com',
  'instagram.com',
  'facebook.com',
  'flipkart.com',
  'amazon.com',
  'amazon.in',
  'hdfcbank.com',
  'icicibank.com',
  'kotak.com',
  'axisbank.com',
  'irctc.co.in',
  'uidai.gov.in',
  'npci.org.in',
  'sbi.co.in',
  'onlinesbi.sbi',
  'sbi.com',
]);

export function checkBrandImpersonation(hostRaw: string): BrandHit | null {
  const host = hostRaw.trim().replace(/\.$/, '').toLowerCase();
  if (!host || host.length > 253) return null;
  if (isOfficial(host)) return null;

  const sld = registrableLabel(host);
  if (!sld) return null;
  const tokens = host.split(/[.-]/).filter(t => t.length >= 3);

  for (const brand of BRANDS) {
    if (sld === brand) {
      return {
        brand,
        reason: `Looks like ${brand} on an unofficial domain`,
        code: 'BRAND_IMPERSONATION',
        score: 45,
      };
    }
    if (brand.length >= 4 && tokens.includes(brand)) {
      return {
        brand,
        reason: `Uses the name ${brand} on an unofficial domain`,
        code: 'BRAND_IMPERSONATION',
        score: 40,
      };
    }
    const folded = foldHomoglyphs(sld);
    if (folded === brand && sld !== brand) {
      return {
        brand,
        reason: `Homoglyph lookalike of ${brand}`,
        code: 'HOMOGLYPH_BRAND',
        score: 50,
      };
    }
    if (brand.length >= 5 && sld.length >= 5) {
      const distance = levenshtein(sld, brand);
      if (distance === 1) {
        return {
          brand,
          reason: `Possible typosquat of ${brand}`,
          code: 'TYPOSQUAT',
          score: 40,
        };
      }
      if (distance === 2 && brand.length >= 7 && sld.length >= 7) {
        return {
          brand,
          reason: `Possible typosquat of ${brand}`,
          code: 'TYPOSQUAT',
          score: 30,
        };
      }
    }
  }
  return null;
}

function isOfficial(host: string): boolean {
  for (const d of OFFICIAL) {
    if (host === d || host.endsWith(`.${d}`)) return true;
  }
  return false;
}

function registrableLabel(host: string): string | null {
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return parts[0] || null;
  const multi = new Set(['co', 'com', 'gov', 'org', 'net', 'ac']);
  if (parts.length >= 3 && multi.has(parts[parts.length - 2])) {
    return parts[parts.length - 3];
  }
  return parts[parts.length - 2];
}

function foldHomoglyphs(value: string): string {
  return value.replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/5/g, 's').replace(/rn/g, 'm');
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = Array.from({length: n + 1}, (_, i) => i);
  const cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

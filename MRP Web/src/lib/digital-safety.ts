/**
 * Conservative brand impersonation / typosquat checks.
 * Keep aligned with MRP/src/features/digital-safety/brandImpersonation.ts.
 */

export type BrandHit = {
  brand: string;
  reason: string;
  code: string;
  score: number;
};

const BRANDS = [
  "paytm",
  "phonepe",
  "googlepay",
  "whatsapp",
  "instagram",
  "facebook",
  "flipkart",
  "amazon",
  "hdfc",
  "icici",
  "kotak",
  "axisbank",
  "irctc",
  "uidai",
  "aadhaar",
  "npci",
  "sbi",
];

const OFFICIAL = new Set([
  "paytm.com",
  "phonepe.com",
  "google.com",
  "google.co.in",
  "whatsapp.com",
  "instagram.com",
  "facebook.com",
  "flipkart.com",
  "amazon.com",
  "amazon.in",
  "hdfcbank.com",
  "icicibank.com",
  "kotak.com",
  "axisbank.com",
  "irctc.co.in",
  "uidai.gov.in",
  "npci.org.in",
  "sbi.co.in",
  "onlinesbi.sbi",
  "sbi.com",
]);

export function checkBrandImpersonation(hostRaw: string): BrandHit | null {
  const host = hostRaw.trim().replace(/\.$/, "").toLowerCase();
  if (!host || host.length > 253) return null;
  if ([...OFFICIAL].some((d) => host === d || host.endsWith(`.${d}`))) return null;

  const parts = host.split(".").filter(Boolean);
  const multi = new Set(["co", "com", "gov", "org", "net", "ac"]);
  const sld =
    parts.length >= 3 && multi.has(parts[parts.length - 2])
      ? parts[parts.length - 3]
      : parts.length >= 2
        ? parts[parts.length - 2]
        : parts[0];
  if (!sld) return null;
  const tokens = host.split(/[.-]/).filter((t) => t.length >= 3);

  for (const brand of BRANDS) {
    if (sld === brand) {
      return {
        brand,
        reason: `Looks like ${brand} on an unofficial domain`,
        code: "BRAND_IMPERSONATION",
        score: 45,
      };
    }
    if (brand.length >= 4 && tokens.includes(brand)) {
      return {
        brand,
        reason: `Uses the name ${brand} on an unofficial domain`,
        code: "BRAND_IMPERSONATION",
        score: 40,
      };
    }
    const folded = sld.replace(/0/g, "o").replace(/1/g, "l").replace(/3/g, "e").replace(/5/g, "s").replace(/rn/g, "m");
    if (folded === brand && sld !== brand) {
      return { brand, reason: `Homoglyph lookalike of ${brand}`, code: "HOMOGLYPH_BRAND", score: 50 };
    }
    if (brand.length >= 5 && sld.length >= 5) {
      const distance = levenshtein(sld, brand);
      if (distance === 1) {
        return { brand, reason: `Possible typosquat of ${brand}`, code: "TYPOSQUAT", score: 40 };
      }
      if (distance === 2 && brand.length >= 7 && sld.length >= 7) {
        return { brand, reason: `Possible typosquat of ${brand}`, code: "TYPOSQUAT", score: 30 };
      }
    }
  }
  return null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const prev = Array.from({ length: n + 1 }, (_, i) => i);
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

export type UrlScanResult = {
  input: string;
  normalized: string | null;
  score: number;
  band: string;
  reasons: string[];
  reasonCodes: string[];
  host?: string;
};

export function scanUrl(raw: string): UrlScanResult {
  const input = raw.trim();
  if (!input) {
    return { input, normalized: null, score: -1, band: "INVALID", reasons: ["Empty input"], reasonCodes: ["EMPTY_INPUT"] };
  }
  let url = input.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,;)\]]+$/, "");
  if (!url && /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(input) && !input.includes(" ")) url = `https://${input}`;
  if (!url && input.toLowerCase().startsWith("www.")) url = `https://${input}`;
  if (!url) {
    return {
      input,
      normalized: null,
      score: -1,
      band: "INVALID",
      reasons: ["No http(s) URL found. Paste a full link or domain."],
      reasonCodes: ["NO_URL"],
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { input, normalized: null, score: -1, band: "INVALID", reasons: ["Malformed URL"], reasonCodes: ["MALFORMED_URL"] };
  }
  const host = parsed.hostname.toLowerCase();
  const path = `${parsed.pathname}${parsed.search}`.toLowerCase();
  const reasons: string[] = [];
  const codes: string[] = [];
  let score = 0;
  if (parsed.protocol === "http:") {
    score += 25;
    reasons.push("Uses HTTP (not HTTPS)");
    codes.push("HTTP_INSECURE");
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    score += 30;
    reasons.push("IP address host");
    codes.push("IP_HOST");
  }
  if (host.includes("xn--")) {
    score += 25;
    reasons.push("Punycode / IDN host");
    codes.push("PUNYCODE_HOST");
  }
  const brand = checkBrandImpersonation(host);
  if (brand) {
    score += brand.score;
    reasons.push(brand.reason);
    codes.push(brand.code);
  }
  if ([".tk", ".ml", ".ga", ".cf", ".gq", ".zip", ".mov", ".top", ".xyz"].some((t) => host.endsWith(t))) {
    score += 20;
    reasons.push("Higher-abuse TLD");
    codes.push("RISKY_TLD");
  }
  if (path.includes("verify-account") || path.includes("update-kyc") || host.includes("secure-login")) {
    score += 35;
    reasons.push("Suspicious keyword");
    codes.push("PHISH_KEYWORD");
  }
  if (!reasons.length) {
    reasons.push("No local red flags — still verify before entering passwords / OTP");
    codes.push("NO_LOCAL_FLAGS");
  }
  const capped = Math.min(100, Math.max(0, score));
  const band = capped <= 19 ? "SAFE" : capped <= 39 ? "LOW_RISK" : capped <= 59 ? "SUSPICIOUS" : capped <= 79 ? "HIGH_RISK" : "CRITICAL";
  return { input, normalized: parsed.href, score: capped, band, reasons, reasonCodes: codes, host };
}

export function scanScamText(raw: string): { verdict: string; reasons: string[] } {
  const text = raw.trim();
  if (!text) return { verdict: "empty", reasons: ["Paste a message to begin."] };
  const reasons: string[] = [];
  let score = 0;
  if (/\b(\d{4,8})\b/.test(text)) reasons.push("Looks like it contains a numeric OTP / code");
  if (/digital\s*arrest|share\s*(your\s*)?otp|send\s*(your\s*)?otp|remote\s*(access|anydesk)/i.test(text)) {
    score += 40;
    reasons.push("Suspicious scam phrase");
  }
  if (/https?:\/\//i.test(text) && /\b(\d{4,8})\b/.test(text)) {
    score += 25;
    reasons.push("OTP message also contains a link");
  }
  if (score === 0 && reasons.length) reasons.push("No strong scam signals — still never share this OTP");
  const verdict = score >= 40 ? "scam_likely" : score >= 20 ? "caution" : "ok";
  return { verdict, reasons };
}

export async function checkEmailBreaches(emailRaw: string): Promise<{
  status: "clean" | "found" | "error" | "invalid";
  email: string;
  breaches: string[];
  message: string;
}> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "invalid", email, breaches: [], message: "Enter a valid email address." };
  }
  try {
    const res = await fetch(`https://api.xposedornot.com/v1/check-email/${encodeURIComponent(email)}`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json().catch(() => null);
    if (data?.Error === "Not found" || data?.error === "Not found") {
      return {
        status: "clean",
        email,
        breaches: [],
        message: "No known breaches for this email (XposedOrNot).",
      };
    }
    const raw = data?.breaches;
    let names: string[] = [];
    if (Array.isArray(raw)) names = Array.isArray(raw[0]) ? raw[0].map(String) : raw.map(String);
    return {
      status: names.length ? "found" : "clean",
      email,
      breaches: names.slice(0, 40),
      message: names.length
        ? `Found in ${names.length} known breach(es). Change passwords; enable 2FA.`
        : "No known breaches reported for this email.",
    };
  } catch (e: unknown) {
    return {
      status: "error",
      email,
      breaches: [],
      message: e instanceof Error ? e.message : "Network error.",
    };
  }
}

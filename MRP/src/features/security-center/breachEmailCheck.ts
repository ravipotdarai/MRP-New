/**
 * User-initiated email breach check via XposedOrNot (no API key).
 * Never reads contacts/vault. Email only sent to XposedOrNot on explicit consent.
 */

export type BreachCheckStatus = 'clean' | 'found' | 'error' | 'invalid';

export type BreachCheckResult = {
  status: BreachCheckStatus;
  email: string;
  breaches: string[];
  message: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export async function checkEmailBreaches(emailRaw: string): Promise<BreachCheckResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return {
      status: 'invalid',
      email,
      breaches: [],
      message: 'Enter a valid email address.',
    };
  }

  const url = `https://api.xposedornot.com/v1/check-email/${encodeURIComponent(email)}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {Accept: 'application/json'},
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    if (data?.Error === 'Not found' || data?.error === 'Not found') {
      return {
        status: 'clean',
        email,
        breaches: [],
        message: 'No known breaches for this email (XposedOrNot). Still use unique passwords.',
      };
    }

    // Response shape: { breaches: [["Name1","Name2",...]], email, status: "success" }
    let names: string[] = [];
    const raw = data?.breaches;
    if (Array.isArray(raw)) {
      if (raw.length > 0 && Array.isArray(raw[0])) {
        names = (raw[0] as unknown[]).map(String);
      } else {
        names = raw.map(String);
      }
    }

    if (names.length > 0 || data?.status === 'success') {
      return {
        status: names.length ? 'found' : 'clean',
        email,
        breaches: names.slice(0, 40),
        message: names.length
          ? `Found in ${names.length} known breach(es). Change passwords; enable 2FA.`
          : 'No breach names returned — treat as unclear; check XposedOrNot in browser.',
      };
    }

    if (!res.ok) {
      return {
        status: 'error',
        email,
        breaches: [],
        message: `Lookup failed (${res.status}). Try again later or open XposedOrNot in browser.`,
      };
    }

    return {
      status: 'clean',
      email,
      breaches: [],
      message: 'No known breaches reported for this email.',
    };
  } catch (e: any) {
    return {
      status: 'error',
      email,
      breaches: [],
      message: e?.message
        ? `Network error: ${e.message}`
        : 'Network error. Check connection or open XposedOrNot in browser.',
    };
  }
}

export const XPOSED_OR_NOT_URL = 'https://xposedornot.com/';
export const HIBP_URL = 'https://haveibeenpwned.com/';

/** P8-4 Circle invite deep links. */

const HTTPS_HOST = 'mobileresilienceplatform.web.app';

export function circleInviteHttpsLink(inviteCode: string): string {
  const code = encodeURIComponent(inviteCode.trim().toUpperCase());
  return `https://${HTTPS_HOST}/circle/join?code=${code}`;
}

export function circleInviteAppLink(inviteCode: string): string {
  const code = encodeURIComponent(inviteCode.trim().toUpperCase());
  return `mrp://circle/join?code=${code}`;
}

export function shareInviteMessage(circleName: string, inviteCode: string): string {
  const code = inviteCode.trim().toUpperCase();
  const https = circleInviteHttpsLink(code);
  return (
    `Join my MRP Circle "${circleName}"\n` +
    `Invite code: ${code}\n` +
    `Open: ${https}\n` +
    `Or in-app: ${circleInviteAppLink(code)}`
  );
}

/** Extract invite code from mrp:// or https://…/circle/join?code= */
export function parseInviteCodeFromUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const trimmed = url.trim();
    // mrp://circle/join?code=AB12CD
    if (trimmed.toLowerCase().startsWith('mrp://')) {
      const q = trimmed.indexOf('?');
      const query = q >= 0 ? trimmed.slice(q + 1) : '';
      const params = new URLSearchParams(query);
      const code = (params.get('code') || '').trim().toUpperCase();
      return code.length >= 4 ? code : null;
    }
    const parsed = new URL(trimmed);
    if (
      parsed.hostname === HTTPS_HOST &&
      parsed.pathname.replace(/\/$/, '').endsWith('/circle/join')
    ) {
      const code = (parsed.searchParams.get('code') || '').trim().toUpperCase();
      return code.length >= 4 ? code : null;
    }
  } catch {
    // Fallback regex
    const m = url.match(/[?&]code=([A-Za-z0-9]{4,12})/i);
    if (m?.[1]) return m[1].toUpperCase();
  }
  return null;
}

/** URL-only parse for clipboard / shared text. Never treats non-URL clipboard as a scan target. */
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/i;

export function extractFirstUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 4096) return null;
  const match = trimmed.match(URL_RE);
  if (!match) return null;
  let url = match[0].replace(/[.,);]+$/g, '');
  if (url.toLowerCase().startsWith('www.')) {
    url = `https://${url}`;
  }
  if (url.length > 2048) return null;
  return url;
}

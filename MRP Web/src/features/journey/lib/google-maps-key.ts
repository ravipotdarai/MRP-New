/**
 * Dedicated Maps JavaScript API key only.
 * Do not reuse the Firebase web key — it usually lacks Maps JS + billing and
 * renders the "Oops! Something went wrong" blank map.
 */
export function getGoogleMapsApiKey(): string | null {
  const dedicated = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return dedicated || null;
}

export function hasGoogleMapsApiKey(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

import {useEffect} from 'react';
import {Linking} from 'react-native';

export function parseSafeLinkText(url: string | null): string | null {
  if (!url) return null;
  try {
    // Only explicit share-to-MRP scheme — do not match arbitrary URLs that contain "safe-link".
    const trimmed = url.trim();
    const lower = trimmed.toLowerCase();
    if (!lower.startsWith('mrp://safe-link')) return null;
    const q = trimmed.includes('?') ? trimmed.slice(trimmed.indexOf('?') + 1) : '';
    const params = new URLSearchParams(q);
    const text = params.get('text');
    return text ? decodeURIComponent(text) : null;
  } catch {
    return null;
  }
}

/**
 * Listen for Safe Link share deep links (mrp://safe-link?text=…).
 */
export function useSafeLinkShareDeepLink(
  enabled: boolean,
  onText: (text: string) => void,
) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const handle = (url: string | null) => {
      const text = parseSafeLinkText(url);
      if (text && !cancelled) onText(text);
    };
    Linking.getInitialURL()
      .then(handle)
      .catch(() => {});
    const sub = Linking.addEventListener('url', ({url}) => handle(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled, onText]);
}

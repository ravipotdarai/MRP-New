import {useEffect} from 'react';
import {Linking} from 'react-native';

function parseSafeLinkText(url: string | null): string | null {
  if (!url) return null;
  try {
    if (!url.includes('mrp://safe-link') && !url.includes('safe-link')) return null;
    const q = url.includes('?') ? url.split('?')[1] : '';
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

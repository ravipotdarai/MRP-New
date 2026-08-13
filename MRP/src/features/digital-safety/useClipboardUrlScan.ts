import {useEffect, useRef} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {DigitalSafetyNative} from './DigitalSafety.native';

/**
 * Foreground-only clipboard URL watcher. Requires explicit opt-in stored natively.
 * Never caches clipboard text — only the last scanned URL string for de-dupe.
 */
export function useClipboardUrlScan(
  enabled: boolean,
  onUrl: (url: string) => void,
) {
  const lastUrl = useRef<string | null>(null);
  const onUrlRef = useRef(onUrl);
  const primed = useRef(false);
  onUrlRef.current = onUrl;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const peek = async (notify: boolean) => {
      if (cancelled || AppState.currentState !== 'active') return;
      try {
        const state = await DigitalSafetyNative.getAutomationState();
        if (!state?.clipboardScanEnabled) return;
        const peeked = await DigitalSafetyNative.peekClipboardUrl();
        const url = peeked?.url?.trim();
        if (!url) return;
        if (!notify) {
          lastUrl.current = url;
          return;
        }
        if (url === lastUrl.current) return;
        lastUrl.current = url;
        onUrlRef.current(url);
      } catch {
        // Clipboard may be empty or restricted; ignore.
      }
    };

    const onChange = (next: AppStateStatus) => {
      if (next === 'active') void peek(true);
    };

    // Prime with current clipboard on launch — do not open Safe Link from leftover clipboard.
    void peek(false).then(() => {
      primed.current = true;
    });
    const sub = AppState.addEventListener('change', onChange);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && primed.current) void peek(true);
    }, 8000);

    return () => {
      cancelled = true;
      sub.remove();
      clearInterval(timer);
    };
  }, [enabled]);
}

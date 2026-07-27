import {useEffect} from 'react';
import {Linking} from 'react-native';
import {parseInviteCodeFromUrl} from './circleDeepLink';
import {setPendingCircleInvite} from './circleInvitePending';

function handleUrl(url: string | null) {
  const code = parseInviteCodeFromUrl(url);
  if (code) setPendingCircleInvite(code);
}

/**
 * Listen for Circle invite deep links (mrp:// and https App Links).
 * Call after PIN unlock so Hub/Circle can consume the pending code.
 */
export function useCircleInviteDeepLink(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Linking.getInitialURL()
      .then(url => {
        if (!cancelled) handleUrl(url);
      })
      .catch(() => {});
    const sub = Linking.addEventListener('url', ({url}) => handleUrl(url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled]);
}

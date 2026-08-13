import {useEffect, useRef} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import {checkEmailBreaches} from '../security-center/breachEmailCheck';
import {DigitalSafetyNative} from './DigitalSafety.native';
import {logDigitalSafetyEvent} from './digitalSafetyEvents';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Re-checks user-enrolled emails at most once per 24h when the app is in the foreground.
 * Revocable via Automation settings. Does not scan the mailbox.
 */
export function useBreachEmailMonitor(enabled: boolean) {
  const running = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const run = async () => {
      if (cancelled || running.current || AppState.currentState !== 'active') return;
      running.current = true;
      try {
        const state = await DigitalSafetyNative.getAutomationState();
        const emails = state?.enrolledEmails ?? [];
        if (!emails.length) return;
        const due = !state.lastCheckAtMs || Date.now() - state.lastCheckAtMs >= DAY_MS;
        if (!due) return;
        for (const row of emails) {
          if (cancelled) return;
          const result = await checkEmailBreaches(row.email);
          if (result.status === 'invalid' || result.status === 'error') continue;
          await DigitalSafetyNative.recordBreachCheck(
            result.email,
            result.status,
            result.breaches.length,
          );
          await logDigitalSafetyEvent(
            result.status === 'found' ? 'BREACH_EMAIL_FOUND' : 'BREACH_EMAIL_CLEAN',
            result.status,
            {
              source: 'breach_monitor',
              count: result.breaches.length,
            },
          );
        }
      } catch {
        // Network or entitlement failures are non-fatal.
      } finally {
        running.current = false;
      }
    };

    const onChange = (next: AppStateStatus) => {
      if (next === 'active') void run();
    };

    void run();
    const sub = AppState.addEventListener('change', onChange);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled]);
}

/**
 * India-centric USSD / MMI helpers for call-forwarding checks.
 * Uses tel: dial intents (user confirms in Phone app) — no CALL_PHONE required.
 */

export type UssdCode = {
  id: string;
  code: string;
  title: string;
  subtitle: string;
};

export const USSD_CODES: UssdCode[] = [
  {
    id: 'cf_uncond',
    code: '*#21#',
    title: 'Unconditional forwarding',
    subtitle: 'Check if all calls are diverted',
  },
  {
    id: 'cf_busy',
    code: '*#67#',
    title: 'Forward when busy',
    subtitle: 'Check busy diversion',
  },
  {
    id: 'cf_noreply',
    code: '*#61#',
    title: 'Forward when unanswered',
    subtitle: 'Check no-answer diversion',
  },
  {
    id: 'cf_unreach',
    code: '*#62#',
    title: 'Forward when unreachable',
    subtitle: 'Check unreachable diversion',
  },
  {
    id: 'cf_all',
    code: '*#002#',
    title: 'All forwarding status',
    subtitle: 'Query all call-forward settings',
  },
  {
    id: 'clip',
    code: '*#30#',
    title: 'Caller ID (CLIP)',
    subtitle: 'Check if your number is shown',
  },
];

/** Encode # for tel: URIs (carriers expect *#…# MMI). */
export function ussdTelUri(code: string): string {
  return `tel:${code.replace(/#/g, '%23')}`;
}

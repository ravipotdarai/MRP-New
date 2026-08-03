/**
 * Pending Security Center tab when opening Hub → security-center.
 */
export type SecurityCenterTab = 'ADVISOR' | 'ANALYZER' | 'FRAUD' | 'TOOLS';

let pending: SecurityCenterTab | null = null;

export function setSecurityCenterTab(tab: SecurityCenterTab) {
  pending = tab;
}

export function consumeSecurityCenterTab(): SecurityCenterTab | null {
  const t = pending;
  pending = null;
  return t;
}

/** Simple client-side cooldown for RTDB / policy writes. */

const lastAt = new Map<string, number>();

export function allowAction(key: string, cooldownMs: number): boolean {
  const now = Date.now();
  const prev = lastAt.get(key) || 0;
  if (now - prev < cooldownMs) return false;
  lastAt.set(key, now);
  return true;
}

export function remainingCooldownMs(key: string, cooldownMs: number): number {
  const prev = lastAt.get(key) || 0;
  return Math.max(0, cooldownMs - (Date.now() - prev));
}

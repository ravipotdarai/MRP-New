import mrpmModule from '../../shared/hooks/useNativeBridge';
import {normalizeCircle} from './circleInvite';
import type {LocalCircle} from './circleTypes';

type Bridge = {
  getCircleLocalJson?: () => Promise<string>;
  setCircleLocalJson?: (json: string) => Promise<boolean>;
};

function bridge(): Bridge {
  return mrpmModule as unknown as Bridge;
}

export async function loadLocalCircles(): Promise<LocalCircle[]> {
  try {
    const raw = await bridge().getCircleLocalJson?.();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c: any) => c && typeof c.id === 'string' && typeof c.name === 'string')
      .map((c: any) => normalizeCircle(c));
  } catch {
    return [];
  }
}

export async function saveLocalCircles(circles: LocalCircle[]): Promise<void> {
  try {
    const normalized = circles.map(c => normalizeCircle(c));
    await bridge().setCircleLocalJson?.(JSON.stringify(normalized));
  } catch {
    /* ignore — UI still works in-session */
  }
}

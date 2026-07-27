import {DeviceEventEmitter} from 'react-native';

const EVENT = 'mrp.circleInvite';

let pendingCode: string | null = null;
const listeners = new Set<(code: string) => void>();

export function setPendingCircleInvite(code: string) {
  const normalized = code.trim().toUpperCase();
  if (normalized.length < 4) return;
  pendingCode = normalized;
  listeners.forEach(fn => {
    try {
      fn(normalized);
    } catch {
      /* ignore */
    }
  });
  DeviceEventEmitter.emit(EVENT, {code: normalized});
}

export function peekPendingCircleInvite(): string | null {
  return pendingCode;
}

export function consumePendingCircleInvite(): string | null {
  const c = pendingCode;
  pendingCode = null;
  return c;
}

export function subscribeCircleInvite(listener: (code: string) => void): () => void {
  listeners.add(listener);
  const sub = DeviceEventEmitter.addListener(EVENT, (payload: {code?: string}) => {
    if (payload?.code) listener(payload.code);
  });
  return () => {
    listeners.delete(listener);
    sub.remove();
  };
}

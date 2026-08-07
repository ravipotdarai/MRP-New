/** Session-scoped in-memory route cache. */

import type { LatLng, RouteResult } from "./types";

const store = new Map<string, RouteResult>();

function round(n: number, d = 5): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

export function matchCacheKey(points: LatLng[]): string {
  return points.map((p) => `${round(p.lat)},${round(p.lng)}`).join(";");
}

export function pairCacheKey(a: LatLng, b: LatLng): string {
  return `r:${round(a.lat)},${round(a.lng)}>${round(b.lat)},${round(b.lng)}`;
}

export function getCachedRoute(key: string): RouteResult | undefined {
  return store.get(key);
}

export function setCachedRoute(key: string, value: RouteResult): void {
  store.set(key, value);
  if (store.size > 400) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
}

export function clearRouteCache(): void {
  store.clear();
}

/**
 * OSRM public routing provider (match + route).
 * Override base via NEXT_PUBLIC_OSRM_URL.
 */

import { getCachedRoute, matchCacheKey, pairCacheKey, setCachedRoute } from "./route-cache";
import type { LatLng, RouteResult, RoutingProvider } from "./types";

const DEFAULT_BASE = "https://router.project-osrm.org";

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_OSRM_URL || DEFAULT_BASE).replace(/\/$/, "");
}

function coordsPath(points: LatLng[]): string {
  return points.map((p) => `${p.lng},${p.lat}`).join(";");
}

function parseGeoJsonLine(
  geometry: { type?: string; coordinates?: number[][] } | undefined,
): LatLng[] {
  if (!geometry?.coordinates?.length) return [];
  return geometry.coordinates.map((c) => ({ lng: c[0], lat: c[1] }));
}

export class OsrmRoutingProvider implements RoutingProvider {
  readonly id = "osrm";

  async match(points: LatLng[], signal?: AbortSignal): Promise<RouteResult | null> {
    if (points.length < 2) return null;
    const key = `m:${matchCacheKey(points)}`;
    const cached = getCachedRoute(key);
    if (cached) return cached;

    const url =
      `${baseUrl()}/match/v1/driving/${coordsPath(points)}` +
      `?overview=full&geometries=geojson&tidy=true&gaps=ignore`;

    try {
      const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        code?: string;
        matchings?: Array<{
          distance?: number;
          geometry?: { type?: string; coordinates?: number[][] };
        }>;
      };
      if (body.code !== "Ok" || !body.matchings?.length) return null;

      const coordinates: LatLng[] = [];
      let distanceM = 0;
      for (const m of body.matchings) {
        coordinates.push(...parseGeoJsonLine(m.geometry));
        distanceM += m.distance || 0;
      }
      if (coordinates.length < 2) return null;
      const result: RouteResult = { coordinates, distanceM, provider: this.id };
      setCachedRoute(key, result);
      return result;
    } catch {
      return null;
    }
  }

  async route(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<RouteResult | null> {
    const key = pairCacheKey(from, to);
    const cached = getCachedRoute(key);
    if (cached) return cached;

    const url =
      `${baseUrl()}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson`;

    try {
      const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        code?: string;
        routes?: Array<{
          distance?: number;
          geometry?: { type?: string; coordinates?: number[][] };
        }>;
      };
      if (body.code !== "Ok" || !body.routes?.[0]) return null;
      const r = body.routes[0];
      const coordinates = parseGeoJsonLine(r.geometry);
      if (coordinates.length < 2) return null;
      const result: RouteResult = {
        coordinates,
        distanceM: r.distance || 0,
        provider: this.id,
      };
      setCachedRoute(key, result);
      return result;
    } catch {
      return null;
    }
  }
}

let defaultProvider: RoutingProvider | null = null;

export function getDefaultRoutingProvider(): RoutingProvider {
  if (!defaultProvider) defaultProvider = new OsrmRoutingProvider();
  return defaultProvider;
}

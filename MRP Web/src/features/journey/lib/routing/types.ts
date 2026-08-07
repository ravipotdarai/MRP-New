/** Routing provider abstraction for road-snapped journey paths. */

export type LatLng = { lat: number; lng: number };

export type RouteLeg = {
  coordinates: LatLng[];
  distanceM: number;
  durationS: number;
};

export type RouteResult = {
  coordinates: LatLng[];
  distanceM: number;
  provider: string;
};

export interface RoutingProvider {
  readonly id: string;
  /** Snap a GPS trace to the road network (preferred). */
  match(points: LatLng[], signal?: AbortSignal): Promise<RouteResult | null>;
  /** Route between two points (fallback). */
  route(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<RouteResult | null>;
}

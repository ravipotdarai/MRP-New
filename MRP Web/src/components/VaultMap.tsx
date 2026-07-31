"use client";

import { InteractiveMap } from "@/components/InteractiveMap";

/**
 * Single-point map for live location — MapLibre under the hood.
 */
export function VaultMap({
  lat,
  lng,
  height = 280,
}: {
  lat: number;
  lng: number;
  height?: number;
}) {
  return (
    <InteractiveMap
      center={{ lat, lng }}
      height={height}
      markers={[{ lat, lng, id: "live", color: "#d4a017" }]}
    />
  );
}

"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapPoint = { lat: number; lng: number; id?: string; color?: string };

type Props = {
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: number;
  markers?: MapPoint[];
  polyline?: Array<{ lat: number; lng: number }>;
  geofences?: Array<{
    id?: string;
    lat: number;
    lng: number;
    radiusMeters: number;
    name?: string;
  }>;
  onMarkerClick?: (id: string | undefined, lat: number, lng: number) => void;
};

const STYLE = "https://demotiles.maplibre.org/style.json";

export function InteractiveMap({
  center,
  zoom = 13,
  height = 320,
  markers = [],
  polyline = [],
  geofences = [],
  onMarkerClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const c = center || markers[0] || { lat: 18.52, lng: 73.85 };
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [c.lng, c.lat],
      zoom,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const resize = () => map.resize();
    window.addEventListener("orientationchange", resize);
    window.visualViewport?.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("orientationchange", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const p of markers) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "map-marker-dot";
      el.style.background = p.color || "var(--signal)";
      el.setAttribute("aria-label", "Map marker");
      el.addEventListener("click", () => onMarkerClick?.(p.id, p.lat, p.lng));
      const marker = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
      markersRef.current.push(marker);
    }

    const drawOverlays = () => {
      const removeIf = (layer: string, source: string) => {
        try {
          if (map.getLayer(layer)) map.removeLayer(layer);
          if (map.getSource(source)) map.removeSource(source);
        } catch {
          /* style not ready */
        }
      };
      removeIf("travel-line-layer", "travel-line");
      if (polyline.length >= 2) {
        map.addSource("travel-line", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: polyline.map((p) => [p.lng, p.lat]),
            },
          },
        });
        map.addLayer({
          id: "travel-line-layer",
          type: "line",
          source: "travel-line",
          paint: {
            "line-color": "#d4a017",
            "line-width": 3,
            "line-opacity": 0.85,
          },
        });
      }

      for (let i = 0; i < 32; i++) {
        try {
          if (map.getLayer(`gf-${i}-fill`)) map.removeLayer(`gf-${i}-fill`);
          if (map.getLayer(`gf-${i}-line`)) map.removeLayer(`gf-${i}-line`);
          if (map.getSource(`gf-${i}`)) map.removeSource(`gf-${i}`);
        } catch {
          /* ignore */
        }
      }
      for (let i = 0; i < geofences.length; i++) {
        const g = geofences[i];
        const sid = `gf-${i}`;
        const coords = circlePolygon(g.lng, g.lat, g.radiusMeters);
        map.addSource(sid, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: { name: g.name || "" },
            geometry: { type: "Polygon", coordinates: [coords] },
          },
        });
        map.addLayer({
          id: `${sid}-fill`,
          type: "fill",
          source: sid,
          paint: { "fill-color": "#3d9b6a", "fill-opacity": 0.15 },
        });
        map.addLayer({
          id: `${sid}-line`,
          type: "line",
          source: sid,
          paint: { "line-color": "#3d9b6a", "line-width": 2 },
        });
      }

      if (center) {
        map.easeTo({ center: [center.lng, center.lat], duration: 400 });
      } else if (polyline.length) {
        const bounds = new maplibregl.LngLatBounds();
        polyline.forEach((p) => bounds.extend([p.lng, p.lat]));
        map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
      } else if (markers.length) {
        map.easeTo({ center: [markers[0].lng, markers[0].lat], duration: 400 });
      }
    };

    if (map.isStyleLoaded()) drawOverlays();
    else map.once("load", drawOverlays);
  }, [markers, polyline, geofences, center, onMarkerClick]);

  const fallback =
    center || markers[0] || (polyline[0] ? { lat: polyline[0].lat, lng: polyline[0].lng } : null);

  return (
    <div className="interactive-map sensitive-surface">
      <div ref={containerRef} style={{ width: "100%", height, borderRadius: "var(--radius)" }} />
      {fallback ? (
        <a
          className="btn"
          style={{ marginTop: "0.5rem", display: "inline-flex" }}
          href={`https://www.google.com/maps?q=${fallback.lat},${fallback.lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Google Maps
        </a>
      ) : (
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          No coordinates yet — unlock vault or enable Find my device on the phone.
        </p>
      )}
    </div>
  );
}

function circlePolygon(lng: number, lat: number, radiusM: number, steps = 64): number[][] {
  const coords: number[][] = [];
  const R = 6378137;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    const dx = radiusM * Math.cos(theta);
    const dy = radiusM * Math.sin(theta);
    const dLat = dy / R;
    const dLng = dx / (R * Math.cos((lat * Math.PI) / 180));
    coords.push([lng + (dLng * 180) / Math.PI, lat + (dLat * 180) / Math.PI]);
  }
  return coords;
}

/** Keep simple point map for pages that only need one pin without MapLibre cost — re-exports InteractiveMap. */
export { InteractiveMap as VaultMap };

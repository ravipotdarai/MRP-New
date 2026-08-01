"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map, Marker, StyleSpecification } from "maplibre-gl";
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

/** Real street tiles — demotiles.maplibre.org is a blank demo globe (no roads at city zoom). */
const MAP_STYLE: StyleSpecification = {
  version: 8,
  name: "PathSync OSM",
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
    },
  ],
};

function cssToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

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
      style: MAP_STYLE,
      center: [c.lng, c.lat],
      zoom,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const resize = () => {
      try {
        map.resize();
      } catch {
        /* disposed */
      }
    };
    // Ensure tiles paint after layout (hidden tabs / grid cards).
    requestAnimationFrame(resize);
    const t = window.setTimeout(resize, 120);
    window.addEventListener("orientationchange", resize);
    window.visualViewport?.addEventListener("resize", resize);

    return () => {
      window.clearTimeout(t);
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
      map.resize();
      const removeIf = (layer: string, source: string) => {
        try {
          if (map.getLayer(layer)) map.removeLayer(layer);
          if (map.getSource(source)) map.removeSource(source);
        } catch {
          /* style not ready */
        }
      };
      removeIf("travel-line-layer", "travel-line");
      const routeColor = cssToken("--signal", "#d4a017");
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
            "line-color": routeColor,
            "line-width": 4,
            "line-opacity": 0.9,
          },
        });
      }

      const fenceColor = cssToken("--safe", "#3d9b6a");
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
          paint: { "fill-color": fenceColor, "fill-opacity": 0.15 },
        });
        map.addLayer({
          id: `${sid}-line`,
          type: "line",
          source: sid,
          paint: { "line-color": fenceColor, "line-width": 2 },
        });
      }

      if (polyline.length >= 2) {
        const bounds = new maplibregl.LngLatBounds();
        polyline.forEach((p) => bounds.extend([p.lng, p.lat]));
        if (center) bounds.extend([center.lng, center.lat]);
        map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 400 });
      } else if (center) {
        map.easeTo({ center: [center.lng, center.lat], duration: 400 });
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
      <div ref={containerRef} className="map-canvas" style={{ height }} />
      {fallback ? (
        <a
          className="btn mt-sm"
          href={`https://www.google.com/maps?q=${fallback.lat},${fallback.lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Google Maps
        </a>
      ) : (
        <p className="muted mt-sm">No coordinates yet — unlock session or use Find my device on the phone.</p>
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

export { InteractiveMap as VaultMap };

"use client";

import { useEffect, useMemo, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map, Marker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { googleMapsOpenUrl } from "@/lib/google-maps-url";

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
    /** Emphasize this zone (thicker outline / stronger fill). */
    highlight?: boolean;
  }>;
  onMarkerClick?: (id: string | undefined, lat: number, lng: number) => void;
  pathColor?: string;
};

const MAP_STYLE: StyleSpecification = {
  version: 8,
  name: "PathSync Streets",
  sources: {
    esri: {
      type: "raster",
      // Public Esri street tiles — no Google/Carto API key.
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Esri",
      maxzoom: 19,
    },
  },
  layers: [{ id: "esri", type: "raster", source: "esri" }],
};

const PATH_COLOR_DEFAULT = "#e85d04";
const PATH_CASING = "#fff7ed";
const GF_FILL = "#0d9488";
const GF_LINE = "#115e59";
const GF_FILL_HI = "#f59e0b";
const GF_LINE_HI = "#b45309";

/** Closed ring approx. for a geodesic circle (meters). */
function circlePolygon(lng: number, lat: number, radiusM: number, steps = 72): number[][] {
  const R = 6378137;
  const latRad = (lat * Math.PI) / 180;
  const coords: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const angDist = radiusM / R;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(angDist) + Math.cos(latRad) * Math.sin(angDist) * Math.cos(bearing),
    );
    const lng2 =
      ((lng * Math.PI) / 180) +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angDist) * Math.cos(latRad),
        Math.cos(angDist) - Math.sin(latRad) * Math.sin(lat2),
      );
    coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return coords;
}

function fencesToFeatureCollection(
  geofences: NonNullable<Props["geofences"]>,
): {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { name: string; id: string; highlight: number };
    geometry: { type: "Polygon"; coordinates: number[][][] };
  }>;
} {
  return {
    type: "FeatureCollection",
    features: geofences
      .filter((g) => Number.isFinite(g.lat) && Number.isFinite(g.lng) && (g.radiusMeters || 0) > 0)
      .map((g) => ({
        type: "Feature" as const,
        properties: {
          name: g.name || "",
          id: g.id || "",
          highlight: g.highlight ? 1 : 0,
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: [circlePolygon(g.lng, g.lat, Math.max(15, g.radiusMeters))],
        },
      })),
  };
}

export function InteractiveMap({
  center,
  zoom = 13,
  height = 320,
  markers = [],
  polyline = [],
  geofences = [],
  onMarkerClick,
  pathColor = PATH_COLOR_DEFAULT,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const fittedPathRef = useRef(false);
  const fittedFenceRef = useRef("");
  const pathSigRef = useRef("");
  const onClickRef = useRef(onMarkerClick);
  onClickRef.current = onMarkerClick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const c = center || markers[0] || polyline[0] || geofences[0] || { lat: 18.52, lng: 73.85 };
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
    requestAnimationFrame(resize);
    const t = window.setTimeout(resize, 150);
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
      fittedPathRef.current = false;
      fittedFenceRef.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, []);

  // Route line + geofence polygons
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.isStyleLoaded()) return;
      try {
        map.resize();
      } catch {
        return;
      }

      const coords = polyline
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map((p) => [p.lng, p.lat] as [number, number]);
      const sig =
        coords.length < 2
          ? ""
          : `${coords.length}:${coords[0][0]},${coords[0][1]}:${coords[coords.length - 1][0]},${coords[coords.length - 1][1]}`;
      if (sig !== pathSigRef.current) {
        pathSigRef.current = sig;
        fittedPathRef.current = false;
      }
      const lineFc = {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: coords.length >= 2 ? coords : ([] as [number, number][]),
        },
      };

      if (coords.length < 2) {
        try {
          if (map.getLayer("travel-line-layer")) map.removeLayer("travel-line-layer");
          if (map.getLayer("travel-line-casing")) map.removeLayer("travel-line-casing");
          if (map.getSource("travel-line")) map.removeSource("travel-line");
        } catch {
          /* ignore */
        }
        fittedPathRef.current = false;
      } else if (map.getSource("travel-line")) {
        (map.getSource("travel-line") as GeoJSONSource).setData(lineFc);
      } else {
        map.addSource("travel-line", { type: "geojson", data: lineFc });
        map.addLayer({
          id: "travel-line-casing",
          type: "line",
          source: "travel-line",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": PATH_CASING, "line-width": 9, "line-opacity": 0.95 },
        });
        map.addLayer({
          id: "travel-line-layer",
          type: "line",
          source: "travel-line",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": pathColor, "line-width": 5, "line-opacity": 1 },
        });
      }

      if (coords.length >= 2 && !fittedPathRef.current) {
        const bounds = new maplibregl.LngLatBounds();
        coords.forEach((c) => bounds.extend(c));
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 700 });
          fittedPathRef.current = true;
        }
      }

      // Remove legacy per-index sources if any remain
      for (let i = 0; i < 32; i++) {
        try {
          if (map.getLayer(`gf-${i}-fill`)) map.removeLayer(`gf-${i}-fill`);
          if (map.getLayer(`gf-${i}-line`)) map.removeLayer(`gf-${i}-line`);
          if (map.getSource(`gf-${i}`)) map.removeSource(`gf-${i}`);
        } catch {
          /* ignore */
        }
      }

      const fenceFc = fencesToFeatureCollection(geofences);
      const ensureFenceLayers = () => {
        if (!map.getSource("geofence-circles")) return;
        if (!map.getLayer("geofence-fill")) {
          map.addLayer({
            id: "geofence-fill",
            type: "fill",
            source: "geofence-circles",
            paint: {
              "fill-color": [
                "case",
                ["==", ["get", "highlight"], 1],
                GF_FILL_HI,
                GF_FILL,
              ],
              "fill-opacity": [
                "case",
                ["==", ["get", "highlight"], 1],
                0.45,
                0.32,
              ],
            },
          });
        }
        if (!map.getLayer("geofence-outline")) {
          map.addLayer({
            id: "geofence-outline",
            type: "line",
            source: "geofence-circles",
            paint: {
              "line-color": [
                "case",
                ["==", ["get", "highlight"], 1],
                GF_LINE_HI,
                GF_LINE,
              ],
              "line-width": [
                "case",
                ["==", ["get", "highlight"], 1],
                4.5,
                3,
              ],
              "line-opacity": 1,
            },
          });
        }
      };

      if (!fenceFc.features.length) {
        try {
          if (map.getLayer("geofence-outline")) map.removeLayer("geofence-outline");
          if (map.getLayer("geofence-fill")) map.removeLayer("geofence-fill");
          if (map.getSource("geofence-circles")) map.removeSource("geofence-circles");
        } catch {
          /* ignore */
        }
        fittedFenceRef.current = "";
      } else {
        try {
          if (map.getSource("geofence-circles")) {
            (map.getSource("geofence-circles") as GeoJSONSource).setData(fenceFc);
          } else {
            map.addSource("geofence-circles", { type: "geojson", data: fenceFc });
          }
          ensureFenceLayers();
        } catch {
          /* style not ready — retries below */
        }

        if (coords.length < 2) {
          // Fit camera to all circles when not following a travel path / playhead.
          const fenceSig = fenceFc.features
            .map((f) => {
              const ring = f.geometry.coordinates[0] || [];
              return `${f.properties.id}:${f.properties.highlight}:${ring[0]?.join(",")}:${ring.length}`;
            })
            .join("|");
          if (fenceSig !== fittedFenceRef.current) {
            const highlighted = fenceFc.features.filter((f) => f.properties.highlight === 1);
            const fitFeatures = highlighted.length ? highlighted : fenceFc.features;
            const bounds = new maplibregl.LngLatBounds();
            for (const f of fitFeatures) {
              const ring = f.geometry.coordinates[0] || [];
              for (const c of ring) bounds.extend(c as [number, number]);
            }
            // Only frame the zones we're fitting (selected highlight, or all).
            const fitIds = new Set(fitFeatures.map((f) => f.properties.id));
            for (const g of geofences) {
              if (!Number.isFinite(g.lat) || !Number.isFinite(g.lng)) continue;
              if (highlighted.length && g.id && !fitIds.has(g.id) && !g.highlight) continue;
              if (!highlighted.length || g.highlight || (g.id && fitIds.has(g.id))) {
                bounds.extend([g.lng, g.lat]);
              }
            }
            if (!bounds.isEmpty()) {
              map.fitBounds(bounds, {
                padding: 72,
                maxZoom: highlighted.length ? 16 : 14,
                duration: 650,
              });
              fittedFenceRef.current = fenceSig;
            }
          }
        }
      }
    };

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      apply();
    };

    if (map.isStyleLoaded()) {
      run();
    } else {
      map.once("load", run);
    }
    map.once("idle", run);
    // Retry — inline styles can report loaded before layers accept addLayer.
    const t1 = window.setTimeout(run, 80);
    const t2 = window.setTimeout(run, 320);
    const t3 = window.setTimeout(run, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      map.off("load", run);
      map.off("idle", run);
    };
  }, [polyline, geofences, pathColor, center]);

  // Markers + camera follow
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const p of markers) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "map-marker-dot";
      el.style.background = p.color || pathColor;
      el.setAttribute("aria-label", "Map marker");
      el.addEventListener("click", () => onClickRef.current?.(p.id, p.lat, p.lng));
      markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
    }

    if (center) {
      const opts: maplibregl.EaseToOptions = {
        center: [center.lng, center.lat],
        duration: 550,
        essential: true,
      };
      if (typeof zoom === "number") opts.zoom = zoom;
      map.easeTo(opts);
    } else if (markers[0] && polyline.length < 2 && geofences.length === 0) {
      map.easeTo({ center: [markers[0].lng, markers[0].lat], duration: 500, essential: true });
    }
  }, [markers, center, pathColor, polyline.length, zoom, geofences.length]);

  const fallback =
    center || markers[0] || (polyline[0] ? { lat: polyline[0].lat, lng: polyline[0].lng } : null);

  const gmapsHref = useMemo(
    () =>
      googleMapsOpenUrl({
        point: fallback,
        path: polyline.length >= 2 ? polyline : undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lat/lng + path length
    [fallback?.lat, fallback?.lng, polyline],
  );

  return (
    <div className="interactive-map sensitive-surface">
      <div ref={containerRef} className="map-canvas" style={{ height }} />
      {fallback ? (
        <a
          className="btn btn-sm map-gmaps-btn"
          href={gmapsHref}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Google Maps
        </a>
      ) : (
        <p className="muted map-empty-hint">No coordinates yet — unlock session or use Find my device on the phone.</p>
      )}
    </div>
  );
}

export { InteractiveMap as VaultMap };

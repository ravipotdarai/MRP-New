"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GpsPoint, InterpolatedPose } from "../types";
import type { HeatCell } from "../lib/journey-heatmap";
import type { JourneyStop } from "../lib/journey-heuristics";
import { loadGoogleMaps } from "../lib/load-google-maps";
import {
  flattenRoadLegs,
  resolvePathDisplay,
  TRAIL_STYLE,
} from "../lib/journey-map-paths";
import type { FenceCircle, PathMode } from "./journey-map-types";
import { MapToolbar } from "./MapToolbar";

function addCasedPolylines(
  g: typeof google,
  map: google.maps.Map,
  legs: [number, number][][],
  style: { color: string; weight: number; opacity: number; dashArray?: string },
  bucket: google.maps.Polyline[],
  zBase: number,
) {
  for (const leg of legs) {
    if (leg.length < 2) continue;
    const path = toLatLngs(leg);
    if (!style.dashArray) {
      bucket.push(
        new g.maps.Polyline({
          path,
          strokeColor: TRAIL_STYLE.casing.color,
          strokeOpacity: TRAIL_STYLE.casing.opacity,
          strokeWeight: style.weight + 4,
          map,
          zIndex: zBase,
        }),
      );
    }
    bucket.push(
      new g.maps.Polyline({
        path,
        strokeColor: style.color,
        strokeOpacity: style.opacity,
        strokeWeight: style.weight,
        map,
        zIndex: zBase + 1,
      }),
    );
  }
}

type Props = {
  points: GpsPoint[];
  pose: InterpolatedPose | null;
  fences?: FenceCircle[];
  follow?: boolean;
  onFollowChange?: (v: boolean) => void;
  className?: string;
  mediaMarkers?: Array<{ id: string; lat: number; lng: number; t: number }>;
  heatCells?: HeatCell[];
  stops?: JourneyStop[];
  showHeatmap?: boolean;
  roadPath?: [number, number][];
  pathLegs?: [number, number][][];
  routing?: boolean;
  pathMode?: PathMode;
  onPathModeChange?: (m: PathMode) => void;
  eventMarkers?: Array<{ id: string; lat: number; lng: number; t?: number; label?: string }>;
  showControls?: boolean;
  /** Called when Maps API key/billing fails so the host can fall back to OSM. */
  onFatalError?: (message: string) => void;
};

function toLatLngs(path: [number, number][]): google.maps.LatLngLiteral[] {
  return path.map(([lat, lng]) => ({ lat, lng }));
}

function clearOverlays(items: Array<{ setMap: (m: null) => void } | null | undefined>) {
  for (const item of items) item?.setMap(null);
}

export function GoogleJourneyMap({
  points,
  pose,
  fences = [],
  follow = true,
  onFollowChange,
  className,
  mediaMarkers = [],
  heatCells = [],
  stops = [],
  showHeatmap = false,
  roadPath,
  pathLegs,
  routing = false,
  pathMode: pathModeProp,
  onPathModeChange,
  eventMarkers = [],
  showControls = true,
  onFatalError,
}: Props) {
  const [pathModeLocal, setPathModeLocal] = useState<PathMode>("gps");
  const pathMode = pathModeProp ?? pathModeLocal;
  const setPathMode = onPathModeChange ?? setPathModeLocal;
  const [fitKey, setFitKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const layersRef = useRef<{
    lines: google.maps.Polyline[];
    circles: google.maps.Circle[];
    markers: google.maps.Marker[];
    vehicle?: google.maps.Marker;
    accuracy?: google.maps.Circle;
  }>({ lines: [], circles: [], markers: [] });

  const gpsPath = useMemo(
    (): [number, number][] => points.map((p) => [p.lat, p.lng]),
    [points],
  );
  const roadLegs = useMemo((): [number, number][][] => {
    if (pathLegs?.length) return pathLegs;
    if (roadPath && roadPath.length >= 2) return [roadPath];
    return [];
  }, [pathLegs, roadPath]);
  const roadFlat = useMemo(() => flattenRoadLegs(roadLegs), [roadLegs]);

  const {
    showGps,
    showRoads,
    hasRoads,
    fullPath,
    completedLegs,
    remainingLegs,
    gpsLegs,
    fitPoints,
  } = useMemo(
    () => resolvePathDisplay(pathMode, gpsPath, roadFlat, points, pose),
    [pathMode, gpsPath, roadFlat, points, pose],
  );

  const startPt = fullPath[0] || gpsPath[0];
  const endPt = fullPath[fullPath.length - 1] || gpsPath[gpsPath.length - 1];

  const center = useMemo((): google.maps.LatLngLiteral => {
    if (pose) return { lat: pose.lat, lng: pose.lng };
    if (fullPath.length) return { lat: fullPath[0][0], lng: fullPath[0][1] };
    if (points[0]) return { lat: points[0].lat, lng: points[0].lng };
    return { lat: 20, lng: 0 };
  }, [pose, fullPath, points]);

  useEffect(() => {
    let cancelled = false;
    let errPoll: number | undefined;

    void loadGoogleMaps()
      .then((g) => {
        if (cancelled || !hostRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new g.maps.Map(hostRef.current, {
            center,
            zoom: fullPath.length || points.length ? 14 : 2,
            mapTypeControl: true,
            mapTypeControlOptions: {
              style: g.maps.MapTypeControlStyle.DROPDOWN_MENU,
              position: g.maps.ControlPosition.TOP_LEFT,
            },
            streetViewControl: true,
            streetViewControlOptions: {
              position: g.maps.ControlPosition.RIGHT_BOTTOM,
            },
            fullscreenControl: true,
            zoomControl: true,
            scaleControl: true,
            rotateControl: true,
            gestureHandling: "greedy",
            clickableIcons: true,
          });
        }
        setReady(true);
        setLoadError(null);

        // Auth/billing failures often still construct Map, then inject .gm-err-container.
        let checks = 0;
        errPoll = window.setInterval(() => {
          checks += 1;
          const broken = Boolean(hostRef.current?.querySelector(".gm-err-container"));
          if (broken) {
            window.clearInterval(errPoll);
            const msg = "Google Maps failed to authenticate — using OpenStreetMap";
            setLoadError(msg);
            onFatalError?.(msg);
          } else if (checks >= 20) {
            window.clearInterval(errPoll);
          }
        }, 250);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Google Maps failed";
        setLoadError(msg);
        onFatalError?.(msg);
      });
    return () => {
      cancelled = true;
      if (errPoll) window.clearInterval(errPoll);
    };
    // init once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !window.google?.maps) return;
    const g = window.google;
    const L = layersRef.current;

    clearOverlays([...L.lines, ...L.circles, ...L.markers, L.vehicle, L.accuracy]);
    L.lines = [];
    L.circles = [];
    L.markers = [];
    L.vehicle = L.accuracy = undefined;

    if (showGps && pathMode === "both") {
      addCasedPolylines(g, map, gpsLegs, TRAIL_STYLE.gpsBoth, L.lines, 2);
    } else if (showGps && pathMode === "gps" && !pose) {
      addCasedPolylines(g, map, gpsLegs, TRAIL_STYLE.stroke, L.lines, 2);
    } else if (showGps && pathMode === "gps" && pose) {
      addCasedPolylines(g, map, remainingLegs, TRAIL_STYLE.remaining, L.lines, 2);
      addCasedPolylines(g, map, completedLegs, TRAIL_STYLE.stroke, L.lines, 4);
    } else if (showGps && pathMode === "roads" && !showRoads) {
      addCasedPolylines(g, map, gpsLegs, TRAIL_STYLE.stroke, L.lines, 2);
    }

    if (showRoads && !pose) {
      addCasedPolylines(
        g,
        map,
        roadLegs,
        {
          ...TRAIL_STYLE.roads,
          weight: pathMode === "both" ? 4 : TRAIL_STYLE.roads.weight,
          opacity: pathMode === "both" ? 0.8 : TRAIL_STYLE.roads.opacity,
        },
        L.lines,
        6,
      );
    } else if (showRoads && pose && pathMode === "roads") {
      addCasedPolylines(g, map, remainingLegs, TRAIL_STYLE.remaining, L.lines, 6);
      addCasedPolylines(g, map, completedLegs, TRAIL_STYLE.roads, L.lines, 8);
    }

    if (startPt) {
      L.markers.push(
        new g.maps.Marker({
          position: { lat: startPt[0], lng: startPt[1] },
          map,
          title: "Start",
          label: { text: "A", color: "#fff", fontWeight: "700" },
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#16a34a",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
          zIndex: 900,
        }),
      );
    }
    if (endPt && (endPt[0] !== startPt?.[0] || endPt[1] !== startPt?.[1])) {
      L.markers.push(
        new g.maps.Marker({
          position: { lat: endPt[0], lng: endPt[1] },
          map,
          title: "End",
          label: { text: "B", color: "#fff", fontWeight: "700" },
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#dc2626",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
          zIndex: 900,
        }),
      );
    }

    if (showHeatmap) {
      for (const c of heatCells) {
        L.circles.push(
          new g.maps.Circle({
            center: { lat: c.lat, lng: c.lng },
            radius: 8 + c.intensity * 40,
            strokeWeight: 0,
            fillColor: "#f97316",
            fillOpacity: 0.15 + c.intensity * 0.45,
            map,
          }),
        );
      }
    }

    for (const s of stops) {
      L.markers.push(
        new g.maps.Marker({
          position: { lat: s.lat, lng: s.lng },
          map,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#3b82f6",
            fillOpacity: 0.9,
            strokeColor: "#1e40af",
            strokeWeight: 2,
          },
        }),
      );
    }

    for (const f of fences) {
      L.circles.push(
        new g.maps.Circle({
          center: { lat: f.lat, lng: f.lng },
          radius: f.radiusMeters,
          strokeColor: "#0d9488",
          strokeWeight: 2,
          fillColor: "#0d9488",
          fillOpacity: 0.18,
          map,
        }),
      );
    }

    for (const m of mediaMarkers) {
      L.markers.push(
        new g.maps.Marker({
          position: { lat: m.lat, lng: m.lng },
          map,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: "#a78bfa",
            fillOpacity: 0.95,
            strokeColor: "#7c3aed",
            strokeWeight: 2,
          },
        }),
      );
    }

    for (const m of eventMarkers) {
      L.markers.push(
        new g.maps.Marker({
          position: { lat: m.lat, lng: m.lng },
          map,
          title: m.label,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: "#f59e0b",
            fillOpacity: 0.95,
            strokeColor: "#b45309",
            strokeWeight: 2,
          },
        }),
      );
    }

    if (pose) {
      if (pose.accuracy > 0) {
        L.accuracy = new g.maps.Circle({
          center: { lat: pose.lat, lng: pose.lng },
          radius: Math.min(pose.accuracy, 80),
          strokeColor: "#0ea5e9",
          strokeWeight: 1,
          fillColor: "#0ea5e9",
          fillOpacity: 0.06,
          map,
        });
      }
      L.vehicle = new g.maps.Marker({
        position: { lat: pose.lat, lng: pose.lng },
        map,
        zIndex: 1000,
        icon: {
          path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          rotation: pose.heading,
          fillColor: "#f59e0b",
          fillOpacity: 1,
          strokeColor: "#78350f",
          strokeWeight: 1,
        },
      });
    }
  }, [
    ready,
    showGps,
    showRoads,
    pathMode,
    gpsLegs,
    roadLegs,
    completedLegs,
    remainingLegs,
    startPt,
    endPt,
    pose,
    fences,
    mediaMarkers,
    eventMarkers,
    stops,
    heatCells,
    showHeatmap,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !follow || !pose) return;
    map.panTo({ lat: pose.lat, lng: pose.lng });
  }, [ready, follow, pose?.lat, pose?.lng, pose]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !window.google?.maps) return;
    const path = fitPoints.length >= 2 ? fitPoints : gpsPath;
    if (path.length < 2) return;
    const bounds = new window.google.maps.LatLngBounds();
    for (const [lat, lng] of path) bounds.extend({ lat, lng });
    map.fitBounds(bounds, 56);
  }, [ready, fitKey, fitPoints, gpsPath]);

  return (
    <div
      className={`jpni-map-wrap interactive-map ${className || ""}`}
      style={{ height: "100%", minHeight: 420, width: "100%", position: "relative" }}
    >
      {routing && <div className="jpni-routing-badge muted">Snapping route to roads…</div>}
      {loadError ? (
        <div className="jpni-routing-badge muted" style={{ top: 48 }}>
          {loadError}
        </div>
      ) : null}
      {showControls ? (
        <MapToolbar
          onFit={() => setFitKey((k) => k + 1)}
          follow={follow}
          onFollowChange={onFollowChange}
          pathMode={pathMode}
          onPathModeChange={setPathMode}
          routing={routing}
          hasRoads={hasRoads}
          mapEngine="google"
        />
      ) : null}
      <div
        ref={hostRef}
        className="jpni-gmap-host"
        style={{ height: "100%", minHeight: 420, width: "100%", borderRadius: 12 }}
      />
      {!ready && !loadError ? (
        <div className="jpni-map-loading muted">Loading Google Maps…</div>
      ) : null}
    </div>
  );
}

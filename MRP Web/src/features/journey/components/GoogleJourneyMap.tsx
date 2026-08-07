"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GpsPoint, InterpolatedPose } from "../types";
import type { HeatCell } from "../lib/journey-heatmap";
import type { JourneyStop } from "../lib/journey-heuristics";
import { loadGoogleMaps } from "../lib/load-google-maps";
import { flattenRoadLegs, resolvePathDisplay } from "../lib/journey-map-paths";
import type { FenceCircle, PathMode } from "./journey-map-types";
import { MapToolbar } from "./MapToolbar";

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
  const [pathModeLocal, setPathModeLocal] = useState<PathMode>("roads");
  const pathMode = pathModeProp ?? pathModeLocal;
  const setPathMode = onPathModeChange ?? setPathModeLocal;
  const [fitKey, setFitKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const layersRef = useRef<{
    gps?: google.maps.Polyline;
    gpsDone?: google.maps.Polyline;
    gpsRest?: google.maps.Polyline;
    roadDone?: google.maps.Polyline;
    roadRest?: google.maps.Polyline;
    roadLegs: google.maps.Polyline[];
    circles: google.maps.Circle[];
    markers: google.maps.Marker[];
    vehicle?: google.maps.Marker;
    accuracy?: google.maps.Circle;
  }>({ roadLegs: [], circles: [], markers: [] });

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

  const { showGps, showRoads, hasRoads, fullPath, completed, remaining } = useMemo(
    () => resolvePathDisplay(pathMode, gpsPath, roadFlat, points, pose),
    [pathMode, gpsPath, roadFlat, points, pose],
  );

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

    clearOverlays([
      L.gps,
      L.gpsDone,
      L.gpsRest,
      L.roadDone,
      L.roadRest,
      ...L.roadLegs,
      ...L.circles,
      ...L.markers,
      L.vehicle,
      L.accuracy,
    ]);
    L.roadLegs = [];
    L.circles = [];
    L.markers = [];
    L.gps = L.gpsDone = L.gpsRest = L.roadDone = L.roadRest = L.vehicle = L.accuracy = undefined;

    if (showGps && pathMode === "both" && gpsPath.length > 1) {
      L.gps = new g.maps.Polyline({
        path: toLatLngs(gpsPath),
        strokeColor: "#0d9488",
        strokeOpacity: 0.35,
        strokeWeight: 3,
        map,
        zIndex: 1,
      });
    } else if (showGps && pathMode === "gps" && !pose && gpsPath.length > 1) {
      L.gps = new g.maps.Polyline({
        path: toLatLngs(gpsPath),
        strokeColor: "#0d9488",
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map,
        zIndex: 2,
      });
    } else if (showGps && pathMode === "gps" && pose) {
      if (remaining.length > 1) {
        L.gpsRest = new g.maps.Polyline({
          path: toLatLngs(remaining),
          strokeColor: "#94a3b8",
          strokeOpacity: 0.5,
          strokeWeight: 5,
          map,
          zIndex: 2,
        });
      }
      if (completed.length > 1) {
        L.gpsDone = new g.maps.Polyline({
          path: toLatLngs(completed),
          strokeColor: "#0d9488",
          strokeOpacity: 0.95,
          strokeWeight: 6,
          map,
          zIndex: 3,
        });
      }
    } else if (showGps && pathMode === "roads" && !showRoads && gpsPath.length > 1) {
      L.gps = new g.maps.Polyline({
        path: toLatLngs(gpsPath),
        strokeColor: "#0d9488",
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map,
        zIndex: 2,
      });
    }

    if (showRoads) {
      if (!pose) {
        for (const leg of roadLegs) {
          if (leg.length < 2) continue;
          L.roadLegs.push(
            new g.maps.Polyline({
              path: toLatLngs(leg),
              strokeColor: "#e85d04",
              strokeOpacity: pathMode === "both" ? 0.75 : 0.95,
              strokeWeight: pathMode === "both" ? 4 : 6,
              map,
              zIndex: 4,
            }),
          );
        }
      } else {
        if (remaining.length > 1) {
          L.roadRest = new g.maps.Polyline({
            path: toLatLngs(remaining),
            strokeColor: "#94a3b8",
            strokeOpacity: 0.55,
            strokeWeight: 5,
            map,
            zIndex: 4,
          });
        }
        if (completed.length > 1) {
          L.roadDone = new g.maps.Polyline({
            path: toLatLngs(completed),
            strokeColor: "#e85d04",
            strokeOpacity: 0.95,
            strokeWeight: 6,
            map,
            zIndex: 5,
          });
        }
      }
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
          scale: 5,
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
    gpsPath,
    roadLegs,
    completed,
    remaining,
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
    const path = fullPath.length >= 2 ? fullPath : gpsPath;
    if (path.length < 2) return;
    const bounds = new window.google.maps.LatLngBounds();
    for (const [lat, lng] of path) bounds.extend({ lat, lng });
    map.fitBounds(bounds, 48);
  }, [ready, fitKey, fullPath, gpsPath]);

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

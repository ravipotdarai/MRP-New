"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet";
import type { GpsPoint, InterpolatedPose } from "../types";
import type { HeatCell } from "../lib/journey-heatmap";
import type { JourneyStop } from "../lib/journey-heuristics";
import { hasGoogleMapsApiKey } from "../lib/google-maps-key";
import { flattenRoadLegs, resolvePathDisplay } from "../lib/journey-map-paths";
import type { FenceCircle, PathMode } from "./journey-map-types";
import { MapToolbar } from "./MapToolbar";
import { GoogleJourneyMap } from "./GoogleJourneyMap";
import "leaflet/dist/leaflet.css";

export type { FenceCircle, PathMode } from "./journey-map-types";

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
  /** Default roads — snapped travelled route when OSRM succeeds. */
  pathMode?: PathMode;
  onPathModeChange?: (m: PathMode) => void;
  eventMarkers?: Array<{ id: string; lat: number; lng: number; t?: number; label?: string }>;
  showControls?: boolean;
};

function vehicleIcon(heading: number) {
  return L.divIcon({
    className: "jpni-vehicle-icon",
    html: `<div style="
      width:0;height:0;
      border-left:7px solid transparent;
      border-right:7px solid transparent;
      border-bottom:18px solid #f59e0b;
      filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));
      transform:rotate(${heading}deg);
      transform-origin:50% 70%;
    "></div>`,
    iconSize: [14, 18],
    iconAnchor: [7, 14],
  });
}

function FollowCamera({
  pose,
  follow,
}: {
  pose: InterpolatedPose | null;
  follow: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!follow || !pose) return;
    map.panTo([pose.lat, pose.lng], { animate: true, duration: 0.35, easeLinearity: 0.2 });
  }, [map, pose?.lat, pose?.lng, follow, pose]);
  return null;
}

function FitTrail({ path, fitKey }: { path: [number, number][]; fitKey: number }) {
  const map = useMap();
  useEffect(() => {
    if (path.length < 2) return;
    map.fitBounds(path, { padding: [48, 48], maxZoom: 16 });
  }, [map, path, fitKey]);
  return null;
}

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/@?api=1&map_action=map&center=${lat},${lng}&zoom=17`;
}

function OsmJourneyMap({
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
}: Props) {
  const [pathModeLocal, setPathModeLocal] = useState<PathMode>("roads");
  const pathMode = pathModeProp ?? pathModeLocal;
  const setPathMode = onPathModeChange ?? setPathModeLocal;
  const [fitKey, setFitKey] = useState(0);

  const gpsPath = useMemo(
    (): [number, number][] => points.map((p) => [p.lat, p.lng]),
    [points],
  );
  const roadLegsResolved = useMemo((): [number, number][][] => {
    if (pathLegs?.length) return pathLegs;
    if (roadPath && roadPath.length >= 2) return [roadPath];
    return [];
  }, [pathLegs, roadPath]);
  const roadFlat = useMemo(() => flattenRoadLegs(roadLegsResolved), [roadLegsResolved]);

  const { showGps, showRoads, hasRoads, fullPath, completed, remaining } = useMemo(
    () => resolvePathDisplay(pathMode, gpsPath, roadFlat, points, pose),
    [pathMode, gpsPath, roadFlat, points, pose],
  );

  const center = useMemo((): [number, number] => {
    if (pose) return [pose.lat, pose.lng];
    if (fullPath.length) return fullPath[0];
    if (points[0]) return [points[0].lat, points[0].lng];
    return [20, 0];
  }, [pose, fullPath, points]);

  const zoom = fullPath.length || points.length ? 14 : 2;
  const mapsTarget = pose || (points[0] ? { lat: points[0].lat, lng: points[0].lng } : null);

  return (
    <div
      className={`jpni-map-wrap interactive-map ${className || ""}`}
      style={{ height: "100%", minHeight: 420, width: "100%", position: "relative" }}
    >
      {routing && <div className="jpni-routing-badge muted">Snapping route to roads…</div>}
      {showControls ? (
        <MapToolbar
          onFit={() => setFitKey((k) => k + 1)}
          follow={follow}
          onFollowChange={onFollowChange}
          pathMode={pathMode}
          onPathModeChange={setPathMode}
          routing={routing}
          hasRoads={hasRoads}
          mapEngine="osm"
        />
      ) : null}
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", minHeight: 420, width: "100%", borderRadius: 12 }}
        scrollWheelZoom
        zoomControl={false}
      >
        <ZoomControl position="topright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {showGps && pathMode === "both" && gpsPath.length > 1 && (
          <Polyline positions={gpsPath} pathOptions={{ color: "#0d9488", weight: 3, opacity: 0.35 }} />
        )}
        {showGps && pathMode === "gps" && !pose && gpsPath.length > 1 && (
          <Polyline positions={gpsPath} pathOptions={{ color: "#0d9488", weight: 5, opacity: 0.9 }} />
        )}
        {showGps && pathMode === "gps" && pose && remaining.length > 1 && (
          <Polyline
            positions={remaining}
            pathOptions={{ color: "#94a3b8", weight: 5, opacity: 0.5, dashArray: "8 10" }}
          />
        )}
        {showGps && pathMode === "gps" && pose && completed.length > 1 && (
          <Polyline positions={completed} pathOptions={{ color: "#0d9488", weight: 6, opacity: 0.95 }} />
        )}
        {showGps && pathMode === "roads" && !showRoads && gpsPath.length > 1 && (
          <Polyline positions={gpsPath} pathOptions={{ color: "#0d9488", weight: 5, opacity: 0.9 }} />
        )}

        {showRoads &&
          !pose &&
          roadLegsResolved.map((leg, i) =>
            leg.length > 1 ? (
              <Polyline
                key={`road-${i}`}
                positions={leg}
                pathOptions={{
                  color: "#e85d04",
                  weight: pathMode === "both" ? 4 : 6,
                  opacity: pathMode === "both" ? 0.75 : 0.95,
                }}
              />
            ) : null,
          )}
        {showRoads && pose && remaining.length > 1 && (
          <Polyline
            positions={remaining}
            pathOptions={{ color: "#94a3b8", weight: 5, opacity: 0.55, dashArray: "8 10" }}
          />
        )}
        {showRoads && pose && completed.length > 1 && (
          <Polyline positions={completed} pathOptions={{ color: "#e85d04", weight: 6, opacity: 0.95 }} />
        )}

        <FitTrail path={fullPath.length >= 2 ? fullPath : gpsPath} fitKey={fitKey} />
        {showHeatmap &&
          heatCells.map((c, i) => (
            <CircleMarker
              key={`heat-${i}`}
              center={[c.lat, c.lng]}
              radius={8 + c.intensity * 14}
              pathOptions={{
                color: "#dc2626",
                fillColor: "#f97316",
                fillOpacity: 0.15 + c.intensity * 0.45,
                weight: 0,
              }}
            />
          ))}
        {stops.map((s, i) => (
          <CircleMarker
            key={`stop-${s.startMs}-${i}`}
            center={[s.lat, s.lng]}
            radius={7}
            pathOptions={{ color: "#1e40af", fillColor: "#3b82f6", fillOpacity: 0.85, weight: 2 }}
          />
        ))}
        {fences.map((f) => (
          <Circle
            key={f.id}
            center={[f.lat, f.lng]}
            radius={f.radiusMeters}
            pathOptions={{ color: "#0d9488", fillColor: "#0d9488", fillOpacity: 0.18, weight: 2 }}
          />
        ))}
        {mediaMarkers.map((m) => (
          <CircleMarker
            key={m.id}
            center={[m.lat, m.lng]}
            radius={6}
            pathOptions={{ color: "#7c3aed", fillColor: "#a78bfa", fillOpacity: 0.95, weight: 2 }}
          />
        ))}
        {eventMarkers.map((m) => (
          <CircleMarker
            key={`ev-${m.id}`}
            center={[m.lat, m.lng]}
            radius={5}
            pathOptions={{ color: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.95, weight: 2 }}
          />
        ))}
        {pose && (
          <>
            {pose.accuracy > 0 && (
              <Circle
                center={[pose.lat, pose.lng]}
                radius={Math.min(pose.accuracy, 80)}
                pathOptions={{ color: "#0ea5e9", fillOpacity: 0.06, weight: 1 }}
              />
            )}
            <Marker
              position={[pose.lat, pose.lng]}
              icon={vehicleIcon(pose.heading)}
              zIndexOffset={1000}
            />
          </>
        )}
        <FollowCamera pose={pose} follow={follow} />
      </MapContainer>
      {mapsTarget ? (
        <a
          className="btn btn-sm map-gmaps-btn"
          href={mapsUrl(mapsTarget.lat, mapsTarget.lng)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Google Maps
        </a>
      ) : null}
    </div>
  );
}

export function JourneyMap(props: Props) {
  const [engine, setEngine] = useState<"google" | "osm">(() =>
    hasGoogleMapsApiKey() ? "google" : "osm",
  );

  if (engine === "google") {
    return (
      <GoogleJourneyMap
        {...props}
        onFatalError={() => setEngine("osm")}
      />
    );
  }
  return <OsmJourneyMap {...props} />;
}

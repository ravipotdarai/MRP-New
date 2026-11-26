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
import {
  flattenRoadLegs,
  resolvePathDisplay,
  TRAIL_STYLE,
} from "../lib/journey-map-paths";
import type { FenceCircle, PathMode } from "./journey-map-types";
import { MapToolbar } from "./MapToolbar";
import { GoogleJourneyMap } from "./GoogleJourneyMap";
import "leaflet/dist/leaflet.css";

function endPointIcon(kind: "start" | "end") {
  const bg = kind === "start" ? "#16a34a" : "#dc2626";
  const label = kind === "start" ? "A" : "B";
  return L.divIcon({
    className: "jpni-endpoint-icon",
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:${bg};color:#fff;font:700 11px/22px system-ui,sans-serif;
      text-align:center;border:2px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,.45);
    ">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

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
    map.fitBounds(path, { padding: [56, 56], maxZoom: 17 });
  }, [map, path, fitKey]);
  return null;
}

function TrailPolylines({
  legs,
  style,
}: {
  legs: [number, number][][];
  style: { color: string; weight: number; opacity: number; dashArray?: string };
}) {
  return (
    <>
      {legs.map((leg, i) =>
        leg.length > 1 ? (
          <Polyline
            key={`c-${i}`}
            positions={leg}
            pathOptions={{
              color: TRAIL_STYLE.casing.color,
              weight: style.weight + 4,
              opacity: TRAIL_STYLE.casing.opacity,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        ) : null,
      )}
      {legs.map((leg, i) =>
        leg.length > 1 ? (
          <Polyline
            key={`s-${i}`}
            positions={leg}
            pathOptions={{
              color: style.color,
              weight: style.weight,
              opacity: style.opacity,
              dashArray: style.dashArray,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        ) : null,
      )}
    </>
  );
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
  const [pathModeLocal, setPathModeLocal] = useState<PathMode>("gps");
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
          attribution="Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />

        {showGps && pathMode === "both" && (
          <TrailPolylines legs={gpsLegs} style={TRAIL_STYLE.gpsBoth} />
        )}
        {showGps && pathMode === "gps" && !pose && (
          <TrailPolylines legs={gpsLegs} style={TRAIL_STYLE.stroke} />
        )}
        {showGps && pathMode === "gps" && pose && (
          <>
            <TrailPolylines legs={remainingLegs} style={TRAIL_STYLE.remaining} />
            <TrailPolylines legs={completedLegs} style={TRAIL_STYLE.stroke} />
          </>
        )}
        {showGps && pathMode === "roads" && !showRoads && (
          <TrailPolylines legs={gpsLegs} style={TRAIL_STYLE.stroke} />
        )}

        {showRoads && !pose && (
          <TrailPolylines
            legs={roadLegsResolved}
            style={{
              ...TRAIL_STYLE.roads,
              weight: pathMode === "both" ? 4 : TRAIL_STYLE.roads.weight,
              opacity: pathMode === "both" ? 0.8 : TRAIL_STYLE.roads.opacity,
            }}
          />
        )}
        {showRoads && pose && pathMode === "roads" && (
          <>
            <TrailPolylines legs={remainingLegs} style={TRAIL_STYLE.remaining} />
            <TrailPolylines legs={completedLegs} style={TRAIL_STYLE.roads} />
          </>
        )}

        {startPt ? (
          <Marker position={startPt} icon={endPointIcon("start")} zIndexOffset={900} />
        ) : null}
        {endPt && (endPt[0] !== startPt?.[0] || endPt[1] !== startPt?.[1]) ? (
          <Marker position={endPt} icon={endPointIcon("end")} zIndexOffset={900} />
        ) : null}

        <FitTrail path={fitPoints} fitKey={fitKey} />
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
  // Prefer Esri/Leaflet (no Maps JS key). Google only if a dedicated key exists
  // and the user hasn't already fallen back after a Maps API failure.
  const [engine, setEngine] = useState<"google" | "osm">("osm");

  if (engine === "google" && hasGoogleMapsApiKey()) {
    return (
      <GoogleJourneyMap
        {...props}
        onFatalError={() => setEngine("osm")}
      />
    );
  }
  return <OsmJourneyMap {...props} />;
}

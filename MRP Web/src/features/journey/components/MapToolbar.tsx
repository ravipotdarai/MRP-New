"use client";

import type { PathMode } from "./journey-map-types";

export function MapToolbar({
  onFit,
  follow,
  onFollowChange,
  pathMode,
  onPathModeChange,
  routing,
  hasRoads,
  mapEngine,
}: {
  onFit: () => void;
  follow: boolean;
  onFollowChange?: (v: boolean) => void;
  pathMode: PathMode;
  onPathModeChange?: (m: PathMode) => void;
  routing?: boolean;
  hasRoads: boolean;
  mapEngine?: "google" | "osm";
}) {
  return (
    <div className="jpni-map-toolbar" role="toolbar" aria-label="Map controls">
      <button type="button" className="btn btn-sm" onClick={onFit} title="Fit trail">
        Fit
      </button>
      {onFollowChange ? (
        <button
          type="button"
          className={`btn btn-sm ${follow ? "btn-primary" : ""}`}
          onClick={() => onFollowChange(!follow)}
          title="Follow playhead"
        >
          Follow
        </button>
      ) : null}
      {onPathModeChange ? (
        <select
          className="input jpni-path-mode"
          value={pathMode}
          onChange={(e) => onPathModeChange(e.target.value as PathMode)}
          title="Path style"
          aria-label="Path style"
        >
          <option value="roads">Roads (travelled)</option>
          <option value="gps">GPS samples</option>
          <option value="both">GPS + roads</option>
        </select>
      ) : null}
      {pathMode !== "gps" && routing ? (
        <span className="jpni-toolbar-hint muted">Snapping…</span>
      ) : null}
      {pathMode !== "gps" && !routing && !hasRoads ? (
        <span className="jpni-toolbar-hint muted">Roads pending</span>
      ) : null}
      {mapEngine ? (
        <span className="jpni-toolbar-hint muted" title="Map provider">
          {mapEngine === "google" ? "Google Maps" : "OSM"}
        </span>
      ) : null}
    </div>
  );
}

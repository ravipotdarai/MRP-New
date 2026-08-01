"use client";

import { useMemo, type ReactNode } from "react";
import {
  eventIcon,
  eventTimeMs,
  eventType,
  formatEventType,
  liveLatLng,
  rowGeofence,
  rowLatLng,
  rowStatus,
  severityOf,
  type TimelineRow,
} from "@/lib/vault-selectors";
import { InteractiveMap } from "@/components/InteractiveMap";

export function EventDetailDrawer({
  row,
  onClose,
  onPrev,
  onNext,
}: {
  row: TimelineRow | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  if (!row) return null;
  const ll = rowLatLng(row);
  const type = eventType(row);
  const sev = severityOf(type);
  const fence = rowGeofence(row);
  const status = rowStatus(row);

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="event-drawer sensitive-surface rise"
        role="dialog"
        aria-label="Event details"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div className="drawer-title-row">
            <span className={`tl-icon tl-icon-${sev}`} aria-hidden>
              {eventIcon(type)}
            </span>
            <h2>{formatEventType(type)}</h2>
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted drawer-time">
          {new Date(eventTimeMs(row) || Date.now()).toLocaleString()}
        </p>
        <div className="drawer-badges">
          <span className={`badge ${sev === "alert" ? "badge-alert" : sev === "safe" ? "badge-safe" : ""}`}>
            {sev}
          </span>
          <span className="badge">{status}</span>
          {fence.inside != null ? (
            <span className={`badge ${fence.inside ? "badge-safe" : "badge-alert"}`}>
              {fence.inside ? "Inside fence" : "Outside fence"}
            </span>
          ) : null}
        </div>
        <dl className="detail-grid detail-grid-compact">
          <dt>Coordinates</dt>
          <dd className="mono">{ll ? `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}` : "—"}</dd>
          <dt>Geofence</dt>
          <dd>{fence.fenceName || fence.label || "—"}</dd>
          <dt>Status</dt>
          <dd>{status}</dd>
        </dl>
        {ll ? <InteractiveMap center={ll} markers={[{ ...ll, id: "ev" }]} height={200} /> : null}
        <div className="drawer-nav">
          {onPrev ? (
            <button type="button" className="btn btn-sm" onClick={onPrev}>
              Previous
            </button>
          ) : null}
          {onNext ? (
            <button type="button" className="btn btn-sm" onClick={onNext}>
              Next
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

/** Compact security timeline — type, status, time only (no photos / full address). */
export function TimelineList({
  rows,
  onSelect,
  empty,
}: {
  rows: TimelineRow[];
  onSelect: (row: TimelineRow, index: number) => void;
  empty?: ReactNode;
}) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => eventTimeMs(b) - eventTimeMs(a)),
    [rows],
  );
  if (!sorted.length) return <>{empty || <p className="muted">No events</p>}</>;
  return (
    <ul className="timeline-list timeline-spine timeline-compact-list sensitive-surface">
      {sorted.map((row, i) => {
        const t = eventType(row);
        const sev = severityOf(t);
        const status = rowStatus(row);
        return (
          <li key={String(row.id || `${t}-${eventTimeMs(row)}-${i}`)} className="timeline-item">
            <button type="button" className="timeline-row timeline-row-compact" onClick={() => onSelect(row, i)}>
              <span className={`tl-icon tl-icon-${sev}`} aria-hidden title={t}>
                {eventIcon(t)}
              </span>
              <span className="timeline-row-body">
                <span className="timeline-row-head">
                  <strong>{formatEventType(t)}</strong>
                  <span
                    className={`badge badge-sm ${
                      sev === "alert" ? "badge-alert" : sev === "safe" ? "badge-safe" : ""
                    }`}
                  >
                    {status}
                  </span>
                </span>
                <span className="muted timeline-meta mono">
                  {new Date(eventTimeMs(row) || Date.now()).toLocaleString()}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function useLivePoint() {
  return liveLatLng;
}

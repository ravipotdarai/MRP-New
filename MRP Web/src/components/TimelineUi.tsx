"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  eventIcon,
  eventTimeMs,
  eventType,
  findSelfieForRow,
  formatEventType,
  liveLatLng,
  rowAddress,
  rowGeofence,
  rowLatLng,
  rowStatus,
  selfieSrc,
  severityOf,
  type TimelineRow,
} from "@/lib/vault-selectors";
import type { VaultPayload } from "@/lib/vault-crypto";
import { InteractiveMap } from "@/components/InteractiveMap";

export function EventDetailDrawer({
  row,
  vault,
  onClose,
  onPrev,
  onNext,
  hideMap = false,
}: {
  row: TimelineRow | null;
  vault?: VaultPayload | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hideMap?: boolean;
}) {
  useEffect(() => {
    if (!row) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [row, onClose]);

  if (!row) return null;
  const ll = rowLatLng(row);
  const type = eventType(row);
  const sev = severityOf(type);
  const fence = rowGeofence(row);
  const status = rowStatus(row);
  const address = rowAddress(row);
  const selfie = vault ? findSelfieForRow(vault, row) : null;
  const selfieUrl = selfie ? selfieSrc(selfie) : null;
  const selfieDeferred =
    Boolean(selfie) &&
    !selfieUrl &&
    Boolean((selfie as Record<string, unknown>).blobDeferred);

  const meta = (row.metadata || {}) as Record<string, unknown>;
  const loc = (row.location || {}) as Record<string, unknown>;
  const battery = row.battery ?? meta.battery ?? meta.batteryPct;
  const accuracyRaw =
    row.accuracy ??
    meta.accuracy ??
    meta.accuracyMeters ??
    loc.accuracy ??
    loc.accuracyMeters ??
    loc.accuracyM;
  const accuracyM =
    typeof accuracyRaw === "number"
      ? accuracyRaw
      : typeof accuracyRaw === "string"
        ? Number(accuracyRaw)
        : NaN;
  const accuracyLabel = Number.isFinite(accuracyM)
    ? `±${Math.round(accuracyM)} m`
    : accuracyRaw != null && String(accuracyRaw) !== ""
      ? String(accuracyRaw)
      : null;

  const panel = (
    <div
      className="drawer-backdrop"
      role="presentation"
      onClick={onClose}
      data-testid="event-drawer-backdrop"
    >
      <aside
        className="event-drawer sensitive-surface"
        role="dialog"
        aria-modal="true"
        aria-label="Event evidence details"
        onClick={(e) => e.stopPropagation()}
        data-testid="event-drawer"
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
          <span
            className={`badge ${sev === "alert" ? "badge-alert" : sev === "safe" ? "badge-safe" : ""}`}
          >
            {sev}
          </span>
          <span className="badge">{status}</span>
          {fence.inside != null ? (
            <span className={`badge ${fence.inside ? "badge-safe" : "badge-alert"}`}>
              {fence.inside ? "Inside fence" : "Outside fence"}
            </span>
          ) : null}
        </div>

        {selfieUrl ? (
          <div className="drawer-selfie-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selfieUrl} alt="Event selfie" className="drawer-selfie" />
            <p className="muted drawer-selfie-caption">Surveillance selfie</p>
          </div>
        ) : selfieDeferred ? (
          <p className="muted drawer-selfie-empty-msg">Selfie still loading from backup…</p>
        ) : null}

        <dl className="detail-grid">
          <dt>Event type</dt>
          <dd className="mono">{type}</dd>
          <dt>Status</dt>
          <dd>{status}</dd>
          <dt>Coordinates</dt>
          <dd className="mono">{ll ? `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}` : "—"}</dd>
          <dt>Address</dt>
          <dd>{address || "—"}</dd>
          <dt>Geofence</dt>
          <dd>{fence.fenceName || fence.label || "—"}</dd>
          {battery != null && String(battery) !== "" ? (
            <>
              <dt>Battery</dt>
              <dd>{String(battery)}</dd>
            </>
          ) : null}
          {accuracyLabel ? (
            <>
              <dt>Accuracy</dt>
              <dd>{accuracyLabel}</dd>
            </>
          ) : null}
        </dl>
        {!hideMap && ll ? (
          <div className="drawer-map-wrap">
            <InteractiveMap
              center={ll}
              markers={[{ ...ll, id: "ev" }]}
              geofences={
                Number.isFinite(accuracyM) && accuracyM > 0
                  ? [
                      {
                        id: "acc",
                        lat: ll.lat,
                        lng: ll.lng,
                        radiusMeters: Math.min(Math.max(accuracyM, 12), 250),
                        name: "GPS accuracy",
                      },
                    ]
                  : []
              }
              height={200}
            />
          </div>
        ) : null}
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

  if (typeof document === "undefined") return panel;
  return createPortal(panel, document.body);
}

/** Compact security timeline — type, status, time only (no photos in the list). */
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
            <button
              type="button"
              className="timeline-row timeline-row-compact"
              onClick={() => onSelect(row, i)}
            >
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

"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  eventTimeMs,
  eventType,
  liveLatLng,
  rowAddress,
  rowLatLng,
  severityOf,
  selfieSrc,
  type TimelineRow,
} from "@/lib/vault-selectors";
import { InteractiveMap } from "@/components/InteractiveMap";

export function EventDetailDrawer({
  row,
  selfie,
  onClose,
  onPrev,
  onNext,
}: {
  row: TimelineRow | null;
  selfie?: unknown;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  if (!row) return null;
  const ll = rowLatLng(row);
  const src = selfie ? selfieSrc(selfie) : null;
  const type = eventType(row);
  const sev = severityOf(type);
  const loc = (row.location || {}) as Record<string, unknown>;

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="event-drawer sensitive-surface"
        role="dialog"
        aria-label="Event details"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>{type}</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted" style={{ marginTop: "0.35rem" }}>
          {new Date(eventTimeMs(row) || Date.now()).toLocaleString()}
        </p>
        <span className={`badge ${sev === "alert" ? "badge-alert" : sev === "safe" ? "badge-safe" : ""}`}>
          {sev}
        </span>
        <dl className="detail-grid">
          <dt>Address</dt>
          <dd>{rowAddress(row) || "—"}</dd>
          <dt>Coordinates</dt>
          <dd className="mono">
            {ll ? `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}` : "—"}
          </dd>
          <dt>Battery</dt>
          <dd>{String(loc.battery ?? row.battery ?? "—")}</dd>
          <dt>Network</dt>
          <dd>{String(loc.network ?? row.network ?? "—")}</dd>
          <dt>GPS accuracy</dt>
          <dd>{String(loc.accuracy ?? loc.gpsAccuracy ?? "—")}</dd>
          <dt>Speed</dt>
          <dd>{String(loc.speed ?? row.speed ?? "—")}</dd>
          <dt>Status</dt>
          <dd>{String(row.status || "—")}</dd>
        </dl>
        {ll ? <InteractiveMap center={ll} markers={[{ ...ll, id: "ev" }]} height={220} /> : null}
        {src ? (
          <div style={{ marginTop: "1rem" }}>
            <SelfieLightbox src={src} />
          </div>
        ) : null}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          {onPrev ? (
            <button type="button" className="btn" onClick={onPrev}>
              Previous
            </button>
          ) : null}
          {onNext ? (
            <button type="button" className="btn" onClick={onNext}>
              Next
            </button>
          ) : null}
        </div>
        <details style={{ marginTop: "1rem" }}>
          <summary className="muted">Developer JSON</summary>
          <pre className="mono" style={{ fontSize: "0.7rem", overflow: "auto", maxHeight: 200 }}>
            {JSON.stringify(row, null, 2)}
          </pre>
        </details>
      </aside>
    </div>
  );
}

function SelfieLightbox({ src }: { src: string }) {
  const [full, setFull] = useState(false);
  return (
    <>
      <button type="button" className="selfie-thumb-btn" onClick={() => setFull(true)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Event selfie" className="selfie-thumb" />
      </button>
      {full ? (
        <div className="lightbox" role="dialog" onClick={() => setFull(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Selfie fullscreen" />
          <a className="btn btn-primary" href={src} download={`mrp-selfie-${Date.now()}.jpg`} onClick={(e) => e.stopPropagation()}>
            Download
          </a>
        </div>
      ) : null}
    </>
  );
}

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
    <ul className="timeline-list sensitive-surface">
      {sorted.map((row, i) => {
        const t = eventType(row);
        const sev = severityOf(t);
        const ll = rowLatLng(row);
        return (
          <li key={String(row.id || `${t}-${eventTimeMs(row)}-${i}`)}>
            <button type="button" className="timeline-row" onClick={() => onSelect(row, i)}>
              <span className={`sev-dot sev-${sev}`} aria-hidden />
              <span className="timeline-row-body">
                <strong>{t}</strong>
                <span className="muted">
                  {new Date(eventTimeMs(row) || Date.now()).toLocaleString()}
                  {rowAddress(row) ? ` · ${rowAddress(row)}` : ""}
                  {ll ? ` · ${ll.lat.toFixed(3)}, ${ll.lng.toFixed(3)}` : ""}
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

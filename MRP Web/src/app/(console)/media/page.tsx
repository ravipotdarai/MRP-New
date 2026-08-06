"use client";

import { useMemo, useState } from "react";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";
import { InteractiveMap } from "@/components/InteractiveMap";
import { SessionInlineControls } from "@/components/SessionInlineControls";
import {
  eventIcon,
  findRowForSelfie,
  formatEventType,
  num,
  rowAddress,
  rowGeofence,
  rowLatLng,
  selfieSrc,
  severityOf,
} from "@/lib/vault-selectors";

function eventLabel(o: Record<string, unknown>): string {
  const raw = String(o.eventType || o.event_type || o.event || o.name || "Selfie");
  if (raw.includes(".") || raw.includes("/") || raw.toLowerCase().endsWith(".jpg")) {
    // Filename-ish — derive from tokens
    const base = raw.split(/[/\\]/).pop() || raw;
    const cleaned = base.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
    return formatEventType(cleaned.toUpperCase().replace(/\s+/g, "_"));
  }
  return formatEventType(raw);
}

function MediaBody() {
  const { vault } = useVaultSession();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [fullIdx, setFullIdx] = useState<number | null>(null);

  const items = useMemo(() => {
    return (vault?.selfies || [])
      .map((s, i) => {
        const o = s as Record<string, unknown>;
        const src = selfieSrc(s);
        const type = String(o.eventType || o.event_type || o.event || "SELFIE");
        const at = num(o.atMs ?? o.timestamp ?? o.time) ?? 0;
        let lat = num(o.latitude ?? o.lat);
        let lng = num(o.longitude ?? o.lng);
        const linked = findRowForSelfie(vault, s);
        const linkedLl = linked ? rowLatLng(linked) : null;
        if ((lat == null || lng == null) && linkedLl) {
          lat = linkedLl.lat;
          lng = linkedLl.lng;
        }
        const fence = linked ? rowGeofence(linked) : null;
        const address = linked ? rowAddress(linked) : String(o.address || "");
        return {
          s,
          i,
          src,
          label: eventLabel(o),
          type,
          at,
          lat,
          lng,
          address,
          fence,
          sev: severityOf(type),
        };
      })
      .filter((x) => x.src);
  }, [vault]);

  const full = fullIdx != null ? items[fullIdx] : null;

  return (
    <div>
      <div className="media-page-head">
        <div>
          <h1 className="page-title">Selfie evidence</h1>
          <p className="page-lead">
            From encrypted Drive backup
            {vault?.selfiesOmitted
              ? " · selfies omitted — Premium+ plan and Premium+ selfies in Drive must be on, then sync from the phone"
              : ""}
            . Unlock and Refresh after the phone finishes Drive sync to load new captures.
          </p>
        </div>
        <SessionInlineControls />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button type="button" className={`btn ${view === "grid" ? "btn-primary" : ""}`} onClick={() => setView("grid")}>
          Grid
        </button>
        <button type="button" className={`btn ${view === "list" ? "btn-primary" : ""}`} onClick={() => setView("list")}>
          List
        </button>
        <span className="muted mono" style={{ alignSelf: "center", fontSize: "0.85rem" }}>
          {items.length} capture{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="muted">No selfies in this backup.</p>
      ) : view === "grid" ? (
        <div className="selfie-grid sensitive-surface">
          {items.map((it, idx) => (
            <button
              key={it.i}
              type="button"
              className="selfie-tile"
              onClick={() => setFullIdx(idx)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.src!} alt="" className="selfie-tile-img" loading="lazy" />
              <span className="selfie-tile-overlay">
                <span className={`tl-icon tl-icon-${it.sev} selfie-tile-ico`} aria-hidden>
                  {eventIcon(it.type)}
                </span>
                <span className="selfie-tile-title">{it.label}</span>
                <span className="selfie-tile-time mono">
                  {it.at
                    ? new Date(it.at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <ul className="timeline-list timeline-spine sensitive-surface">
          {items.map((it, idx) => (
            <li key={it.i} className="timeline-item">
              <button type="button" className="timeline-row" onClick={() => setFullIdx(idx)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.src!} alt="" className="selfie-thumb" style={{ width: 56, height: 56 }} />
                <span className={`tl-icon tl-icon-${it.sev}`} aria-hidden>
                  {eventIcon(it.type)}
                </span>
                <span className="timeline-row-body">
                  <strong>{it.label}</strong>
                  <span className="muted mono">
                    {it.at ? new Date(it.at).toLocaleString() : "—"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <div
          className="selfie-detail-backdrop"
          role="presentation"
          onClick={() => setFullIdx(null)}
        >
          <aside
            className="selfie-detail-sheet sensitive-surface rise"
            role="dialog"
            aria-label="Security event evidence"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="selfie-detail-head">
              <div>
                <p className="muted selfie-detail-kicker">Security event evidence</p>
                <h2>{full.label}</h2>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setFullIdx(null)}>
                Close
              </button>
            </div>

            <div className="selfie-detail-image-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={full.src!} alt={full.label} className="selfie-detail-image" />
            </div>

            <div className="drawer-badges">
              <span className="badge badge-safe">Verified</span>
              <span className={`badge ${full.sev === "alert" ? "badge-alert" : ""}`}>
                {formatEventType(full.type)}
              </span>
            </div>

            <dl className="detail-grid">
              <dt>Event</dt>
              <dd>{full.label}</dd>
              <dt>Captured</dt>
              <dd>{full.at ? new Date(full.at).toLocaleString() : "—"}</dd>
              <dt>Coordinates</dt>
              <dd className="mono">
                {full.lat != null && full.lng != null
                  ? `${full.lat.toFixed(5)}, ${full.lng.toFixed(5)}`
                  : "—"}
              </dd>
              <dt>Address</dt>
              <dd>{full.address || "—"}</dd>
              <dt>Geofence</dt>
              <dd>
                {full.fence
                  ? full.fence.fenceName ||
                    full.fence.label ||
                    (full.fence.inside == null
                      ? "—"
                      : full.fence.inside
                        ? "Inside fence"
                        : "Outside fence")
                  : "—"}
              </dd>
            </dl>

            {full.lat != null && full.lng != null ? (
              <InteractiveMap
                center={{ lat: full.lat, lng: full.lng }}
                markers={[{ lat: full.lat, lng: full.lng, id: "selfie" }]}
                height={200}
              />
            ) : null}

            <div className="drawer-nav">
              <button
                type="button"
                className="btn btn-sm"
                disabled={fullIdx === 0}
                onClick={() => setFullIdx((i) => (i == null ? 0 : Math.max(0, i - 1)))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={fullIdx === items.length - 1}
                onClick={() =>
                  setFullIdx((i) => (i == null ? 0 : Math.min(items.length - 1, i + 1)))
                }
              >
                Next
              </button>
              <a className="btn btn-primary btn-sm" href={full.src!} download={`mrp-selfie-${Date.now()}.jpg`}>
                Download
              </a>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export default function MediaPage() {
  return (
    <VaultUnlockGate title="Unlock device data for media">
      <MediaBody />
    </VaultUnlockGate>
  );
}

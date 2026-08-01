"use client";

import { useMemo, useState } from "react";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";
import { InteractiveMap } from "@/components/InteractiveMap";
import { selfieSrc } from "@/lib/vault-selectors";

function MediaBody() {
  const { vault } = useVaultSession();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [fullIdx, setFullIdx] = useState<number | null>(null);

  const items = useMemo(() => {
    return (vault?.selfies || [])
      .map((s, i) => ({ s, i, src: selfieSrc(s) }))
      .filter((x) => x.src);
  }, [vault]);

  const full = fullIdx != null ? items[fullIdx] : null;

  return (
    <div>
      <h1 className="page-title">Selfie evidence</h1>
      <p className="page-lead">
        From encrypted Drive backup
        {vault?.selfiesOmitted ? " · some selfies omitted on phone sync policy" : ""}.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button type="button" className={`btn ${view === "grid" ? "btn-primary" : ""}`} onClick={() => setView("grid")}>
          Grid
        </button>
        <button type="button" className={`btn ${view === "list" ? "btn-primary" : ""}`} onClick={() => setView("list")}>
          List
        </button>
      </div>
      {items.length === 0 ? (
        <p className="muted">No selfies in this backup.</p>
      ) : view === "grid" ? (
        <div className="selfie-grid sensitive-surface">
          {items.map((it, idx) => (
            <button key={it.i} type="button" className="selfie-thumb-btn" onClick={() => setFullIdx(idx)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.src!} alt="" className="selfie-thumb" loading="lazy" />
            </button>
          ))}
        </div>
      ) : (
        <ul className="timeline-list sensitive-surface">
          {items.map((it, idx) => {
            const o = it.s as Record<string, unknown>;
            return (
              <li key={it.i}>
                <button type="button" className="timeline-row" onClick={() => setFullIdx(idx)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.src!} alt="" className="selfie-thumb" style={{ width: 56, height: 56 }} />
                  <span className="timeline-row-body">
                    <strong>{String(o.eventType || o.event || "Selfie")}</strong>
                    <span className="muted">
                      {o.atMs || o.timestamp
                        ? new Date(Number(o.atMs || o.timestamp)).toLocaleString()
                        : "—"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {full ? (
        <div className="lightbox" role="dialog" onClick={() => setFullIdx(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={full.src!} alt="Selfie" onClick={(e) => e.stopPropagation()} />
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn" disabled={fullIdx === 0} onClick={() => setFullIdx((i) => (i == null ? 0 : Math.max(0, i - 1)))}>
              Prev
            </button>
            <button
              type="button"
              className="btn"
              disabled={fullIdx === items.length - 1}
              onClick={() => setFullIdx((i) => (i == null ? 0 : Math.min(items.length - 1, i + 1)))}
            >
              Next
            </button>
            <a className="btn btn-primary" href={full.src!} download={`mrp-selfie-${Date.now()}.jpg`}>
              Download
            </a>
            <button type="button" className="btn" onClick={() => setFullIdx(null)}>
              Close
            </button>
          </div>
          {(() => {
            const o = full.s as Record<string, unknown>;
            const lat = Number(o.latitude ?? o.lat);
            const lng = Number(o.longitude ?? o.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return (
              <div style={{ marginTop: "1rem", maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
                <InteractiveMap center={{ lat, lng }} markers={[{ lat, lng }]} height={200} />
              </div>
            );
          })()}
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

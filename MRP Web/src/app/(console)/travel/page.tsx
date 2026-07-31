"use client";

import { useMemo, useState } from "react";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";
import { InteractiveMap } from "@/components/InteractiveMap";
import { pathDistanceKm, travelPoints } from "@/lib/vault-selectors";

function dayBounds(isoDate: string): { from: number; to: number } {
  const from = new Date(`${isoDate}T00:00:00`);
  const to = new Date(`${isoDate}T23:59:59.999`);
  return { from: from.getTime(), to: to.getTime() };
}

function TravelBody() {
  const { vault } = useVaultSession();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [playIdx, setPlayIdx] = useState(0);

  const { from, to } = dayBounds(date);
  const points = useMemo(() => travelPoints(vault, from, to), [vault, from, to]);
  const km = pathDistanceKm(points);
  const durationMin =
    points.length >= 2 ? Math.round((points[points.length - 1].t - points[0].t) / 60000) : 0;

  const playPoint = points[Math.min(playIdx, Math.max(0, points.length - 1))];

  return (
    <div>
      <h1 className="page-title">Travel history</h1>
      <p className="page-lead">Derived from vault timeline GPS points for the selected day.</p>
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <label className="muted" htmlFor="travel-day">
          Date
        </label>
        <input
          id="travel-day"
          className="input"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setPlayIdx(0);
          }}
          style={{ display: "block", marginTop: "0.35rem", maxWidth: 220 }}
        />
        <ul className="muted" style={{ listStyle: "none", marginTop: "0.75rem", lineHeight: 1.7 }}>
          <li>Points: {points.length}</li>
          <li>Distance: {km.toFixed(2)} km</li>
          <li>Span: {durationMin} min</li>
          <li>
            Start → end:{" "}
            {points.length
              ? `${points[0].lat.toFixed(4)},${points[0].lng.toFixed(4)} → ${points[points.length - 1].lat.toFixed(4)},${points[points.length - 1].lng.toFixed(4)}`
              : "—"}
          </li>
        </ul>
        {points.length > 1 ? (
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={() => setPlayIdx(0)}>
              Start
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setPlayIdx((i) => Math.min(points.length - 1, i + 1))}
            >
              Step
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                let i = 0;
                const id = window.setInterval(() => {
                  i += 1;
                  setPlayIdx(i);
                  if (i >= points.length - 1) window.clearInterval(id);
                }, 400);
              }}
            >
              Playback
            </button>
          </div>
        ) : null}
      </div>
      <div className="panel">
        {points.length ? (
          <InteractiveMap
            center={playPoint ? { lat: playPoint.lat, lng: playPoint.lng } : undefined}
            polyline={points}
            markers={
              playPoint
                ? [{ lat: playPoint.lat, lng: playPoint.lng, id: "play", color: "#c45c3e" }]
                : [{ lat: points[0].lat, lng: points[0].lng, id: "start" }]
            }
            height={360}
          />
        ) : (
          <p className="muted">No GPS-tagged events this day. Ensure the phone backs up timeline with location.</p>
        )}
      </div>
    </div>
  );
}

export default function TravelPage() {
  return (
    <VaultUnlockGate title="Unlock vault for travel">
      <TravelBody />
    </VaultUnlockGate>
  );
}

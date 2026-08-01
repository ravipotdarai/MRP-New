"use client";

import { useMemo, useState } from "react";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";
import { InteractiveMap } from "@/components/InteractiveMap";
import { num, pathDistanceKm, travelPoints } from "@/lib/vault-selectors";

function dayBounds(isoDate: string): { from: number; to: number } {
  const from = new Date(`${isoDate}T00:00:00`);
  const to = new Date(`${isoDate}T23:59:59.999`);
  return { from: from.getTime(), to: to.getTime() };
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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

  const mapFences = useMemo(() => {
    return (vault?.geofences || [])
      .map((g, i) => {
        const lat = num(g.latitude);
        const lng = num(g.longitude);
        const r = num(g.radiusMeters) ?? 100;
        if (lat == null || lng == null) return null;
        return { id: g.id || `gf-${i}`, lat, lng, radiusMeters: r, name: g.name };
      })
      .filter(Boolean) as Array<{ id: string; lat: number; lng: number; radiusMeters: number; name?: string }>;
  }, [vault?.geofences]);

  return (
    <div>
      <h1 className="page-title rise">Travel</h1>
      <p className="page-lead rise rise-delay-1">
        GPS points for the selected day. Step or play back the position — the route line is hidden on the map.
      </p>
      <div className="panel rise rise-delay-1" style={{ marginBottom: "1rem" }}>
        <label className="muted" htmlFor="travel-day">
          Date
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.35rem", alignItems: "center" }}>
          <button type="button" className="btn" onClick={() => { setDate((d) => shiftDate(d, -1)); setPlayIdx(0); }}>
            ← Prev
          </button>
          <input
            id="travel-day"
            className="input"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPlayIdx(0);
            }}
            style={{ maxWidth: 220 }}
          />
          <button type="button" className="btn" onClick={() => { setDate((d) => shiftDate(d, 1)); setPlayIdx(0); }}>
            Next →
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDate(new Date().toISOString().slice(0, 10));
              setPlayIdx(0);
            }}
          >
            Today
          </button>
        </div>
        <ul className="muted travel-stats" style={{ listStyle: "none", marginTop: "0.75rem", lineHeight: 1.7 }}>
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
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
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
                let i = playIdx;
                const id = window.setInterval(() => {
                  i += 1;
                  setPlayIdx(i);
                  if (i >= points.length - 1) window.clearInterval(id);
                }, 400);
              }}
            >
              Playback
            </button>
            <span className="muted mono" style={{ fontSize: "0.85rem" }}>
              {playIdx + 1}/{points.length}
              {playPoint ? ` · ${new Date(playPoint.t).toLocaleTimeString()}` : ""}
            </span>
          </div>
        ) : null}
      </div>
      <div className="panel rise rise-delay-2">
        {points.length ? (
          <InteractiveMap
            center={playPoint ? { lat: playPoint.lat, lng: playPoint.lng } : undefined}
            markers={
              playPoint
                ? [{ lat: playPoint.lat, lng: playPoint.lng, id: "play", color: "#c45c3e" }]
                : [{ lat: points[0].lat, lng: points[0].lng, id: "start" }]
            }
            geofences={mapFences}
            height={400}
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
    <VaultUnlockGate title="Unlock device data for Travel">
      <TravelBody />
    </VaultUnlockGate>
  );
}

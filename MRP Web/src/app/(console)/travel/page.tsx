"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { useVaultSession } from "@/lib/vault-session";
import { num } from "@/lib/vault-selectors";
import { useGpsDayTrail } from "@/features/journey/hooks/useGpsDayTrail";
import { useNavigableTrail } from "@/features/journey/hooks/useNavigableTrail";
import {
  formatJourneyClock,
  formatLiveClock,
  localTodayISO,
  shiftLocalDate,
} from "@/features/journey/lib/local-date";
import {
  PLAYBACK_SPEEDS,
  type GpsPoint,
  type InterpolatedPose,
  type PlaybackSpeeds,
} from "@/features/journey/types";
import type { FenceCircle, PathMode } from "@/features/journey/components/JourneyMap";

const JourneyMap = dynamic(
  () => import("@/features/journey/components/JourneyMap").then((m) => m.JourneyMap),
  {
    ssr: false,
    loading: () => (
      <div className="panel muted" style={{ minHeight: 400, display: "grid", placeItems: "center" }}>
        Loading map…
      </div>
    ),
  },
);

function poseAt(points: GpsPoint[], idx: number): InterpolatedPose | null {
  if (!points.length) return null;
  const i = Math.min(Math.max(0, idx), points.length - 1);
  const p = points[i];
  const next = points[Math.min(i + 1, points.length - 1)];
  const start = points[0].t;
  const end = points[points.length - 1].t;
  const progress = end > start ? (p.t - start) / (end - start) : 0;
  const heading =
    p.h ?? (Math.atan2(next.lng - p.lng, next.lat - p.lat) * 180) / Math.PI;
  return {
    t: p.t,
    lat: p.lat,
    lng: p.lng,
    heading: ((heading % 360) + 360) % 360,
    speed: p.s ?? 0,
    accuracy: p.a ?? 40,
    motion: p.m ?? "drive",
    progress,
  };
}

function TravelBody() {
  const { vault, unlocked } = useVaultSession();
  const trailState = useGpsDayTrail({ autoLoad: unlocked });
  const {
    date,
    points,
    index,
    source,
    loading,
    error,
    banner,
    availableDays,
    distanceKm,
    eventMarkers,
    loadDay,
  } = trailState;

  const { trail, routing } = useNavigableTrail(points);
  const [playIdx, setPlayIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [follow, setFollow] = useState(true);
  const [pathMode, setPathMode] = useState<PathMode>("roads");
  const [speed, setSpeed] = useState<PlaybackSpeeds>(1);
  const [liveNow, setLiveNow] = useState(() => formatLiveClock());

  useEffect(() => {
    const id = window.setInterval(() => setLiveNow(formatLiveClock()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setPlayIdx(0);
    setPlaying(false);
  }, [date, points.length]);

  useEffect(() => {
    if (!playing || points.length < 2) return;
    const stepMs = Math.max(40, Math.round(350 / speed));
    const id = window.setInterval(() => {
      setPlayIdx((i) => {
        const next = i + 1;
        if (next >= points.length - 1) {
          setPlaying(false);
          return points.length - 1;
        }
        return next;
      });
    }, stepMs);
    return () => window.clearInterval(id);
  }, [playing, points.length, speed]);

  const pose = poseAt(points, playIdx);
  const progress = pose?.progress ?? 0;
  const durationMin =
    points.length >= 2 ? Math.round((points[points.length - 1].t - points[0].t) / 60000) : 0;

  const mapFences: FenceCircle[] = useMemo(() => {
    return (vault?.geofences || [])
      .map((g, i) => {
        const lat = num(g.latitude);
        const lng = num(g.longitude);
        const r = num(g.radiusMeters) ?? 100;
        if (lat == null || lng == null) return null;
        return { id: g.id || `gf-${i}`, lat, lng, radiusMeters: r, name: g.name };
      })
      .filter(Boolean) as FenceCircle[];
  }, [vault?.geofences]);

  return (
    <div className="travel-desk">
      <header className="travel-hero rise">
        <div>
          <p className="travel-kicker">Day trips · GPS trail</p>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            Travel
          </h1>
          <p className="page-lead" style={{ marginBottom: 0, marginTop: "0.35rem" }}>
            Review where the phone moved — dense GPS day packs from Drive (5–90s samples). Not a
            security investigation desk.
          </p>
        </div>
        <div className="travel-live-chip mono" title="Device wall clock (browser)">
          Live {liveNow}
        </div>
      </header>

      {banner ? (
        <div className="panel rise" style={{ marginBottom: "0.75rem", borderColor: "var(--warn, #d97706)" }}>
          <span className="muted">{banner}</span>
        </div>
      ) : null}
      {error ? (
        <div className="panel rise" style={{ marginBottom: "0.75rem" }}>
          <span className="muted">{error}</span>
        </div>
      ) : null}

      <div className="travel-layout">
        <aside className="panel travel-side rise rise-delay-1">
          <h2>Day</h2>
          <div className="travel-day-row">
            <button type="button" className="btn btn-sm" onClick={() => void loadDay(shiftLocalDate(date, -1))}>
              ←
            </button>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => void loadDay(e.target.value)}
            />
            <button type="button" className="btn btn-sm" onClick={() => void loadDay(shiftLocalDate(date, 1))}>
              →
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void loadDay(localTodayISO())}>
              Today
            </button>
          </div>
          {availableDays.length > 0 ? (
            <p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.5rem" }}>
              Packs on Drive: {availableDays.slice(0, 6).join(", ")}
              {availableDays.length > 6 ? "…" : ""}
            </p>
          ) : (
            <p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.5rem" }}>
              No day packs listed yet — unlock + phone sync uploads <code>mrp_gps_*</code> files.
            </p>
          )}

          <h2 style={{ marginTop: "1.1rem" }}>Trip summary</h2>
          <ul className="travel-stats muted">
            <li>
              Source:{" "}
              <strong>
                {loading
                  ? "…"
                  : source === "daypack"
                    ? "GPS day pack"
                    : source === "merged"
                      ? "Day pack + events"
                      : source === "vault-sparse"
                        ? "Vault events (path)"
                        : "—"}
              </strong>
            </li>
            <li>Points: {loading ? "…" : points.length}</li>
            <li>Distance: {distanceKm.toFixed(2)} km</li>
            <li>Span: {durationMin} min</li>
            {index ? (
              <>
                <li>Max speed: {(index.maxSpeed * 3.6).toFixed(1)} km/h</li>
                <li>Stops: {index.stopCount}</li>
                <li>Moving: {Math.round(index.movingMs / 60000)} min</li>
              </>
            ) : null}
            <li>
              Roads:{" "}
              {routing
                ? "Snapping to roads…"
                : trail?.source === "osrm"
                  ? "Travelled route (OSRM)"
                  : "GPS only (snap failed)"}
            </li>
          </ul>
        </aside>

        <section className="panel travel-map rise rise-delay-2" style={{ padding: 0, overflow: "hidden" }}>
          {points.length ? (
            <JourneyMap
              points={points}
              pose={pose}
              fences={mapFences}
              follow={follow}
              onFollowChange={setFollow}
              roadPath={trail?.path}
              pathLegs={trail?.pathLegs}
              routing={routing}
              pathMode={pathMode}
              onPathModeChange={setPathMode}
              eventMarkers={eventMarkers}
              showControls
            />
          ) : (
            <p className="muted" style={{ padding: "1.25rem" }}>
              {loading
                ? "Loading trail…"
                : "No GPS trail for this day. Ensure location tracking is on and the phone has synced Drive."}
            </p>
          )}
        </section>
      </div>

      <div className="panel travel-transport rise rise-delay-2">
        <div className="travel-transport-top">
          <div className="travel-transport-btns">
            <button
              type="button"
              className="btn btn-sm"
              disabled={!points.length}
              onClick={() => {
                setPlayIdx(0);
                setPlaying(false);
              }}
            >
              Start
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={points.length < 2}
              onClick={() => setPlayIdx((i) => Math.max(0, i - 1))}
            >
              − Step
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={points.length < 2}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={points.length < 2}
              onClick={() => setPlayIdx((i) => Math.min(points.length - 1, i + 1))}
            >
              Step +
            </button>
            <label className="travel-speed-label muted">
              Speed
              <select
                className="input"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value) as PlaybackSpeeds)}
                aria-label="Playback speed"
              >
                {PLAYBACK_SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="travel-transport-times mono muted">
            <span title="Playback position on the trail">
              Trail {pose ? formatJourneyClock(pose.t) : "—"}
            </span>
            <span className="travel-time-sep">·</span>
            <span title="Current wall clock">Live {liveNow}</span>
            <span className="travel-time-sep">·</span>
            <span>
              {points.length ? `${playIdx + 1}/${points.length}` : "0/0"}
            </span>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, points.length - 1)}
          value={playIdx}
          onChange={(e) => {
            setPlaying(false);
            setPlayIdx(Number(e.target.value));
          }}
          disabled={points.length < 2}
          className="travel-scrubber"
          aria-label="Travel timeline"
        />
        <div className="travel-scrubber-labels muted mono">
          <span>{points[0] ? formatJourneyClock(points[0].t) : "—"}</span>
          <span>{Math.round(progress * 100)}%</span>
          <span>
            {points.length ? formatJourneyClock(points[points.length - 1].t) : "—"}
          </span>
        </div>
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

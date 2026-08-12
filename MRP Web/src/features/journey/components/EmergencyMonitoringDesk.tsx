"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useVaultSession } from "@/lib/vault-session";
import { requestDriveAppDataToken } from "@/lib/drive-appdata";
import {
  asRows,
  eventTimeMs,
  eventType,
  formatEventType,
  num,
  pathDistanceKm,
  rowLatLng,
  travelPoints,
} from "@/lib/vault-selectors";
import {
  computeDayAnalytics,
  fenceAtPoint,
} from "../lib/journey-analytics";
import {
  dateFromIndexName,
  GpsChunkWindow,
  listGpsIndexFiles,
  loadDayIndex,
  mergeTrailWithVaultEvents,
  sparsePointsFromVault,
} from "../lib/gps-drive";
import {
  downloadText,
  pointsToCsv,
  pointsToGeoJson,
  pointsToGpx,
} from "../lib/journey-export";
import { useAuth } from "@/lib/auth-context";
import {
  formatAddress,
  nearbyPlaces,
  reverseGeocode,
  type NearbyPlace,
} from "../lib/journey-geocode";
import { buildHeatGrid } from "../lib/journey-heatmap";
import { buildJourneyHeuristics } from "../lib/journey-heuristics";
import { printJourneyPdf } from "../lib/journey-pdf";
import { useJourneyPlayback } from "../store/useJourneyPlayback";
import { useNavigableTrail } from "../hooks/useNavigableTrail";
import type { GpsPoint } from "../types";
import { PLAYBACK_SPEEDS, type PlaybackSpeeds } from "../types";
import type { FenceCircle, PathMode } from "./JourneyMap";
import {
  formatJourneyClock,
  formatLiveClock,
  localTodayISO,
  shiftLocalDate,
  dayBoundsLocal,
} from "../lib/local-date";

const JourneyMap = dynamic(() => import("./JourneyMap").then((m) => m.JourneyMap), {
  ssr: false,
  loading: () => (
    <div className="panel muted" style={{ minHeight: 360, display: "grid", placeItems: "center" }}>
      Loading map…
    </div>
  ),
});

function dayBounds(isoDate: string): { from: number; to: number } {
  return dayBoundsLocal(isoDate);
}

function shiftDate(iso: string, days: number): string {
  return shiftLocalDate(iso, days);
}

function formatClock(ms: number): string {
  return formatJourneyClock(ms);
}

export function EmergencyMonitoringDesk() {
  const { vault, unlocked, hydrating, getSessionPin } = useVaultSession();
  const { getIdToken } = useAuth();
  const day = useJourneyPlayback((s) => s.day);
  const index = useJourneyPlayback((s) => s.index);
  const source = useJourneyPlayback((s) => s.source);
  const loading = useJourneyPlayback((s) => s.loading);
  const error = useJourneyPlayback((s) => s.error);
  const pose = useJourneyPlayback((s) => s.pose);
  const playing = useJourneyPlayback((s) => s.playing);
  const speed = useJourneyPlayback((s) => s.speed);
  const points = useJourneyPlayback((s) => s.points);
  const engine = useJourneyPlayback((s) => s.engine);
  const setDayMeta = useJourneyPlayback((s) => s.setDayMeta);
  const setPoints = useJourneyPlayback((s) => s.setPoints);
  const setLoading = useJourneyPlayback((s) => s.setLoading);
  const setError = useJourneyPlayback((s) => s.setError);
  const play = useJourneyPlayback((s) => s.play);
  const pause = useJourneyPlayback((s) => s.pause);
  const stop = useJourneyPlayback((s) => s.stop);
  const restart = useJourneyPlayback((s) => s.restart);
  const seek = useJourneyPlayback((s) => s.seek);
  const seekBy = useJourneyPlayback((s) => s.seekBy);
  const setSpeed = useJourneyPlayback((s) => s.setSpeed);
  const hydrateFromStorage = useJourneyPlayback((s) => s.hydrateFromStorage);

  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [follow, setFollow] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<string>("ALL");
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  /** Raw GPS from Drive/vault — used for OSRM snap (never feed road output back). */
  const [sourceGps, setSourceGps] = useState<GpsPoint[]>([]);
  const [pathMode, setPathMode] = useState<PathMode>("roads");
  const [liveNow, setLiveNow] = useState(() => formatLiveClock());

  useEffect(() => {
    const id = window.setInterval(() => setLiveNow(formatLiveClock()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { trail, routing: routingRoads, error: routeError } = useNavigableTrail(sourceGps);

  // Keep playback on real GPS timestamps. Road geometry is map-only (roadPath / pathLegs).

  const fences: FenceCircle[] = useMemo(() => {
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

  const dayEvents = useMemo(() => {
    if (!day || !vault) return [];
    const { from, to } = dayBounds(day);
    return asRows(vault)
      .filter((r) => {
        const t = eventTimeMs(r);
        return t >= from && t <= to;
      })
      .sort((a, b) => eventTimeMs(a) - eventTimeMs(b));
  }, [vault, day]);

  const filteredEvents = useMemo(() => {
    if (eventFilter === "ALL") return dayEvents;
    const f = eventFilter.toUpperCase();
    return dayEvents.filter((r) => eventType(r).toUpperCase().includes(f));
  }, [dayEvents, eventFilter]);

  const dayMedia = useMemo(() => {
    if (!day || !vault?.selfies?.length) return [];
    const { from, to } = dayBounds(day);
    return (vault.selfies || [])
      .map((s, i) => {
        const o = s as Record<string, unknown>;
        const t = Number(o.atMs ?? o.timestamp ?? o.time ?? 0);
        const lat = num(o.latitude ?? o.lat);
        const lng = num(o.longitude ?? o.lng);
        if (t < from || t > to || lat == null || lng == null) return null;
        return { id: String(o.eventId || `media-${i}`), lat, lng, t };
      })
      .filter(Boolean) as Array<{ id: string; lat: number; lng: number; t: number }>;
  }, [vault?.selfies, day]);

  const eventMapMarkers = useMemo(() => {
    return dayEvents
      .map((row, i) => {
        const ll = rowLatLng(row);
        if (!ll) return null;
        const t = eventTimeMs(row);
        return {
          id: String(row.id || `ev-${t}-${i}`),
          lat: ll.lat,
          lng: ll.lng,
          t,
          label: formatEventType(eventType(row)),
        };
      })
      .filter(Boolean) as Array<{ id: string; lat: number; lng: number; t: number; label: string }>;
  }, [dayEvents]);

  const analytics = useMemo(
    () =>
      computeDayAnalytics(points, index, dayEvents, eventType, dayMedia.length),
    [points, index, dayEvents, dayMedia.length],
  );

  const activeFence = useMemo(() => {
    if (!pose) return null;
    return fenceAtPoint(pose.lat, pose.lng, fences);
  }, [pose, fences]);

  const heuristics = useMemo(() => buildJourneyHeuristics(points), [points]);
  const heatCells = useMemo(() => buildHeatGrid(points), [points]);

  // Reverse geocode + nearby when paused at a position
  useEffect(() => {
    if (playing || !pose) return;
    let cancelled = false;
    (async () => {
      setGeoLoading(true);
      try {
        const token = await getIdToken();
        const [rev, near] = await Promise.all([
          reverseGeocode(pose.lat, pose.lng, token),
          nearbyPlaces(pose.lat, pose.lng, token, 600),
        ]);
        if (!cancelled) {
          setAddress(formatAddress(rev));
          setNearby(near.slice(0, 8));
        }
      } finally {
        if (!cancelled) setGeoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playing, pose?.lat, pose?.lng, pose, getIdToken]);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  const loadSparseFallback = useCallback(
    (date: string, note: string | null) => {
      const { from, to } = dayBounds(date);
      const sparse = travelPoints(vault, from, to);
      const gps = sparsePointsFromVault(sparse);
      setDayMeta(date, null, "vault-sparse");
      setSourceGps(gps);
      setPoints(gps);
      setBanner(
        note ??
          (sparse.length
            ? "No GPS day pack — path from vault event locations (events ⇒ path). Sync phone to upload trail stamps."
            : "No GPS day pack or vault travel points for this day."),
      );
    },
    [vault, setDayMeta, setPoints],
  );

  const loadDay = useCallback(
    async (date: string) => {
      if (!unlocked) return;
      setLoading(true);
      setError(null);
      setBanner(null);
      try {
        const pin = getSessionPin();
        if (!pin) throw new Error("Session PIN unavailable — unlock again");
        const token = await requestDriveAppDataToken();
        const indexes = await listGpsIndexFiles(token);
        const dayFile = indexes.find((f) => dateFromIndexName(f.name) === date);
        const { from, to } = dayBounds(date);
        const vaultGps = sparsePointsFromVault(travelPoints(vault, from, to));
        if (dayFile) {
          const dayIndex = await loadDayIndex(token, pin, dayFile);
          setDayMeta(date, dayIndex, "daypack");
          const win = new GpsChunkWindow(token, pin, date, dayIndex.hours || []);
          const pts = await win.loadRecentThenRest((early) => {
            const mergedEarly = mergeTrailWithVaultEvents(early, vaultGps);
            setSourceGps(mergedEarly);
            setPoints(mergedEarly);
            setLoading(false);
            setBanner("Showing last hour — loading full day trail…");
          });
          if (pts.length) {
            const merged = mergeTrailWithVaultEvents(pts, vaultGps);
            setSourceGps(merged);
            setPoints(merged);
            setBanner(
              vaultGps.length && merged.length > pts.length
                ? "Day pack merged with vault event locations."
                : null,
            );
            return;
          }
        }
        loadSparseFallback(date, null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load journey";
        setError(msg);
        loadSparseFallback(
          date,
          `Day pack unavailable (${msg}). Using vault travel points when present.`,
        );
      } finally {
        setLoading(false);
      }
    },
    [unlocked, getSessionPin, setLoading, setError, setDayMeta, setPoints, loadSparseFallback, vault],
  );

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await requestDriveAppDataToken();
        const files = await listGpsIndexFiles(token);
        const days = files
          .map((f) => dateFromIndexName(f.name))
          .filter((d): d is string => Boolean(d))
          .sort()
          .reverse();
        if (!cancelled) {
          setAvailableDays(days);
          const today = localTodayISO();
          const initial =
            (day && days.includes(day) ? day : null) ||
            (days.includes(today) ? today : null) ||
            days[0] ||
            today;
          await loadDay(initial);
        }
      } catch {
        if (!cancelled) {
          const today = localTodayISO();
          setAvailableDays([]);
          await loadDay(day || today);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unlock once
  }, [unlocked]);

  // After full vault hydrates, fold new event coords into the trail without waiting for reload.
  useEffect(() => {
    if (!unlocked || hydrating || !day) return;
    const { from, to } = dayBounds(day);
    const vaultGps = sparsePointsFromVault(travelPoints(vault, from, to));
    if (!vaultGps.length) return;
    setSourceGps((prev) => {
      const merged = mergeTrailWithVaultEvents(prev, vaultGps);
      if (merged.length === prev.length) return prev;
      setPoints(merged);
      return merged;
    });
  }, [hydrating, unlocked, day, vault, setPoints]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (playing) pause();
        else play();
      } else if (e.code === "ArrowLeft") {
        seekBy(e.shiftKey ? -60_000 : -10_000);
      } else if (e.code === "ArrowRight") {
        seekBy(e.shiftKey ? 60_000 : 10_000);
      } else if (e.key === "[") {
        const i = PLAYBACK_SPEEDS.indexOf(speed);
        if (i > 0) setSpeed(PLAYBACK_SPEEDS[i - 1]);
      } else if (e.key === "]") {
        const i = PLAYBACK_SPEEDS.indexOf(speed);
        if (i >= 0 && i < PLAYBACK_SPEEDS.length - 1) setSpeed(PLAYBACK_SPEEDS[i + 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, pause, play, seekBy, speed, setSpeed]);

  const range = engine.range();
  const progress = pose?.progress ?? 0;
  const km =
    index?.distanceM != null
      ? index.distanceM / 1000
      : pathDistanceKm(points.map((p) => ({ lat: p.lat, lng: p.lng, t: p.t })));

  return (
    <div className="jpni-desk">
      <header className="jpni-hero rise">
        <div>
          <p className="jpni-kicker">Investigation · security trail</p>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            Emergency monitoring
          </h1>
          <p className="page-lead" style={{ marginBottom: 0, marginTop: "0.35rem" }}>
            Dense GPS playback with unlock / geofence / network events for incident review — not the
            daily Travel trip view.
          </p>
        </div>
        <div className="jpni-live-chip mono" title="Device wall clock (browser)">
          Live {liveNow}
        </div>
      </header>

      {banner && (
        <div
          className="panel rise"
          style={{ marginBottom: "0.75rem", borderColor: "var(--warn, #d97706)" }}
        >
          <span className="muted">{banner}</span>
        </div>
      )}
      {error && (
        <div className="panel rise" style={{ marginBottom: "0.75rem" }}>
          <span className="muted">{error}</span>
        </div>
      )}

      <div className="jpni-layout">
        <aside className="panel jpni-side">
          <h2>Day</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.35rem" }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                const d = shiftDate(day || localTodayISO(), -1);
                void loadDay(d);
              }}
            >
              ←
            </button>
            <input
              id="jpni-day"
              className="input"
              type="date"
              value={day || ""}
              onChange={(e) => void loadDay(e.target.value)}
              style={{ maxWidth: 160 }}
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                const d = shiftDate(day || localTodayISO(), 1);
                void loadDay(d);
              }}
            >
              →
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => void loadDay(localTodayISO())}
            >
              Today
            </button>
          </div>
          {availableDays.length > 0 && (
            <p className="muted" style={{ marginTop: "0.5rem", fontSize: 12 }}>
              Packs: {availableDays.slice(0, 8).join(", ")}
              {availableDays.length > 8 ? "…" : ""}
            </p>
          )}

          <ul
            className="muted"
            style={{ listStyle: "none", marginTop: "0.85rem", lineHeight: 1.7, padding: 0 }}
          >
            <li>
              Source:{" "}
              {source === "daypack"
                ? "GPS day pack"
                : source === "vault-sparse"
                  ? "Vault sparse"
                  : "—"}
            </li>
            <li>Points: {loading ? "…" : points.length}</li>
            <li>
              Route:{" "}
              {routingRoads
                ? "Snapping to roads…"
                : trail?.source === "osrm"
                  ? "Road network (OSRM)"
                  : "GPS fallback"}
            </li>
            {routeError ? <li className="muted">Routing: {routeError}</li> : null}
            <li>Distance: {km.toFixed(2)} km</li>
            {index && (
              <>
                <li>Max speed: {(index.maxSpeed * 3.6).toFixed(1)} km/h</li>
                <li>Stops: {index.stopCount}</li>
                <li>Moving: {Math.round(index.movingMs / 60000)} min</li>
              </>
            )}
          </ul>

          <h3 style={{ marginTop: "1rem", fontSize: 14 }}>Timeline</h3>
          <div className="tab-row" style={{ margin: "0.35rem 0 0.5rem", flexWrap: "wrap" }}>
            {(["ALL", "UNLOCK", "GEOFENCE", "SIM", "WIFI", "USB"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`btn btn-sm ${eventFilter === f ? "btn-primary" : ""}`}
                onClick={() => setEventFilter(f)}
              >
                {f === "ALL" ? "All" : f[0] + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <div className="jpni-events">
            {filteredEvents.length === 0 && <p className="muted">No vault events this day.</p>}
            {filteredEvents.map((row) => {
              const t = eventTimeMs(row);
              return (
                <button
                  key={String(row.id || t)}
                  type="button"
                  className="jpni-event"
                  onClick={() => seek(t)}
                >
                  <span>{formatEventType(eventType(row))}</span>
                  <span className="muted">{formatClock(t)}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="jpni-map-wrap panel" style={{ padding: 0, overflow: "hidden" }}>
          <JourneyMap
            points={points}
            pose={pose}
            fences={fences}
            follow={follow}
            onFollowChange={setFollow}
            mediaMarkers={dayMedia}
            heatCells={heatCells}
            stops={heuristics.stops}
            showHeatmap={showHeatmap}
            roadPath={trail?.path}
            pathLegs={trail?.pathLegs}
            routing={routingRoads}
            pathMode={pathMode}
            onPathModeChange={setPathMode}
            eventMarkers={eventMapMarkers}
            showControls
          />
        </section>

        <aside className="panel jpni-side">
          <h3 style={{ fontSize: 14, marginTop: 0 }}>Journey intelligence</h3>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{heuristics.summary}</p>
          <ul className="muted" style={{ listStyle: "none", padding: 0, fontSize: 12, lineHeight: 1.6 }}>
            {heuristics.insights.map((i) => (
              <li key={i.id} style={{ color: i.severity === "warn" ? "var(--warn, #d97706)" : undefined }}>
                <strong>{i.title}</strong> — {i.detail}
              </li>
            ))}
          </ul>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: "0.5rem" }}>
            <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} />
            <span className="muted">Heatmap overlay</span>
          </label>

          <h3 style={{ fontSize: 14, marginTop: "1rem" }}>Analytics</h3>
          <ul className="muted" style={{ listStyle: "none", padding: 0, lineHeight: 1.75, fontSize: 13 }}>
            <li>Duration: {analytics.durationMin} min</li>
            <li>Unlocks: {analytics.unlockCount}</li>
            <li>Geofence in/out: {analytics.geofenceEnter}/{analytics.geofenceExit}</li>
            <li>Network: {analytics.networkEvents}</li>
            <li>SIM: {analytics.simEvents}</li>
            <li>Media: {analytics.mediaCount}</li>
          </ul>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: "0.65rem" }}>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!points.length || !day}
              onClick={() =>
                day &&
                downloadText(
                  `journey-${day}.geojson`,
                  JSON.stringify(pointsToGeoJson(points, day), null, 2),
                  "application/geo+json",
                )
              }
            >
              GeoJSON
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!points.length || !day}
              onClick={() => day && downloadText(`journey-${day}.gpx`, pointsToGpx(points, day), "application/gpx+xml")}
            >
              GPX
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!points.length || !day}
              onClick={() => day && downloadText(`journey-${day}.csv`, pointsToCsv(points), "text/csv")}
            >
              CSV
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!points.length || !day}
              onClick={() =>
                day &&
                printJourneyPdf({
                  day,
                  points,
                  index,
                  analytics,
                  heuristics,
                  address: address || undefined,
                })
              }
            >
              PDF
            </button>
          </div>
          <h3 style={{ fontSize: 14, marginTop: "1rem" }}>Pose</h3>
          <ul className="muted" style={{ listStyle: "none", padding: 0, lineHeight: 1.75 }}>
            <li>Trail time: {formatClock(pose?.t ?? 0)}</li>
            <li>Speed: {pose ? `${(pose.speed * 3.6).toFixed(1)} km/h` : "—"}</li>
            <li>Heading: {pose ? `${Math.round(pose.heading)}°` : "—"}</li>
            <li>Accuracy: {pose ? `${Math.round(pose.accuracy)} m` : "—"}</li>
            <li>Motion: {pose?.motion ?? "—"}</li>
            <li>Pos: {pose ? `${pose.lat.toFixed(5)}, ${pose.lng.toFixed(5)}` : "—"}</li>
            <li>Geofence: {activeFence?.name || activeFence?.id || "Outside zones"}</li>
            <li>Address: {geoLoading ? "…" : address || "—"}</li>
          </ul>
          {nearby.length > 0 && !playing && (
            <>
              <h3 style={{ fontSize: 14, marginTop: "0.75rem" }}>Nearby</h3>
              <ul className="muted" style={{ listStyle: "none", padding: 0, fontSize: 12, lineHeight: 1.55 }}>
                {nearby.map((p) => (
                  <li key={`${p.name}-${p.lat}`}>
                    {p.name} · {Math.round(p.distanceM)} m {p.direction} · {p.category}
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>

      <div className="jpni-transport panel">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <button type="button" className="btn btn-sm" onClick={() => stop()}>
              Stop
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => (playing ? pause() : play())}>
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => restart()}>
              Restart
            </button>
            <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              Speed
              <select
                className="input"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value) as PlaybackSpeeds)}
                style={{ width: 90 }}
              >
                {PLAYBACK_SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mono muted" style={{ fontSize: 12, display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
            <span title="Playback trail time">Trail {formatClock(pose?.t ?? 0)}</span>
            <span>·</span>
            <span title="Wall clock">Live {liveNow}</span>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(e) => {
            if (!range) return;
            const u = Number(e.target.value) / 1000;
            seek(range.start + (range.end - range.start) * u);
          }}
          style={{ width: "100%", marginTop: "0.65rem" }}
          disabled={!range}
          aria-label="Emergency timeline"
        />
        <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span>{formatClock(range?.start ?? 0)}</span>
          <span>{Math.round(progress * 100)}%</span>
          <span>{formatClock(range?.end ?? 0)}</span>
        </div>
        <p className="muted" style={{ fontSize: 11, marginTop: "0.35rem", marginBottom: 0 }}>
          Space play/pause · ←→ seek · [ ] speed
        </p>
      </div>
    </div>
  );
}

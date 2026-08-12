"use client";

import { useCallback, useEffect, useState } from "react";
import { useVaultSession } from "@/lib/vault-session";
import { requestDriveAppDataToken } from "@/lib/drive-appdata";
import { pathDistanceKm, travelPoints } from "@/lib/vault-selectors";
import type { GpsDayIndex, GpsPoint } from "../types";
import {
  dateFromIndexName,
  GpsChunkWindow,
  listGpsIndexFiles,
  loadDayIndex,
  mergeTrailWithVaultEvents,
  sparsePointsFromVault,
} from "../lib/gps-drive";
import { dayBoundsLocal, localTodayISO } from "../lib/local-date";

export type GpsTrailSource = "daypack" | "vault-sparse" | "merged" | null;

export type TrailEventMarker = {
  id: string;
  lat: number;
  lng: number;
  t: number;
  label?: string;
};

export type GpsDayTrailState = {
  date: string;
  points: GpsPoint[];
  index: GpsDayIndex | null;
  source: GpsTrailSource;
  loading: boolean;
  error: string | null;
  banner: string | null;
  availableDays: string[];
  distanceKm: number;
  eventMarkers: TrailEventMarker[];
  loadDay: (date: string) => Promise<void>;
  refreshDays: () => Promise<void>;
};

/**
 * Load dense GPS day packs from Drive (PIN decrypt), falling back to vault
 * GPS-tagged timeline rows. Shared by Travel + Emergency monitoring.
 */
export function useGpsDayTrail(opts?: { autoLoad?: boolean }): GpsDayTrailState {
  const { vault, unlocked, getSessionPin } = useVaultSession();
  const autoLoad = opts?.autoLoad !== false;

  const [date, setDate] = useState(() => localTodayISO());
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [index, setIndex] = useState<GpsDayIndex | null>(null);
  const [source, setSource] = useState<GpsTrailSource>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [eventMarkers, setEventMarkers] = useState<TrailEventMarker[]>([]);

  const vaultSlice = useCallback(
    (day: string) => {
      const { from, to } = dayBoundsLocal(day);
      const sparse = travelPoints(vault, from, to);
      const gps = sparsePointsFromVault(sparse);
      const markers: TrailEventMarker[] = sparse.map((p, i) => ({
        id: `vault-${p.t}-${i}`,
        lat: p.lat,
        lng: p.lng,
        t: p.t,
      }));
      return { sparse, gps, markers };
    },
    [vault],
  );

  const loadSparseFallback = useCallback(
    (day: string, note: string | null) => {
      const { sparse, gps, markers } = vaultSlice(day);
      setIndex(null);
      setSource("vault-sparse");
      setPoints(gps);
      setEventMarkers(markers);
      setBanner(
        note ??
          (sparse.length
            ? "No GPS day pack for this day — showing vault event locations on the path. Sync the phone so trail stamps upload as day packs."
            : "No GPS day pack or vault travel points for this day."),
      );
    },
    [vaultSlice],
  );

  const loadDay = useCallback(
    async (day: string) => {
      if (!unlocked) return;
      setDate(day);
      setLoading(true);
      setError(null);
      setBanner(null);
      const { sparse, gps: vaultGps, markers } = vaultSlice(day);
      setEventMarkers(markers);
      try {
        const pin = getSessionPin();
        if (!pin) throw new Error("Session PIN unavailable — unlock again");
        const token = await requestDriveAppDataToken();
        const indexes = await listGpsIndexFiles(token);
        const dayFile = indexes.find((f) => dateFromIndexName(f.name) === day);
        if (dayFile) {
          const dayIndex = await loadDayIndex(token, pin, dayFile);
          const win = new GpsChunkWindow(token, pin, day, dayIndex.hours || []);
          setIndex(dayIndex);
          const pts = await win.loadRecentThenRest((early) => {
            const mergedEarly = mergeTrailWithVaultEvents(early, vaultGps);
            setSource(vaultGps.length ? "merged" : "daypack");
            setPoints(mergedEarly);
            setLoading(false);
            setBanner("Showing last hour — loading full day trail…");
          });
          if (pts.length) {
            const merged = mergeTrailWithVaultEvents(pts, vaultGps);
            setSource(vaultGps.length && merged.length > pts.length ? "merged" : "daypack");
            setPoints(merged);
            setBanner(
              vaultGps.length && merged.length > pts.length
                ? "Day pack + vault event locations merged onto the path."
                : null,
            );
            return;
          }
        }
        if (vaultGps.length) {
          setIndex(null);
          setSource("vault-sparse");
          setPoints(vaultGps);
          setBanner(
            sparse.length
              ? "Showing vault event locations (events ⇒ path). Phone sync will add denser trail stamps."
              : null,
          );
          return;
        }
        loadSparseFallback(day, null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load journey";
        setError(msg);
        loadSparseFallback(
          day,
          `Day pack unavailable (${msg}). Using vault travel points when present.`,
        );
      } finally {
        setLoading(false);
      }
    },
    [unlocked, getSessionPin, loadSparseFallback, vaultSlice],
  );

  const refreshDays = useCallback(async () => {
    if (!unlocked) return;
    try {
      const token = await requestDriveAppDataToken();
      const files = await listGpsIndexFiles(token);
      const days = files
        .map((f) => dateFromIndexName(f.name))
        .filter((d): d is string => Boolean(d))
        .sort((a, b) => b.localeCompare(a));
      setAvailableDays(days);
    } catch {
      setAvailableDays([]);
    }
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked || !autoLoad) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await requestDriveAppDataToken();
        const files = await listGpsIndexFiles(token);
        const days = files
          .map((f) => dateFromIndexName(f.name))
          .filter((d): d is string => Boolean(d))
          .sort((a, b) => b.localeCompare(a));
        if (cancelled) return;
        setAvailableDays(days);
        const today = localTodayISO();
        const initial = days.includes(today) ? today : days[0] || today;
        await loadDay(initial);
      } catch {
        if (!cancelled) {
          setAvailableDays([]);
          await loadDay(localTodayISO());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unlock once
  }, [unlocked, autoLoad]);

  const distanceKm =
    index?.distanceM != null
      ? index.distanceM / 1000
      : pathDistanceKm(points.map((p) => ({ lat: p.lat, lng: p.lng, t: p.t })));

  return {
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
    refreshDays,
  };
}

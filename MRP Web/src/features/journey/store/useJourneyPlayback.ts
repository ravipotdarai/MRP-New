"use client";

import { create } from "zustand";
import { PlaybackEngine } from "../lib/playback-engine";
import type { GpsDayIndex, GpsPoint, InterpolatedPose, PlaybackSpeeds } from "../types";
import { PLAYBACK_SPEEDS } from "../types";

const LS_KEY = "mrp_jpni_playback_v1";

type Persisted = {
  day: string | null;
  speed: PlaybackSpeeds;
  virtualT: number;
};

function readPersisted(): Persisted {
  if (typeof window === "undefined") {
    return { day: null, speed: 1, virtualT: 0 };
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { day: null, speed: 1, virtualT: 0 };
    const p = JSON.parse(raw) as Persisted;
    const speed = PLAYBACK_SPEEDS.includes(p.speed) ? p.speed : 1;
    return { day: p.day ?? null, speed, virtualT: p.virtualT || 0 };
  } catch {
    return { day: null, speed: 1, virtualT: 0 };
  }
}

function writePersisted(p: Persisted) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

type JourneyState = {
  engine: PlaybackEngine;
  day: string | null;
  index: GpsDayIndex | null;
  source: "daypack" | "vault-sparse" | null;
  loading: boolean;
  error: string | null;
  pose: InterpolatedPose | null;
  playing: boolean;
  speed: PlaybackSpeeds;
  points: GpsPoint[];
  setDayMeta: (day: string, index: GpsDayIndex | null, source: "daypack" | "vault-sparse") => void;
  setPoints: (points: GpsPoint[]) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  restart: () => void;
  seek: (ms: number) => void;
  seekBy: (deltaMs: number) => void;
  setSpeed: (s: PlaybackSpeeds) => void;
  hydrateFromStorage: () => Persisted;
  persist: () => void;
};

let unsub: (() => void) | null = null;

export const useJourneyPlayback = create<JourneyState>((set, get) => {
  const engine = new PlaybackEngine();

  const persistState = () => {
    writePersisted({
      day: get().day,
      speed: get().speed,
      virtualT: engine.getVirtualT(),
    });
  };

  unsub?.();
  unsub = engine.subscribe((pose, playing) => {
    set({ pose, playing });
    persistState();
  });

  return {
    engine,
    day: null,
    index: null,
    source: null,
    loading: false,
    error: null,
    pose: null,
    playing: false,
    speed: 1,
    points: [],
    setDayMeta: (day, index, source) => {
      set({ day, index, source, error: null });
      writePersisted({ day, speed: get().speed, virtualT: engine.getVirtualT() });
    },
    setPoints: (points) => {
      engine.setPoints(points);
      set({ points });
      if (!points.length) return;
      const t0 = points[0].t;
      const t1 = points[points.length - 1].t;
      const persisted = readPersisted();
      if (persisted.day === get().day && persisted.virtualT >= t0 && persisted.virtualT <= t1) {
        engine.seek(persisted.virtualT);
      } else {
        engine.seek(t0);
      }
    },
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    play: () => engine.play(),
    pause: () => engine.pause(),
    stop: () => engine.stop(),
    restart: () => engine.restart(),
    seek: (ms) => engine.seek(ms),
    seekBy: (deltaMs) => engine.seekBy(deltaMs),
    setSpeed: (s) => {
      engine.setSpeed(s);
      set({ speed: s });
      persistState();
    },
    hydrateFromStorage: () => {
      const p = readPersisted();
      engine.setSpeed(p.speed);
      set({ speed: p.speed, day: p.day });
      return p;
    },
    persist: persistState,
  };
});

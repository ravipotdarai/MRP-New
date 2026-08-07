/**
 * rAF journey playback — interpolate lat/lng/heading between samples.
 */

import type { GpsPoint, InterpolatedPose, PlaybackSpeeds } from "../types";

export type PlaybackListener = (pose: InterpolatedPose | null, playing: boolean) => void;

export class PlaybackEngine {
  private points: GpsPoint[] = [];
  private playing = false;
  private speed: PlaybackSpeeds = 1;
  private virtualT = 0;
  private lastFrameTs = 0;
  private raf = 0;
  private listeners = new Set<PlaybackListener>();

  setPoints(points: GpsPoint[]) {
    this.points = [...points].sort((a, b) => a.t - b.t);
    if (this.points.length) {
      if (this.virtualT < this.points[0].t || this.virtualT > this.points[this.points.length - 1].t) {
        this.virtualT = this.points[0].t;
      }
    } else {
      this.virtualT = 0;
    }
    this.emit();
  }

  getPoints(): GpsPoint[] {
    return this.points;
  }

  getVirtualT(): number {
    return this.virtualT;
  }

  getSpeed(): PlaybackSpeeds {
    return this.speed;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  range(): { start: number; end: number } | null {
    if (this.points.length < 1) return null;
    return { start: this.points[0].t, end: this.points[this.points.length - 1].t };
  }

  subscribe(fn: PlaybackListener): () => void {
    this.listeners.add(fn);
    fn(this.poseAt(this.virtualT), this.playing);
    return () => this.listeners.delete(fn);
  }

  play() {
    if (this.points.length < 2) return;
    const end = this.points[this.points.length - 1].t;
    if (this.virtualT >= end) this.virtualT = this.points[0].t;
    this.playing = true;
    this.lastFrameTs = 0;
    this.tick();
    this.emit();
  }

  pause() {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.emit();
  }

  stop() {
    this.pause();
    if (this.points.length) this.virtualT = this.points[0].t;
    this.emit();
  }

  restart() {
    this.stop();
    this.play();
  }

  setSpeed(speed: PlaybackSpeeds) {
    this.speed = speed;
    this.emit();
  }

  seek(ms: number) {
    const r = this.range();
    if (!r) return;
    this.virtualT = Math.min(r.end, Math.max(r.start, ms));
    this.emit();
  }

  seekBy(deltaMs: number) {
    this.seek(this.virtualT + deltaMs);
  }

  dispose() {
    this.pause();
    this.listeners.clear();
  }

  private tick = (ts?: number) => {
    if (!this.playing) return;
    const now = ts ?? performance.now();
    if (this.lastFrameTs > 0) {
      const dt = (now - this.lastFrameTs) * this.speed;
      this.virtualT += dt;
      const end = this.points[this.points.length - 1]?.t ?? 0;
      if (this.virtualT >= end) {
        this.virtualT = end;
        this.playing = false;
        this.emit();
        return;
      }
    }
    this.lastFrameTs = now;
    this.emit();
    this.raf = requestAnimationFrame(this.tick);
  };

  poseAt(t: number): InterpolatedPose | null {
    const pts = this.points;
    if (!pts.length) return null;
    if (pts.length === 1 || t <= pts[0].t) {
      const p = pts[0];
      return {
        t: p.t,
        lat: p.lat,
        lng: p.lng,
        heading: p.h ?? 0,
        speed: p.s ?? 0,
        accuracy: p.a ?? 0,
        motion: p.m ?? "idle",
        progress: 0,
      };
    }
    const last = pts[pts.length - 1];
    if (t >= last.t) {
      return {
        t: last.t,
        lat: last.lat,
        lng: last.lng,
        heading: last.h ?? 0,
        speed: last.s ?? 0,
        accuracy: last.a ?? 0,
        motion: last.m ?? "idle",
        progress: 1,
      };
    }
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const a = pts[lo];
    const b = pts[hi];
    const span = Math.max(1, b.t - a.t);
    const u = (t - a.t) / span;
    const start = pts[0].t;
    const end = last.t;
    const progress = end > start ? (t - start) / (end - start) : 0;
    return {
      t,
      lat: a.lat + (b.lat - a.lat) * u,
      lng: a.lng + (b.lng - a.lng) * u,
      heading: lerpAngle(a.h ?? 0, b.h ?? 0, u),
      speed: (a.s ?? 0) + ((b.s ?? 0) - (a.s ?? 0)) * u,
      accuracy: (a.a ?? 0) + ((b.a ?? 0) - (a.a ?? 0)) * u,
      motion: u < 0.5 ? (a.m ?? "idle") : (b.m ?? "idle"),
      progress,
    };
  }

  private emit() {
    const pose = this.poseAt(this.virtualT);
    for (const fn of this.listeners) fn(pose, this.playing);
  }
}

function lerpAngle(a: number, b: number, u: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * u + 360) % 360;
}

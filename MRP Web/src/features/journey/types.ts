/** JPNI shared types — GPS day packs + playback. */

export type JourneyMotion = "idle" | "walk" | "drive" | string;

export type GpsPoint = {
  t: number;
  lat: number;
  lng: number;
  s?: number;
  h?: number;
  a?: number;
  alt?: number;
  b?: number;
  n?: string;
  g?: boolean;
  m?: JourneyMotion;
};

export type GpsDayIndex = {
  version: number;
  date: string;
  journeyStart: number;
  journeyEnd: number;
  hours: number[];
  bbox: [number, number, number, number];
  distanceM: number;
  movingMs: number;
  idleMs: number;
  maxSpeed: number;
  avgSpeed: number;
  stopCount: number;
  geofenceVisitCount: number;
  mediaCount: number;
  pointCount: number;
  checksum: string;
};

export type GpsHourChunk = {
  version: number;
  date: string;
  hour: number;
  points: GpsPoint[];
};

export type PlaybackSpeeds = 0.25 | 0.5 | 1 | 2 | 4 | 8 | 16 | 32 | 64;

export const PLAYBACK_SPEEDS: PlaybackSpeeds[] = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64];

export type InterpolatedPose = {
  t: number;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  accuracy: number;
  motion: JourneyMotion;
  progress: number;
};

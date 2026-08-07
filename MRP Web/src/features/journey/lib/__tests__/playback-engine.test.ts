import { describe, expect, it } from "vitest";
import { PlaybackEngine } from "../playback-engine";
import type { GpsPoint } from "../../types";

const pts: GpsPoint[] = [
  { t: 0, lat: 18.52, lng: 73.85 },
  { t: 10_000, lat: 18.53, lng: 73.86 },
  { t: 20_000, lat: 18.54, lng: 73.87 },
];

describe("PlaybackEngine", () => {
  it("interpolates mid-point", () => {
    const e = new PlaybackEngine();
    e.setPoints(pts);
    e.seek(5000);
    const pose = e.poseAt(5000);
    expect(pose).not.toBeNull();
    expect(pose!.lat).toBeGreaterThan(18.52);
    expect(pose!.lat).toBeLessThan(18.53);
  });

  it("seek clamps to range", () => {
    const e = new PlaybackEngine();
    e.setPoints(pts);
    e.seek(999_999);
    expect(e.getVirtualT()).toBe(20_000);
  });
});

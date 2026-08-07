import { describe, expect, it } from "vitest";
import {
  isSparseTrail,
  shouldBridge,
  splitPathByTime,
  thinForRouting,
} from "../routing/navigable-trail";
import type { GpsPoint } from "../../types";

describe("navigable-trail helpers", () => {
  it("thins dense GPS while keeping endpoints", () => {
    const pts: GpsPoint[] = Array.from({ length: 20 }, (_, i) => ({
      t: i * 1000,
      lat: 18.52 + i * 0.00001,
      lng: 73.85,
    }));
    const thinned = thinForRouting(pts, 50);
    expect(thinned.length).toBeLessThan(pts.length);
    expect(thinned[0]).toEqual(pts[0]);
    expect(thinned[thinned.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it("splits completed vs remaining by pose spatially", () => {
    const pts: GpsPoint[] = [
      { t: 0, lat: 1, lng: 1 },
      { t: 10, lat: 2, lng: 2 },
      { t: 20, lat: 3, lng: 3 },
    ];
    const { completed, remaining } = splitPathByTime(pts, 10, 2.1, 2.1);
    expect(completed.length).toBeGreaterThanOrEqual(2);
    expect(remaining.length).toBeGreaterThanOrEqual(1);
    expect(completed[completed.length - 1][0]).toBeCloseTo(2.1);
  });

  it("treats sparse vault points as sparse", () => {
    const pts: GpsPoint[] = [
      { t: 0, lat: 18.5, lng: 73.8 },
      { t: 120_000, lat: 18.51, lng: 73.81 },
      { t: 240_000, lat: 18.52, lng: 73.82 },
    ];
    expect(isSparseTrail(pts)).toBe(true);
  });

  it("does not bridge teleports", () => {
    const a: GpsPoint = { t: 0, lat: 18.5, lng: 73.8 };
    const far: GpsPoint = { t: 5_000, lat: 19.5, lng: 74.8 };
    expect(shouldBridge(a, far)).toBe(false);
  });
});

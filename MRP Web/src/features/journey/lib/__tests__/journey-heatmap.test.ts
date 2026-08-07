import { describe, expect, it } from "vitest";
import { buildHeatGrid } from "../journey-heatmap";
import type { GpsPoint } from "../../types";

describe("journey-heatmap", () => {
  it("builds normalized grid cells", () => {
    const pts: GpsPoint[] = [
      { t: 1, lat: 18.52, lng: 73.85 },
      { t: 2, lat: 18.5201, lng: 73.8501 },
      { t: 3, lat: 18.53, lng: 73.86 },
    ];
    const cells = buildHeatGrid(pts, 0.01);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.intensity >= 0 && c.intensity <= 1)).toBe(true);
  });
});

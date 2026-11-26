import { describe, expect, it } from "vitest";
import { fitPathPoints, splitTrailSegments } from "../journey-map-paths";

describe("splitTrailSegments", () => {
  it("keeps a continuous path as one leg", () => {
    const path: [number, number][] = [
      [18.52, 73.85],
      [18.521, 73.851],
      [18.522, 73.852],
    ];
    expect(splitTrailSegments(path)).toHaveLength(1);
  });

  it("breaks continent-scale teleports but keeps local trail", () => {
    const path: [number, number][] = [
      [18.52, 73.85],
      [18.521, 73.851],
      [28.61, 77.2],
      [28.611, 77.201],
    ];
    const legs = splitTrailSegments(path, 25_000);
    expect(legs.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to full path when every gap is large", () => {
    const path: [number, number][] = [
      [18.52, 73.85],
      [19.5, 74.5],
      [20.5, 75.5],
    ];
    const legs = splitTrailSegments(path, 800);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toHaveLength(3);
  });
});

describe("fitPathPoints", () => {
  it("drops extreme outliers for bounds", () => {
    const path: [number, number][] = [];
    for (let i = 0; i < 20; i++) path.push([18.52 + i * 0.001, 73.85 + i * 0.001]);
    path.push([40, 0]);
    const fit = fitPathPoints(path);
    expect(fit.every(([lat]) => lat < 30)).toBe(true);
    expect(fit.length).toBeGreaterThanOrEqual(2);
  });
});

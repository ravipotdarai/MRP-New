import { describe, expect, it } from "vitest";
import { buildJourneyHeuristics, detectStops, simplifyTrail } from "../journey-heuristics";
import type { GpsPoint } from "../../types";

const sample: GpsPoint[] = [
  { t: 1000, lat: 18.52, lng: 73.85, s: 0, m: "idle" },
  { t: 400_000, lat: 18.5201, lng: 73.8501, s: 0, m: "idle" },
  { t: 500_000, lat: 18.53, lng: 73.86, s: 8, m: "drive" },
  { t: 600_000, lat: 18.54, lng: 73.87, s: 25, m: "drive" },
];

describe("journey-heuristics", () => {
  it("detects a long stop", () => {
    const stops = detectStops(sample, 5 * 60_000, 200);
    expect(stops.length).toBeGreaterThanOrEqual(1);
  });

  it("builds summary insights", () => {
    const h = buildJourneyHeuristics(sample);
    expect(h.summary).toContain("GPS samples");
  });

  it("simplifies large trails", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      t: i * 1000,
      lat: 18.52 + i * 0.0001,
      lng: 73.85 + i * 0.0001,
    }));
    const out = simplifyTrail(many, 5);
    expect(out.length).toBeLessThan(many.length);
  });
});

import type { GpsPoint, InterpolatedPose } from "../types";
import { splitPathByTime } from "./routing/navigable-trail";
import type { PathMode } from "../components/journey-map-types";

export function flattenRoadLegs(roadLegs: [number, number][][]): [number, number][] {
  const flat: [number, number][] = [];
  for (const leg of roadLegs) {
    if (!flat.length) flat.push(...leg);
    else flat.push(...leg.slice(1));
  }
  return flat;
}

export function resolvePathDisplay(
  pathMode: PathMode,
  gpsPath: [number, number][],
  roadFlat: [number, number][],
  points: GpsPoint[],
  pose: InterpolatedPose | null,
) {
  const hasRoads = roadFlat.length >= 2;
  const showRoads = (pathMode === "roads" || pathMode === "both") && hasRoads;
  /** GPS overlay: always for gps/both; fallback when roads not ready. */
  const showGps =
    pathMode === "gps" || pathMode === "both" || (pathMode === "roads" && !hasRoads);

  const playPath: GpsPoint[] = (() => {
    if (showRoads) {
      const t0 = points[0]?.t ?? 0;
      const t1 = points[points.length - 1]?.t ?? t0 + 1;
      const span = Math.max(1, t1 - t0);
      return roadFlat.map(([lat, lng], i) => ({
        t: t0 + (span * i) / Math.max(1, roadFlat.length - 1),
        lat,
        lng,
      }));
    }
    return points;
  })();

  const fullPath: [number, number][] = showRoads ? roadFlat : gpsPath;

  const { completed, remaining } =
    playPath.length > 1
      ? splitPathByTime(playPath, pose?.t ?? playPath[0].t, pose?.lat, pose?.lng)
      : { completed: fullPath, remaining: [] as [number, number][] };

  return { showGps, showRoads, hasRoads, playPath, fullPath, completed, remaining };
}

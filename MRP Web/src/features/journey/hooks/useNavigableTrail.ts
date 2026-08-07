"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GpsPoint } from "../types";
import {
  buildNavigableTrail,
  type NavigableTrail,
} from "../lib/routing/navigable-trail";

function fingerprint(points: GpsPoint[]): string {
  if (!points.length) return "";
  const a = points[0];
  const b = points[points.length - 1];
  return `${points.length}:${a.t}:${a.lat.toFixed(5)}:${b.t}:${b.lng.toFixed(5)}`;
}

/**
 * Snap GPS trail to roads (OSRM) progressively; falls back to raw if routing fails.
 * Pass the *source* GPS once — do not feed road output back into this hook.
 */
export function useNavigableTrail(sourceGps: GpsPoint[]): {
  trail: NavigableTrail | null;
  routing: boolean;
  error: string | null;
} {
  const [trail, setTrail] = useState<NavigableTrail | null>(null);
  const [routing, setRouting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fp = useMemo(() => fingerprint(sourceGps), [sourceGps]);
  const gpsRef = useRef(sourceGps);
  gpsRef.current = sourceGps;
  const gen = useRef(0);

  useEffect(() => {
    const id = ++gen.current;
    const rawPoints = gpsRef.current;

    if (rawPoints.length < 2) {
      const path = rawPoints.map((p) => [p.lat, p.lng] as [number, number]);
      setTrail(
        rawPoints.length
          ? {
              points: rawPoints,
              path,
              pathLegs: path.length ? [path] : [],
              source: "raw",
              routedSegments: 0,
              failedSegments: 0,
            }
          : null,
      );
      setRouting(false);
      setError(null);
      return;
    }

    const ac = new AbortController();
    setRouting(true);
    setError(null);

    const seedPath = rawPoints.map((p) => [p.lat, p.lng] as [number, number]);
    setTrail({
      points: rawPoints,
      path: seedPath,
      pathLegs: seedPath.length >= 2 ? [seedPath] : [],
      source: "raw",
      routedSegments: 0,
      failedSegments: 0,
    });

    void buildNavigableTrail(rawPoints, {
      signal: ac.signal,
      onProgress: (p) => {
        if (id !== gen.current) return;
        if (p.source === "osrm" && (p.path.length > 1 || p.pathLegs?.some((l) => l.length > 1))) {
          setTrail({
            points: p.points,
            path: p.path,
            pathLegs: p.pathLegs ?? [],
            source: p.source,
            routedSegments: p.routedSegments,
            failedSegments: p.failedSegments,
          });
        }
      },
    })
      .then((result) => {
        if (id !== gen.current) return;
        setTrail(result);
        setRouting(false);
      })
      .catch((e) => {
        if (id !== gen.current || ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Routing failed");
        setRouting(false);
      });

    return () => {
      ac.abort();
    };
  }, [fp]);

  return { trail, routing, error };
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GpsPoint } from "../types";
import {
  buildNavigableTrail,
  countTrailGaps,
  gpsFallbackLegs,
  type NavigableTrail,
} from "../lib/routing/navigable-trail";

const ROUTE_TIMEOUT_MS = 22_000;

function fingerprint(points: GpsPoint[]): string {
  if (!points.length) return "";
  const a = points[0];
  const b = points[points.length - 1];
  return `${points.length}:${a.t}:${a.lat.toFixed(5)}:${b.t}:${b.lng.toFixed(5)}`;
}

function rawFallback(rawPoints: GpsPoint[], routed = 0, failed = 0): NavigableTrail {
  const legs = gpsFallbackLegs(rawPoints);
  const path = legs.length ? legs.flatMap((l, i) => (i === 0 ? l : l.slice(1))) : [];
  return {
    points: rawPoints,
    path,
    pathLegs: legs,
    source: "raw",
    routedSegments: routed,
    failedSegments: failed,
    gapCount: countTrailGaps(rawPoints),
  };
}

/**
 * Snap GPS trail to roads (OSRM) progressively; falls back to gap-split GPS if routing fails/times out.
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
      setTrail(rawPoints.length ? rawFallback(rawPoints) : null);
      setRouting(false);
      setError(null);
      return;
    }

    const ac = new AbortController();
    setRouting(true);
    setError(null);

    // Dots-only until OSRM returns — never seed road pathLegs with raw GPS air-lines.
    setTrail({
      points: rawPoints,
      path: [],
      pathLegs: [],
      source: "raw",
      routedSegments: 0,
      failedSegments: 0,
      gapCount: countTrailGaps(rawPoints),
    });

    const timeout = window.setTimeout(() => {
      if (id !== gen.current || ac.signal.aborted) return;
      ac.abort();
      setTrail(rawFallback(rawPoints));
      setError("Road snap timed out — showing GPS path (gaps skipped)");
      setRouting(false);
    }, ROUTE_TIMEOUT_MS);

    void buildNavigableTrail(rawPoints, {
      signal: ac.signal,
      onProgress: (p) => {
        if (id !== gen.current) return;
        if (p.source === "osrm" && (p.path.length > 1 || p.pathLegs?.some((l) => l.length > 1))) {
          setTrail({
            points: p.points,
            path: p.path,
            pathLegs: p.pathLegs ?? [],
            source: "osrm",
            routedSegments: p.routedSegments,
            failedSegments: p.failedSegments,
            gapCount: countTrailGaps(rawPoints),
          });
        }
      },
    })
      .then((result) => {
        if (id !== gen.current) return;
        window.clearTimeout(timeout);
        if (result.source === "osrm" && result.pathLegs.some((l) => l.length >= 2)) {
          setTrail({ ...result, gapCount: result.gapCount ?? countTrailGaps(rawPoints) });
          const gaps = result.gapCount || result.failedSegments;
          setError(
            gaps > 0 ? `${gaps} gap${gaps === 1 ? "" : "s"} skipped (no air-line)` : null,
          );
        } else {
          setTrail(rawFallback(rawPoints, result.routedSegments, result.failedSegments));
          setError("Road snap unavailable — showing GPS path (gaps skipped)");
        }
        setRouting(false);
      })
      .catch((e) => {
        if (id !== gen.current || ac.signal.aborted) return;
        window.clearTimeout(timeout);
        setTrail(rawFallback(rawPoints));
        setError(e instanceof Error ? e.message : "Routing failed — showing GPS path");
        setRouting(false);
      });

    return () => {
      window.clearTimeout(timeout);
      ac.abort();
    };
  }, [fp]);

  return { trail, routing, error };
}

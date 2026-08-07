import type { GpsPoint } from "../types";

export function pointsToGeoJson(points: GpsPoint[], day: string) {
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { day, pointCount: points.length },
        geometry: {
          type: "LineString" as const,
          coordinates: points.map((p) => [p.lng, p.lat, p.t]),
        },
      },
      ...points.map((p, i) => ({
        type: "Feature" as const,
        properties: {
          index: i,
          t: p.t,
          speed: p.s,
          motion: p.m,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [p.lng, p.lat],
        },
      })),
    ],
  };
}

export function pointsToGpx(points: GpsPoint[], day: string): string {
  const trkpts = points
    .map(
      (p) =>
        `    <trkpt lat="${p.lat}" lon="${p.lng}"><time>${new Date(p.t).toISOString()}</time></trkpt>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MRP">
  <metadata><name>Journey ${day}</name></metadata>
  <trk><name>${day}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
}

export function pointsToCsv(points: GpsPoint[]): string {
  const header = "timestamp,lat,lng,speed_mps,heading,accuracy,motion";
  const rows = points.map((p) =>
    [
      new Date(p.t).toISOString(),
      p.lat,
      p.lng,
      p.s ?? "",
      p.h ?? "",
      p.a ?? "",
      p.m ?? "",
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

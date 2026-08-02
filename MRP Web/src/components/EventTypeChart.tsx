"use client";

import { useMemo } from "react";
import { eventIcon, formatEventType, severityOf } from "@/lib/vault-selectors";

const PIE_COLORS = [
  "#5b8def",
  "#d4a017",
  "#3d9b6a",
  "#c45c3e",
  "#8b7cf7",
  "#2aa8a0",
  "#d47a3a",
  "#6b8cae",
  "#b85c8a",
  "#7a8a6a",
  "#5b9bd5",
  "#c9a227",
];

/** Large donut + 4-column legend underneath with event icons. */
export function EventTypeChart({
  timeline,
  layout = "side",
}: {
  timeline: unknown[];
  layout?: "side" | "stack";
}) {
  const entries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of timeline) {
      const e = row as Record<string, unknown>;
      const t = String(e.eventType || e.event_type || "other");
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [timeline]);

  const total = entries.reduce((s, [, n]) => s + n, 0);

  const gradient = useMemo(() => {
    if (!total) return "var(--line)";
    let acc = 0;
    const parts: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const [, n] = entries[i];
      const start = (acc / total) * 360;
      acc += n;
      const end = (acc / total) * 360;
      parts.push(`${PIE_COLORS[i % PIE_COLORS.length]} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`);
    }
    return `conic-gradient(from -90deg, ${parts.join(", ")})`;
  }, [entries, total]);

  if (entries.length === 0) {
    return <p className="muted">No events to graph.</p>;
  }

  const stack = layout === "stack";

  return (
    <div className={`event-pie ${stack ? "event-pie-stack event-pie-cols" : ""}`}>
      <div
        className="event-pie-disk"
        style={{ background: gradient }}
        role="img"
        aria-label={`Event mix: ${entries.map(([t, n]) => `${t} ${n}`).join(", ")}`}
      >
        <div className="event-pie-hole">
          <span className="event-pie-total mono">{total}</span>
          <span className="muted event-pie-caption">events</span>
        </div>
      </div>
      <ul className={`event-pie-legend ${stack ? "event-pie-legend-4col" : ""}`}>
        {entries.map(([type, n], i) => {
          const sev = severityOf(type);
          return (
            <li key={type}>
              <span
                className="event-pie-swatch"
                style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                aria-hidden
              />
              <span className={`tl-icon tl-icon-${sev} event-pie-ico`} aria-hidden>
                {eventIcon(type)}
              </span>
              <span className="event-pie-label" title={type}>
                {formatEventType(type)}
              </span>
              <span className="event-pie-count mono">{n}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { useMemo } from "react";

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
];

/** Pie + legend for vault timeline event mix (no chart library). */
export function EventTypeChart({ timeline }: { timeline: unknown[] }) {
  const entries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of timeline) {
      const e = row as Record<string, unknown>;
      const t = String(e.eventType || e.event_type || "other");
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
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

  return (
    <div className="event-pie">
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
      <ul className="event-pie-legend">
        {entries.map(([type, n], i) => (
          <li key={type}>
            <span
              className="event-pie-swatch"
              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
              aria-hidden
            />
            <span className="event-pie-label mono" title={type}>
              {type}
            </span>
            <span className="event-pie-count mono">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

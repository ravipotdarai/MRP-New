"use client";

/** Simple event-type bars from Drive vault timeline (no external chart lib). */
export function EventTypeChart({
  timeline,
}: {
  timeline: unknown[];
}) {
  const counts = new Map<string, number>();
  for (const row of timeline) {
    const e = row as Record<string, unknown>;
    const t = String(e.eventType || e.event_type || "other");
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = entries.reduce((m, [, n]) => Math.max(m, n), 1);

  if (entries.length === 0) {
    return <p className="muted">No events to graph.</p>;
  }

  return (
    <div className="event-chart">
      {entries.map(([type, n]) => (
        <div key={type} className="event-chart-row">
          <span className="event-chart-label mono">{type}</span>
          <div className="event-chart-track">
            <div
              className="event-chart-bar"
              style={{ width: `${Math.max(8, (n / max) * 100)}%` }}
            />
          </div>
          <span className="event-chart-count mono">{n}</span>
        </div>
      ))}
    </div>
  );
}

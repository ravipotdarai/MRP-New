"use client";

/** Always-on spinner + indeterminate bar (inline keyframes so motion isn’t dropped by theme CSS). */
export function LoadingProgress({
  title,
  detail,
  compact = false,
}: {
  title: string;
  detail?: string | null;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? "hydrate-inline" : "hydrate-banner"}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <style>{`
        @keyframes mrp-hydrate-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes mrp-hydrate-slide {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
        .mrp-spin {
          width: 1.15rem;
          height: 1.15rem;
          border: 2.5px solid color-mix(in srgb, var(--signal, #22c55e) 28%, var(--line, #475569));
          border-top-color: var(--signal, #22c55e);
          border-radius: 50%;
          flex-shrink: 0;
          animation: mrp-hydrate-spin 0.65s linear infinite;
        }
        .mrp-bar {
          grid-column: 1 / -1;
          height: 4px;
          border-radius: 2px;
          background: color-mix(in srgb, var(--line, #475569) 65%, transparent);
          overflow: hidden;
        }
        .mrp-bar > i {
          display: block;
          height: 100%;
          width: 35%;
          border-radius: 2px;
          background: var(--signal, #22c55e);
          animation: mrp-hydrate-slide 1.1s ease-in-out infinite;
        }
      `}</style>
      <span className="mrp-spin" aria-hidden />
      <div className="hydrate-banner-copy">
        <strong>{title}</strong>
        {detail ? <span className="muted">{detail}</span> : null}
      </div>
      <div className="mrp-bar" aria-hidden>
        <i />
      </div>
    </div>
  );
}

"use client";

type TabItem<T extends string> = { id: T; label: string };

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={`seg-tabs ${size === "sm" ? "seg-tabs-sm" : ""}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={`seg-tab ${value === t.id ? "seg-tab-active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

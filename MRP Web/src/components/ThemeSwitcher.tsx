"use client";

import { useWebTheme, type WebThemeId } from "@/lib/theme-context";

export function ThemeSwitcher() {
  const { themeId, setThemeId, themes } = useWebTheme();
  return (
    <label className="theme-switcher" title="Console theme">
      <span className="theme-switcher-label">Theme</span>
      <select
        aria-label="Theme"
        value={themeId}
        onChange={(e) => setThemeId(e.target.value as WebThemeId)}
      >
        {themes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}

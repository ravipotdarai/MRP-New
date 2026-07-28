"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type WebThemeId = "field" | "slate" | "dawn";

type ThemeCtx = {
  themeId: WebThemeId;
  setThemeId: (id: WebThemeId) => void;
  themes: { id: WebThemeId; label: string }[];
};

const STORAGE_KEY = "mrp.web.theme";

const THEMES: { id: WebThemeId; label: string }[] = [
  { id: "field", label: "Field" },
  { id: "slate", label: "Slate" },
  { id: "dawn", label: "Dawn" },
];

const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeState] = useState<WebThemeId>("field");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) as WebThemeId | null;
      if (raw === "field" || raw === "slate" || raw === "dawn") {
        setThemeState(raw);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeId);
    try {
      localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      /* ignore */
    }
  }, [themeId]);

  const setThemeId = useCallback((id: WebThemeId) => setThemeState(id), []);

  const value = useMemo(
    () => ({ themeId, setThemeId, themes: THEMES }),
    [themeId, setThemeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useWebTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useWebTheme outside ThemeProvider");
  return ctx;
}

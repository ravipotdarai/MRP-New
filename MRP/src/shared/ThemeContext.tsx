import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ColorPalette,
  DEFAULT_THEME_ID,
  THEME_LIST,
  THEMES,
  ThemeId,
  ThemeMeta,
  isThemeId,
  spacing,
  radius,
} from './theme';
import mrpmModule from './hooks/useNativeBridge';

type ThemeContextValue = {
  themeId: ThemeId;
  colors: ColorPalette;
  themes: ThemeMeta[];
  setThemeId: (id: ThemeId) => void;
  spacing: typeof spacing;
  radius: typeof radius;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

async function loadStoredThemeId(): Promise<ThemeId> {
  try {
    const id = await mrpmModule.getUiThemeId();
    if (isThemeId(id)) return id;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_ID;
}

async function persistThemeId(id: ThemeId): Promise<void> {
  try {
    await mrpmModule.setUiThemeId(id);
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadStoredThemeId().then(id => {
      if (!cancelled) {
        setThemeIdState(id);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    persistThemeId(id);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      colors: THEMES[themeId].colors,
      themes: THEME_LIST,
      setThemeId,
      spacing,
      radius,
      ready,
    }),
    [themeId, setThemeId, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Safe fallback when used outside provider
    return {
      themeId: DEFAULT_THEME_ID,
      colors: THEMES[DEFAULT_THEME_ID].colors,
      themes: THEME_LIST,
      setThemeId: () => {},
      spacing,
      radius,
      ready: true,
    };
  }
  return ctx;
}

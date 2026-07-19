/**
 * MRP color themes — same key shape so screens can swap palettes via ThemeContext.
 */

export type ThemeId = 'slate' | 'midnight' | 'ocean' | 'forest' | 'light';

export type ColorPalette = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderSubtle: string;
  borderSoft: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textBody: string;
  sky: string;
  skyDark: string;
  skySoft: string;
  emerald: string;
  emeraldDark: string;
  emeraldSoft: string;
  red: string;
  redDark: string;
  redSoft: string;
  amber: string;
  amberSoft: string;
  violet: string;
  pink: string;
};

export type ThemeMeta = {
  id: ThemeId;
  label: string;
  /** Accent swatch shown in the picker */
  preview: string;
  colors: ColorPalette;
};

export const THEMES: Record<ThemeId, ThemeMeta> = {
  slate: {
    id: 'slate',
    label: 'Slate',
    preview: '#38bdf8',
    colors: {
      bg: '#0f172a',
      surface: '#1e293b',
      surfaceAlt: '#172033',
      border: '#334155',
      borderSubtle: 'rgba(255, 255, 255, 0.06)',
      borderSoft: 'rgba(255, 255, 255, 0.08)',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      textMuted: '#64748b',
      textBody: '#cbd5e1',
      sky: '#38bdf8',
      skyDark: '#0ea5e9',
      skySoft: 'rgba(56, 189, 248, 0.15)',
      emerald: '#10b981',
      emeraldDark: '#059669',
      emeraldSoft: 'rgba(16, 185, 129, 0.15)',
      red: '#ef4444',
      redDark: '#b91c1c',
      redSoft: 'rgba(239, 68, 68, 0.15)',
      amber: '#f59e0b',
      amberSoft: 'rgba(245, 158, 11, 0.15)',
      violet: '#8b5cf6',
      pink: '#ec4899',
    },
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    preview: '#a78bfa',
    colors: {
      bg: '#09090b',
      surface: '#18181b',
      surfaceAlt: '#0c0c0f',
      border: '#3f3f46',
      borderSubtle: 'rgba(255, 255, 255, 0.05)',
      borderSoft: 'rgba(255, 255, 255, 0.08)',
      textPrimary: '#fafafa',
      textSecondary: '#a1a1aa',
      textMuted: '#71717a',
      textBody: '#d4d4d8',
      sky: '#a78bfa',
      skyDark: '#8b5cf6',
      skySoft: 'rgba(167, 139, 250, 0.18)',
      emerald: '#34d399',
      emeraldDark: '#10b981',
      emeraldSoft: 'rgba(52, 211, 153, 0.15)',
      red: '#f87171',
      redDark: '#dc2626',
      redSoft: 'rgba(248, 113, 113, 0.15)',
      amber: '#fbbf24',
      amberSoft: 'rgba(251, 191, 36, 0.15)',
      violet: '#c4b5fd',
      pink: '#f472b6',
    },
  },
  ocean: {
    id: 'ocean',
    label: 'Ocean',
    preview: '#22d3ee',
    colors: {
      bg: '#042f2e',
      surface: '#134e4a',
      surfaceAlt: '#0f3d3a',
      border: '#2dd4bf44',
      borderSubtle: 'rgba(45, 212, 191, 0.08)',
      borderSoft: 'rgba(45, 212, 191, 0.14)',
      textPrimary: '#ecfeff',
      textSecondary: '#99f6e4',
      textMuted: '#5eead4',
      textBody: '#ccfbf1',
      sky: '#22d3ee',
      skyDark: '#06b6d4',
      skySoft: 'rgba(34, 211, 238, 0.18)',
      emerald: '#2dd4bf',
      emeraldDark: '#14b8a6',
      emeraldSoft: 'rgba(45, 212, 191, 0.18)',
      red: '#fb7185',
      redDark: '#e11d48',
      redSoft: 'rgba(251, 113, 133, 0.15)',
      amber: '#fcd34d',
      amberSoft: 'rgba(252, 211, 77, 0.15)',
      violet: '#a5b4fc',
      pink: '#f9a8d4',
    },
  },
  forest: {
    id: 'forest',
    label: 'Forest',
    preview: '#4ade80',
    colors: {
      bg: '#052e16',
      surface: '#14532d',
      surfaceAlt: '#0a3d1c',
      border: '#166534',
      borderSubtle: 'rgba(74, 222, 128, 0.08)',
      borderSoft: 'rgba(74, 222, 128, 0.14)',
      textPrimary: '#f0fdf4',
      textSecondary: '#bbf7d0',
      textMuted: '#86efac',
      textBody: '#dcfce7',
      sky: '#4ade80',
      skyDark: '#22c55e',
      skySoft: 'rgba(74, 222, 128, 0.18)',
      emerald: '#86efac',
      emeraldDark: '#4ade80',
      emeraldSoft: 'rgba(134, 239, 172, 0.18)',
      red: '#f87171',
      redDark: '#dc2626',
      redSoft: 'rgba(248, 113, 113, 0.15)',
      amber: '#facc15',
      amberSoft: 'rgba(250, 204, 21, 0.15)',
      violet: '#c4b5fd',
      pink: '#f9a8d4',
    },
  },
  light: {
    id: 'light',
    label: 'Light',
    preview: '#0284c7',
    colors: {
      bg: '#f1f5f9',
      surface: '#ffffff',
      surfaceAlt: '#e2e8f0',
      border: '#cbd5e1',
      borderSubtle: 'rgba(15, 23, 42, 0.06)',
      borderSoft: 'rgba(15, 23, 42, 0.1)',
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      textMuted: '#64748b',
      textBody: '#334155',
      sky: '#0284c7',
      skyDark: '#0369a1',
      skySoft: 'rgba(2, 132, 199, 0.12)',
      emerald: '#059669',
      emeraldDark: '#047857',
      emeraldSoft: 'rgba(5, 150, 105, 0.12)',
      red: '#dc2626',
      redDark: '#b91c1c',
      redSoft: 'rgba(220, 38, 38, 0.12)',
      amber: '#d97706',
      amberSoft: 'rgba(217, 119, 6, 0.12)',
      violet: '#7c3aed',
      pink: '#db2777',
    },
  },
};

export const DEFAULT_THEME_ID: ThemeId = 'slate';

export const THEME_LIST: ThemeMeta[] = [
  THEMES.slate,
  THEMES.midnight,
  THEMES.ocean,
  THEMES.forest,
  THEMES.light,
];

/** Legacy static export — default Slate palette (for screens not yet on useTheme). */
export const colors: ColorPalette = THEMES.slate.colors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const typography = {
  title: {fontSize: 20, fontWeight: '800' as const, color: colors.textPrimary},
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  cardTitle: {fontSize: 16, fontWeight: '700' as const, color: colors.textPrimary},
  body: {fontSize: 14, color: colors.textBody},
  caption: {fontSize: 12, color: colors.textSecondary},
  value: {fontSize: 22, fontWeight: '800' as const, color: colors.textPrimary},
};

export const card = {
  backgroundColor: colors.surface,
  borderRadius: radius.lg,
  padding: spacing.lg,
  borderWidth: 1,
  borderColor: colors.border,
  marginBottom: spacing.xl,
};

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && value in THEMES;
}

export default {colors, spacing, radius, typography, card, THEMES, THEME_LIST};

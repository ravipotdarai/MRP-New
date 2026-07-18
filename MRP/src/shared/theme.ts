/**
 * Central MRP theme — slate/sky/emerald dark palette.
 * Use these constants across all screens so colors stay consistent.
 */
export const colors = {
  // Backgrounds
  bg: '#0f172a', // slate-950
  surface: '#1e293b', // slate-800
  surfaceAlt: '#172033', // custom darker surface
  border: '#334155', // slate-700
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  borderSoft: 'rgba(255, 255, 255, 0.08)',

  // Text
  textPrimary: '#f8fafc', // slate-50
  textSecondary: '#94a3b8', // slate-400
  textMuted: '#64748b', // slate-500
  textBody: '#cbd5e1', // slate-300

  // Brand accents
  sky: '#38bdf8', // sky-400
  skyDark: '#0ea5e9', // sky-500
  skySoft: 'rgba(56, 189, 248, 0.15)',
  emerald: '#10b981', // emerald-500
  emeraldDark: '#059669', // emerald-600
  emeraldSoft: 'rgba(16, 185, 129, 0.15)',

  // Status
  red: '#ef4444',
  redDark: '#b91c1c',
  redSoft: 'rgba(239, 68, 68, 0.15)',
  amber: '#f59e0b',
  amberSoft: 'rgba(245, 158, 11, 0.15)',
  violet: '#8b5cf6',
  pink: '#ec4899',
};

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

export default {colors, spacing, radius, typography, card};

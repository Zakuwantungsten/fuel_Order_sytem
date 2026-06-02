/**
 * Design tokens for FuelOrder — light & dark designed together.
 *
 * Semantic names (not raw hex in components). Audience: drivers & station
 * managers using the app outdoors in bright sunlight, so light mode is the
 * default and uses strong contrast; dark mode uses desaturated tonal variants.
 */

export interface ThemeColors {
  // Surfaces
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  // Brand
  primary: string;
  primaryMuted: string; // tinted background for primary accents
  onPrimary: string;
  // Header (always dark navy in both themes for a consistent brand bar)
  headerBg: string;
  onHeader: string;
  onHeaderMuted: string;
  // Text
  text: string;
  textMuted: string;
  textInverse: string;
  // Status
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;
  info: string;
  infoMuted: string;
  // Misc
  scrim: string;
  shadow: string;
}

export const lightColors: ThemeColors = {
  background: '#f1f5f9',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',
  border: '#e2e8f0',

  primary: '#1d4ed8',
  primaryMuted: '#eff6ff',
  onPrimary: '#ffffff',

  headerBg: '#0f172a',
  onHeader: '#ffffff',
  onHeaderMuted: '#cbd5e1',

  text: '#0f172a',
  textMuted: '#64748b',
  textInverse: '#ffffff',

  success: '#15803d',
  successMuted: '#dcfce7',
  warning: '#b45309',
  warningMuted: '#fef3c7',
  danger: '#b91c1c',
  dangerMuted: '#fee2e2',
  info: '#0e7490',
  infoMuted: '#cffafe',

  scrim: 'rgba(15, 23, 42, 0.5)',
  shadow: '#0f172a',
};

export const darkColors: ThemeColors = {
  background: '#0b1220',
  surface: '#111c30',
  surfaceAlt: '#16223a',
  border: '#243349',

  primary: '#60a5fa',
  primaryMuted: '#1e293b',
  onPrimary: '#06122a',

  headerBg: '#0a1326',
  onHeader: '#f1f5f9',
  onHeaderMuted: '#94a3b8',

  text: '#e7edf6',
  textMuted: '#94a3b8',
  textInverse: '#0b1220',

  success: '#4ade80',
  successMuted: '#14321f',
  warning: '#fbbf24',
  warningMuted: '#3a2c0c',
  danger: '#f87171',
  dangerMuted: '#3a1718',
  info: '#22d3ee',
  infoMuted: '#0d2b33',

  scrim: 'rgba(0, 0, 0, 0.6)',
  shadow: '#000000',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const font = {
  display: 30,
  h1: 26,
  h2: 20,
  h3: 17,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

export type ThemeMode = 'light' | 'dark';

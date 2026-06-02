/**
 * Theme barrel. Components should use `useTheme()` for colors (so the light/dark
 * toggle works) and import the static scales (spacing/radius/font/weight) directly.
 */
export {
  spacing,
  radius,
  font,
  weight,
  lightColors,
  darkColors,
} from './tokens';
export type { ThemeColors, ThemeMode } from './tokens';
export { ThemeProvider, useTheme } from './ThemeContext';

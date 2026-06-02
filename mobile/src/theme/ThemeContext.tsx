import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '../api/client';
import {
  ThemeColors,
  ThemeMode,
  darkColors,
  font,
  lightColors,
  radius,
  spacing,
  weight,
} from './tokens';

const THEME_KEY = 'fuelorder_theme';

interface ThemeState {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  setMode: (m: ThemeMode) => void;
  // Static scales (theme-independent)
  spacing: typeof spacing;
  radius: typeof radius;
  font: typeof font;
  weight: typeof weight;
}

const ThemeCtx = createContext<ThemeState | undefined>(undefined);

export function ThemeProvider({
  initialMode,
  children,
}: {
  initialMode?: ThemeMode;
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode ?? 'light');

  // Load persisted preference on mount.
  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(THEME_KEY);
        if (saved === 'light' || saved === 'dark') setModeState(saved);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const persist = useCallback((m: ThemeMode) => {
    SecureStore.setItemAsync(THEME_KEY, m).catch(() => {});
    // Best-effort sync to the backend profile (ignore failures / driver users).
    apiClient.patch('/auth/preferences', { theme: m }).catch(() => {});
  }, []);

  const setMode = useCallback(
    (m: ThemeMode) => {
      setModeState(m);
      persist(m);
    },
    [persist]
  );

  const toggleTheme = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      persist(next);
      return next;
    });
  }, [persist]);

  const value = useMemo<ThemeState>(
    () => ({
      mode,
      colors: mode === 'dark' ? darkColors : lightColors,
      isDark: mode === 'dark',
      toggleTheme,
      setMode,
      spacing,
      radius,
      font,
      weight,
    }),
    [mode, toggleTheme, setMode]
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

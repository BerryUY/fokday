import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import type { ThemePreference } from '@/data/settings';
import { dark, light, withAccent, type AccentKey, type Palette } from './tokens';

type ThemeValue = { colors: Palette; preference: ThemePreference };

const ThemeContext = createContext<ThemeValue>({ colors: dark, preference: 'dark' });

export function ThemeProvider({ preference, accent = 'lima', children }: { preference: ThemePreference; accent?: AccentKey; children: ReactNode }) {
  const system = useColorScheme();
  const value = useMemo<ThemeValue>(() => {
    const scheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
    const base = scheme === 'light' ? light : dark;
    return { colors: accent === 'lima' ? base : withAccent(base, accent), preference };
  }, [preference, system, accent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useColors() {
  return useContext(ThemeContext).colors;
}

export type Palette = {
  scheme: 'dark' | 'light';
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfacePressed: string;
  border: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  protein: string;
  proteinSoft: string;
  weight: string;
  weightSoft: string;
  /** The streak flame (warm orange, like a real fire). */
  streak: string;
  streakSoft: string;
  warning: string;
  danger: string;
  dangerSoft: string;
  track: string;
  overlay: string;
  heat: [string, string, string, string];
};

export const dark: Palette = {
  scheme: 'dark',
  bg: '#000000',
  surface: '#1C1C1E',
  surfaceAlt: '#2C2C2E',
  surfacePressed: '#3A3A3C',
  border: 'rgba(84, 84, 88, 0.55)',
  text: '#FFFFFF',
  textMuted: 'rgba(235, 235, 245, 0.62)',
  textDim: 'rgba(235, 235, 245, 0.38)',
  accent: '#C8F560',
  accentText: '#0B0F02',
  accentSoft: 'rgba(200, 245, 96, 0.14)',
  protein: '#64D2FF',
  proteinSoft: 'rgba(100, 210, 255, 0.14)',
  weight: '#FFD60A',
  weightSoft: 'rgba(255, 214, 10, 0.14)',
  streak: '#FF9F0A',
  streakSoft: 'rgba(255, 159, 10, 0.16)',
  warning: '#FFD60A',
  danger: '#FF453A',
  dangerSoft: 'rgba(255, 69, 58, 0.16)',
  track: '#2C2C2E',
  overlay: 'rgba(0, 0, 0, 0.6)',
  heat: ['#1C1C1E', '#3B4A1C', '#7FA437', '#C8F560'],
};

export const light: Palette = {
  scheme: 'light',
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceAlt: '#E9E9EF',
  surfacePressed: '#DEDEE4',
  border: 'rgba(60, 60, 67, 0.16)',
  text: '#0B0B0D',
  textMuted: 'rgba(60, 60, 67, 0.68)',
  textDim: 'rgba(60, 60, 67, 0.42)',
  accent: '#5E8C0A',
  accentText: '#FFFFFF',
  accentSoft: 'rgba(94, 140, 10, 0.12)',
  protein: '#007AFF',
  proteinSoft: 'rgba(0, 122, 255, 0.1)',
  weight: '#C98A00',
  weightSoft: 'rgba(201, 138, 0, 0.12)',
  streak: '#F07F00',
  streakSoft: 'rgba(240, 127, 0, 0.12)',
  warning: '#C98A00',
  danger: '#FF3B30',
  dangerSoft: 'rgba(255, 59, 48, 0.1)',
  track: '#E5E5EA',
  overlay: 'rgba(0, 0, 0, 0.35)',
  heat: ['#E5E5EA', '#CFE3A6', '#93BF3F', '#5E8C0A'],
};

/** Pro color themes: the accent (buttons, rings, highlights) in a dark and a light variant. */
export type AccentKey = 'lima' | 'verde' | 'turquesa' | 'violeta' | 'naranja' | 'rosa';
type AccentPair = { dark: string; darkText: string; light: string; lightText: string };
export const ACCENTS: { key: AccentKey; label: string; colors: AccentPair }[] = [
  { key: 'lima', label: 'Lima', colors: { dark: '#C8F560', darkText: '#0B0F02', light: '#5E8C0A', lightText: '#FFFFFF' } },
  { key: 'verde', label: 'Verde FokDay', colors: { dark: '#3DF58A', darkText: '#04210F', light: '#138A45', lightText: '#FFFFFF' } },
  { key: 'turquesa', label: 'Turquesa', colors: { dark: '#3DE0D0', darkText: '#031C1A', light: '#0E8379', lightText: '#FFFFFF' } },
  { key: 'violeta', label: 'Violeta', colors: { dark: '#B48CFF', darkText: '#140A26', light: '#6B42C9', lightText: '#FFFFFF' } },
  { key: 'naranja', label: 'Naranja', colors: { dark: '#FF9F5A', darkText: '#1F0E02', light: '#C2560E', lightText: '#FFFFFF' } },
  { key: 'rosa', label: 'Rosa', colors: { dark: '#FF7AB6', darkText: '#26061A', light: '#C2266F', lightText: '#FFFFFF' } },
];

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) =>
  '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

/** The palette with another accent; the heatmap fades from the empty cell to the accent. */
export function withAccent(base: Palette, key: AccentKey): Palette {
  const a = (ACCENTS.find((x) => x.key === key) ?? ACCENTS[0]).colors;
  const accent = base.scheme === 'dark' ? a.dark : a.light;
  const [r, g, b] = hex(accent);
  return {
    ...base,
    accent,
    accentText: base.scheme === 'dark' ? a.darkText : a.lightText,
    accentSoft: `rgba(${r}, ${g}, ${b}, 0.12)`,
    heat: [base.heat[0], mix(base.heat[0], accent, 0.3), mix(base.heat[0], accent, 0.65), accent],
  };
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 } as const;

/** Inter: the closest open font to San Francisco, so the app reads like a native iPhone app on Android too. */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_700Bold',
} as const;

export const type = {
  hero: { fontFamily: font.heavy, fontSize: 44, lineHeight: 50, letterSpacing: -1.1 },
  display: { fontFamily: font.bold, fontSize: 34, lineHeight: 41, letterSpacing: -0.8 },
  title: { fontFamily: font.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.45 },
  h2: { fontFamily: font.semibold, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  h3: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  bodyMedium: { fontFamily: font.medium, fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  label: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  overline: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' as const },
  number: { fontFamily: font.bold, fontSize: 22, lineHeight: 26, letterSpacing: -0.6, fontVariant: ['tabular-nums' as const] },
  numberLg: { fontFamily: font.heavy, fontSize: 34, lineHeight: 38, letterSpacing: -1.2, fontVariant: ['tabular-nums' as const] },
} as const;

export type TypeVariant = keyof typeof type;

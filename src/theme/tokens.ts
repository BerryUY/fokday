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
  warning: string;
  danger: string;
  dangerSoft: string;
  track: string;
  overlay: string;
  heat: [string, string, string, string];
};

export const dark: Palette = {
  scheme: 'dark',
  bg: '#09090A',
  surface: '#141416',
  surfaceAlt: '#1C1C1F',
  surfacePressed: '#232327',
  border: '#26262B',
  text: '#F5F5F4',
  textMuted: '#A1A1A6',
  textDim: '#6B6B72',
  accent: '#C8F560',
  accentText: '#0B0F02',
  accentSoft: 'rgba(200, 245, 96, 0.12)',
  protein: '#7CC8FF',
  proteinSoft: 'rgba(124, 200, 255, 0.12)',
  weight: '#F5C46B',
  weightSoft: 'rgba(245, 196, 107, 0.12)',
  warning: '#F5C46B',
  danger: '#FF7A6B',
  dangerSoft: 'rgba(255, 122, 107, 0.12)',
  track: '#222226',
  overlay: 'rgba(0, 0, 0, 0.6)',
  heat: ['#1A1A1D', '#3B4A1C', '#7FA437', '#C8F560'],
};

export const light: Palette = {
  scheme: 'light',
  bg: '#F4F4F1',
  surface: '#FFFFFF',
  surfaceAlt: '#EDEDE9',
  surfacePressed: '#E4E4DF',
  border: '#E2E2DD',
  text: '#0E0E10',
  textMuted: '#5E5E66',
  textDim: '#94949B',
  accent: '#5E8C0A',
  accentText: '#FFFFFF',
  accentSoft: 'rgba(94, 140, 10, 0.12)',
  protein: '#1F7FC4',
  proteinSoft: 'rgba(31, 127, 196, 0.12)',
  weight: '#B7791F',
  weightSoft: 'rgba(183, 121, 31, 0.12)',
  warning: '#B7791F',
  danger: '#D2483A',
  dangerSoft: 'rgba(210, 72, 58, 0.1)',
  track: '#E6E6E1',
  overlay: 'rgba(0, 0, 0, 0.35)',
  heat: ['#E8E8E3', '#CFE3A6', '#93BF3F', '#5E8C0A'],
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

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
} as const;

export const type = {
  hero: { fontFamily: font.heavy, fontSize: 44, lineHeight: 48, letterSpacing: -1.6 },
  display: { fontFamily: font.bold, fontSize: 32, lineHeight: 38, letterSpacing: -1 },
  title: { fontFamily: font.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.5 },
  h2: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  h3: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  bodyMedium: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  overline: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' as const },
  number: { fontFamily: font.bold, fontSize: 22, lineHeight: 26, letterSpacing: -0.6, fontVariant: ['tabular-nums' as const] },
  numberLg: { fontFamily: font.heavy, fontSize: 34, lineHeight: 38, letterSpacing: -1.2, fontVariant: ['tabular-nums' as const] },
} as const;

export type TypeVariant = keyof typeof type;

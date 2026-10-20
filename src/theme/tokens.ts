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

import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColors } from '@/theme/ThemeProvider';
import { font, radius } from '@/theme/tokens';
import { PressableScale } from './ui/primitives';

/** Google's own "G", in its four colors. */
export function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

/**
 * The standard "Continuar con Google" button (Google's branding: white on light, near-black on
 * dark, the colored G on the left), so people recognize it at a glance.
 */
export function GoogleButton({ onPress, loading, label = 'Continuar con Google' }: { onPress: () => void; loading?: boolean; label?: string }) {
  const c = useColors();
  const dark = c.scheme === 'dark';
  const fg = dark ? '#E3E3E3' : '#1F1F1F';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={loading}
      onPress={onPress}
      style={[styles.button, { backgroundColor: dark ? '#131314' : '#FFFFFF', borderColor: dark ? '#8E918F' : '#747775' }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <GoogleG />}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, { color: fg }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: { height: 54, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 },
  label: { fontFamily: font.semibold, fontSize: 16, letterSpacing: 0.1 },
});

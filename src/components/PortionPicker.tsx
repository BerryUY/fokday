import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { PressableScale, T } from '@/components/ui/primitives';
import { formatDecimal } from '@/lib/format';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** Whole portions (1, 2, 3… up to 99), plus half a portion below one. */
export const nextPortion = (v: number) => (v < 1 ? 1 : Math.min(99, Math.floor(v) + 1));
export const previousPortion = (v: number) => (v <= 1 ? 0.5 : Math.ceil(v) - 1);

const label = (v: number) => (v === 0.5 ? '½' : formatDecimal(v, 2));

/** A plain counter: 7 empanadas is tapping + until it says 7. */
export function PortionPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const c = useColors();
  return (
    <View style={[styles.box, { backgroundColor: c.surfaceAlt }]}>
      <PressableScale accessibilityLabel="Una porción menos" disabled={value <= 0.5} onPress={() => onChange(previousPortion(value))} style={[styles.btn, { backgroundColor: c.surface, opacity: value <= 0.5 ? 0.4 : 1 }]} scaleTo={0.9}>
        <Feather name="minus" size={22} color={c.text} />
      </PressableScale>
      <View style={{ alignItems: 'center', flex: 1 }}>
        <T variant="numberLg">{label(value)}</T>
        <T variant="caption" tone="muted">{value === 1 ? 'porción' : 'porciones'}</T>
      </View>
      <PressableScale accessibilityLabel="Una porción más" disabled={value >= 99} onPress={() => onChange(nextPortion(value))} style={[styles.btn, { backgroundColor: c.accent }]} scaleTo={0.9}>
        <Feather name="plus" size={22} color={c.accentText} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, padding: space.sm, gap: space.md },
  btn: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});

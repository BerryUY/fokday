import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { PressableScale, Row, T } from '@/components/ui/primitives';
import { formatDecimal } from '@/lib/format';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** Whole portions (1, 2, 3… up to 30), plus half a portion below one. */
export const MAX_PORTIONS = 30;
export const nextPortion = (v: number) => (v < 1 ? 1 : Math.min(MAX_PORTIONS, Math.floor(v) + 1));
export const previousPortion = (v: number) => (v <= 1 ? 0.5 : Math.ceil(v) - 1);

const label = (v: number) => (v === 0.5 ? '½' : formatDecimal(v, 2));

/** A small inline counter: 7 empanadas is tapping + until it says 7. */
export function PortionPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const c = useColors();
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <T variant="bodyMedium">{value === 1 ? 'Porción' : 'Porciones'}</T>
      <View style={[styles.pill, { backgroundColor: c.surfaceAlt }]}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Una porción menos" disabled={value <= 0.5} onPress={() => onChange(previousPortion(value))} style={[styles.btn, { opacity: value <= 0.5 ? 0.35 : 1 }]} scaleTo={0.85}>
          <Feather name="minus" size={16} color={c.text} />
        </PressableScale>
        <T variant="h3" style={styles.value}>{label(value)}</T>
        <PressableScale accessibilityRole="button" accessibilityLabel="Una porción más" disabled={value >= MAX_PORTIONS} onPress={() => onChange(nextPortion(value))} style={[styles.btn, { backgroundColor: c.accent }]} scaleTo={0.85}>
          <Feather name="plus" size={16} color={c.accentText} />
        </PressableScale>
      </View>
    </Row>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, padding: 4, gap: space.xs },
  btn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 34, textAlign: 'center', fontVariant: ['tabular-nums'] },
});

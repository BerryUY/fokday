import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { PressableScale, Row, T } from '@/components/ui/primitives';
import type { WorkoutSet } from '@/data/workouts';
import { formatDecimal, parseNonNegative, toInput } from '@/lib/format';
import { useColors } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';

export function SetHeader() {
  return (
    <Row style={{ paddingHorizontal: 4, marginBottom: 6 }}>
      <T variant="caption" tone="dim" style={{ width: 28 }}>Serie</T>
      <T variant="caption" tone="dim" style={{ flex: 1.3, marginLeft: space.sm }}>Anterior</T>
      <T variant="caption" tone="dim" style={{ flex: 1, textAlign: 'center' }}>kg</T>
      <T variant="caption" tone="dim" style={{ flex: 1, textAlign: 'center' }}>Reps</T>
      <View style={{ width: 44 }} />
    </Row>
  );
}

/**
 * One set row. Inputs are committed on blur and when ticking the set as done,
 * so typing never triggers a write per keystroke.
 */
export function SetRow({ set, index, previous, onCommit, onToggle, onDelete }: {
  set: WorkoutSet;
  index: number;
  previous?: { reps: number | null; weight: number | null };
  onCommit: (patch: { reps: number | null; weight: number | null }) => void;
  onToggle: (patch: { reps: number | null; weight: number | null; isCompleted: boolean }) => void;
  onDelete?: () => void;
}) {
  const c = useColors();
  const [weight, setWeight] = useState(toInput(set.weight, 2));
  const [reps, setReps] = useState(set.reps !== null ? String(set.reps) : '');

  useEffect(() => {
    setWeight(toInput(set.weight, 2));
    setReps(set.reps !== null ? String(set.reps) : '');
  }, [set.weight, set.reps]);

  const values = () => {
    const w = weight.trim() ? parseNonNegative(weight) : null;
    const r = reps.trim() ? parseNonNegative(reps) : null;
    return { weight: w, reps: r === null ? null : Math.round(r) };
  };

  const commit = () => {
    const v = values();
    if (v.weight !== set.weight || v.reps !== set.reps) onCommit(v);
  };

  const done = set.isCompleted;
  const inputStyle = [styles.input, { backgroundColor: done ? 'transparent' : c.surfaceAlt, color: c.text }];

  return (
    <View style={[styles.row, done && { backgroundColor: c.accentSoft }]}>
      <PressableScale onLongPress={onDelete} disabled={!onDelete} style={{ width: 28, alignItems: 'center' }} accessibilityLabel={`Serie ${index + 1}`}>
        <T variant="label" tone={done ? 'accent' : 'muted'} style={{ fontFamily: font.bold }}>{index + 1}</T>
      </PressableScale>
      <T variant="caption" tone="dim" style={{ flex: 1.3, marginLeft: space.sm }} numberOfLines={1}>
        {previous && (previous.weight !== null || previous.reps !== null) ? `${previous.weight !== null ? formatDecimal(previous.weight, 2) : '—'} × ${previous.reps ?? '—'}` : '—'}
      </T>
      <TextInput
        value={weight}
        onChangeText={setWeight}
        onBlur={commit}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={c.textDim}
        selectTextOnFocus
        style={inputStyle}
        accessibilityLabel={`Peso de la serie ${index + 1}`}
      />
      <TextInput
        value={reps}
        onChangeText={setReps}
        onBlur={commit}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={c.textDim}
        selectTextOnFocus
        style={inputStyle}
        accessibilityLabel={`Repeticiones de la serie ${index + 1}`}
      />
      <PressableScale
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? 'Marcar serie como pendiente' : 'Marcar serie como hecha'}
        onPress={() => onToggle({ ...values(), isCompleted: !done })}
        hapticFeedback
        scaleTo={0.85}
        style={[styles.check, { backgroundColor: done ? c.accent : c.surfaceAlt }]}
      >
        <Feather name="check" size={18} color={done ? c.accentText : c.textDim} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 4, borderRadius: radius.sm },
  input: { flex: 1, height: 40, borderRadius: 10, textAlign: 'center', fontFamily: font.semibold, fontSize: 16 },
  check: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
});

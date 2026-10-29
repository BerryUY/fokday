import { View } from 'react-native';
import { ProgressBar } from '@/components/ui/progress';
import { Button, Card, Row, T } from '@/components/ui/primitives';
import type { WeightProgress } from '@/domain/weight';
import { formatShort, type DateKey } from '@/lib/dates';
import { formatKg, formatPercent, formatSigned } from '@/lib/format';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** The goal, front and center. Only real measurements feed it. */
export function WeightGoalCard({ progress, lastDate, onPress, onLog, tone }: {
  progress: WeightProgress;
  tone?: 'surface' | 'alt' | 'outline';
  lastDate: DateKey | null;
  onPress?: () => void;
  onLog?: () => void;
}) {
  const c = useColors();
  const { current, target, start, gained, remaining } = progress;
  // Kilos moved in the goal's direction (losing 2 kg toward a lower target shows as +2).
  const towardGoal = (gained ?? 0) * (progress.direction === 'lose' ? -1 : 1);
  return (
    <Card onPress={onPress} tone={tone} style={{ padding: space.xl }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <T variant="overline" tone="dim">Peso actual</T>
          {current !== null ? (
            <Row align="flex-end" gap={6} style={{ marginTop: 6 }}>
              <T variant="hero">{formatKg(current)}</T>
              <T variant="h2" tone="dim" style={{ marginBottom: 6 }}>kg</T>
            </Row>
          ) : (
            <T variant="title" tone="muted" style={{ marginTop: 6 }}>Sin registros</T>
          )}
          {lastDate ? <T variant="caption" tone="dim">Medido el {formatShort(lastDate)}</T> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T variant="overline" tone="dim">Meta</T>
          <Row align="flex-end" gap={4} style={{ marginTop: 6 }}>
            <T variant="display" tone="accent">{formatKg(target)}</T>
            <T variant="label" tone="dim" style={{ marginBottom: 6 }}>kg</T>
          </Row>
          <T variant="caption" tone="dim">Sin fecha límite</T>
        </View>
      </Row>

      <View style={{ marginTop: space.xl, gap: 8 }}>
        <ProgressBar progress={progress.progress ?? 0} color={c.accent} height={10} />
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="caption" tone="dim">Inicio {formatKg(start)} kg</T>
          <T variant="caption" tone="muted">{progress.progress !== null ? `${formatPercent(progress.progress)} del camino` : '—'}</T>
        </Row>
      </View>

      {current !== null ? (
        <Row style={{ marginTop: space.lg, gap: space.md }}>
          {progress.direction === 'maintain' ? (
            <>
              <Stat label="Cambio" value={`${formatSigned(gained ?? 0)} kg`} color={c.text} />
              <Stat label="Estado" value={progress.reached ? 'En tu peso' : `A ${formatKg(remaining ?? 0)} kg`} color={progress.reached ? c.accent : c.text} />
            </>
          ) : (
            <>
              <Stat
                label={progress.direction === 'lose' ? 'Bajados' : 'Ganados'}
                value={`${formatSigned(towardGoal)} kg`}
                color={towardGoal >= 0 ? c.accent : c.textMuted}
              />
              <Stat label="Faltan" value={progress.reached ? '¡Meta alcanzada!' : `${formatKg(remaining ?? 0)} kg`} color={c.text} />
            </>
          )}
        </Row>
      ) : onLog ? (
        <View style={{ marginTop: space.lg }}>
          <Button label="Registrar mi peso" icon="plus" variant="secondary" onPress={onLog} />
        </View>
      ) : null}
    </Card>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 14, padding: space.md }}>
      <T variant="caption" tone="dim">{label}</T>
      <T variant="h2" color={color} style={{ marginTop: 2 }}>{value}</T>
    </View>
  );
}

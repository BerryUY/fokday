import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Switch, View } from 'react-native';
import { Card, Chip, Row, T } from '@/components/ui/primitives';
import { ProgressBar } from '@/components/ui/progress';
import { addWater, getHabits, setCreatine } from '@/data/habits';
import { formatKg } from '@/lib/format';
import { useMutation, useQuery } from '@/state/db';
import { useFeatures } from '@/state/features';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const WATER_STEPS = [250, 500];

/** Daily water and creatine. Each part shows only if the person turned it on in Ajustes. */
export function HabitsCard({ date }: { date: string }) {
  const c = useColors();
  const run = useMutation();
  const { has, waterGoalMl } = useFeatures();
  const showWater = has('water');
  const showCreatine = has('creatine');
  const { data } = useQuery((db) => getHabits(db, date), [date]);
  if (!showWater && !showCreatine) return null;
  const habits = data ?? { creatine: false, waterMl: 0 };
  const liters = (ml: number) => formatKg(Math.round(ml / 100) / 10);

  return (
    <Card>
      <T variant="overline" tone="dim">Hábitos de hoy</T>
      {showWater ? (
        <View style={{ marginTop: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={8}>
              <MaterialCommunityIcons name="water-outline" size={20} color={c.accent} />
              <T variant="h3">{liters(habits.waterMl)} L</T>
              <T variant="label" tone="dim">de {liters(waterGoalMl)} L</T>
            </Row>
            <Chip label="−" compact onPress={() => run((db) => addWater(db, date, -250), { silent: true })} />
          </Row>
          <ProgressBar progress={Math.min(1, habits.waterMl / waterGoalMl)} color={c.accent} style={{ marginTop: space.sm }} />
          <Row style={{ marginTop: space.md }} gap={space.sm}>
            {WATER_STEPS.map((ml) => (
              <Chip key={ml} label={`+${ml} ml`} onPress={() => run((db) => addWater(db, date, ml), { silent: true })} />
            ))}
          </Row>
        </View>
      ) : null}
      {showCreatine ? (
        <Row style={{ justifyContent: 'space-between', marginTop: space.lg }}>
          <Row gap={8} style={{ flex: 1 }}>
            <Feather name="check-circle" size={20} color={habits.creatine ? c.accent : c.textDim} />
            <T variant="bodyMedium">Creatina</T>
            <T variant="label" tone="dim">{habits.creatine ? 'Tomada' : 'Pendiente'}</T>
          </Row>
          <Switch
            value={habits.creatine}
            onValueChange={(v) => run((db) => setCreatine(db, date, v), { silent: true })}
            trackColor={{ true: c.accent, false: c.track }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Creatina tomada hoy"
          />
        </Row>
      ) : null}
    </Card>
  );
}

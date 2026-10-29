import { useState } from 'react';
import { View } from 'react-native';
import { Stepper } from '@/components/ui/form';
import { Button, Card, Chip, Divider, Row, Segmented, T } from '@/components/ui/primitives';
import { saveBody, setGoalsFrom, type BodyData } from '@/data/settings';
import { ACTIVITY_LEVELS, AGE_RANGE, dailyTargets, HEIGHT_RANGE, type ActivityLevel, type Sex } from '@/domain/energy';
import type { Goal } from '@/domain/onboarding';
import { todayKey } from '@/lib/dates';
import { useMutation } from '@/state/db';
import { space } from '@/theme/tokens';

const SEXES: { key: Sex; label: string }[] = [
  { key: 'male', label: 'Hombre' },
  { key: 'female', label: 'Mujer' },
  { key: 'unspecified', label: 'Prefiero no decir' },
];

/**
 * Sexo, edad, altura y actividad: people grow, change weight and train more or less, so the
 * calories and protein can be recalculated from today (earlier days keep their goals).
 */
export function BodyCard({ body, weightKg, targetWeightKg, onGoals }: {
  body: BodyData | null;
  weightKg: number;
  targetWeightKg: number;
  onGoals: (calories: number, protein: number) => void;
}) {
  const run = useMutation();
  const year = new Date().getFullYear();
  const [sex, setSex] = useState<Sex>(body?.sex ?? 'unspecified');
  const [age, setAge] = useState(body ? clamp(year - body.birthYear, AGE_RANGE.min, AGE_RANGE.max) : 30);
  const [height, setHeight] = useState(body?.heightCm ?? 170);
  const [activity, setActivity] = useState<ActivityLevel>(body?.activity ?? 'light');

  const goal: Goal = targetWeightKg < weightKg - 0.2 ? 'lose' : targetWeightKg > weightKg + 0.2 ? 'gain' : 'maintain';
  const calc = dailyTargets({ weightKg, heightCm: height, age, sex, activity }, goal, targetWeightKg);
  const level = ACTIVITY_LEVELS.find((a) => a.key === activity);

  const apply = async () => {
    const ok = await run(
      async (db) => {
        await saveBody(db, { sex, heightCm: height, birthYear: year - age, activity });
        await setGoalsFrom(db, todayKey(), calc.calories, calc.protein);
      },
      { success: 'Objetivos recalculados desde hoy' },
    );
    if (ok !== undefined) onGoals(calc.calories, calc.protein);
  };

  return (
    <Card>
      <View style={{ gap: space.lg }}>
        {!body && <T variant="caption" tone="dim">Completá tus datos para calcular tus calorías y proteína.</T>}
        <Segmented options={SEXES} value={sex} onChange={setSex} />
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="bodyMedium">Edad</T>
          <Stepper value={age} onChange={setAge} min={AGE_RANGE.min} max={AGE_RANGE.max} format={(v) => `${v} años`} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="bodyMedium">Altura</T>
          <Stepper value={height} onChange={setHeight} min={HEIGHT_RANGE.min} max={HEIGHT_RANGE.max} format={(v) => `${v} cm`} />
        </Row>
        <View style={{ gap: space.sm }}>
          <T variant="bodyMedium">Actividad física</T>
          <Row style={{ flexWrap: 'wrap' }} gap={6}>
            {ACTIVITY_LEVELS.map((a) => (
              <Chip key={a.key} label={a.label} compact selected={a.key === activity} onPress={() => setActivity(a.key)} />
            ))}
          </Row>
          {level && <T variant="caption" tone="dim">{level.description}</T>}
        </View>
        <Divider />
        <View>
          <T variant="label" tone="muted">Con estos datos y tu peso de {weightKg.toLocaleString('es-UY')} kg</T>
          <T variant="h2" style={{ marginTop: 2 }}>{calc.calories} kcal · {calc.protein} g de proteína</T>
          <T variant="caption" tone="dim">
            Mantenimiento: {calc.maintenance} kcal. {goal === 'lose' ? 'Para bajar, un 20% menos.' : goal === 'gain' ? 'Para subir, un 10% más.' : 'Para mantener tu peso.'}
          </T>
        </View>
        <Button label="Guardar y recalcular" icon="refresh-cw" onPress={apply} />
      </View>
    </Card>
  );
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

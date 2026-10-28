import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { usePro } from '@/billing/pro';
import { ProLock } from '@/components/ProGate';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import { EmptyState, ListRow, Loading, Screen } from '@/components/ui/layout';
import { Card, Divider, Row, Segmented, T } from '@/components/ui/primitives';
import { getExercise } from '@/data/routines';
import { getExerciseProgress } from '@/data/workouts';
import { formatShort } from '@/lib/dates';
import { formatDecimal, formatNumber, formatSigned } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

type Metric = 'weight' | 'e1rm';

export default function ExerciseProgressScreen() {
  const c = useColors();
  const id = useParams().string('id') ?? '';
  const [metric, setMetric] = useState<Metric>('weight');
  const pro = usePro();
  const { data } = useQuery(async (db) => ({ exercise: await getExercise(db, id), points: await getExerciseProgress(db, id) }), [id]);

  if (!pro) {
    return (
      <Screen title="Progresión">
        <ProLock title="Progresión por ejercicio" message="Mirá cómo suben tus pesos y repeticiones en cada ejercicio, sesión a sesión." />
      </Screen>
    );
  }
  if (!data) return <Screen title="Progresión"><Loading /></Screen>;
  const { points } = data;
  const name = data.exercise?.name ?? 'Ejercicio';
  if (points.length === 0) {
    return <Screen title={name}><EmptyState icon="trending-up" title="Sin series completadas todavía" message="Cuando termines entrenamientos con este ejercicio vas a ver tu progresión acá." /></Screen>;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const best = Math.max(...points.map((p) => p.bestWeight));
  const series = points.map((p) => ({ date: p.date, value: metric === 'weight' ? p.bestWeight : p.estimated1RM }));

  return (
    <Screen title={name} subtitle={`${points.length} ${points.length === 1 ? 'sesión' : 'sesiones'}`}>
      <Row gap={space.md}>
        <Card style={{ flex: 1 }}>
          <T variant="caption" tone="dim">Mejor peso</T>
          <T variant="number" tone="protein">{formatDecimal(best, 2)} kg</T>
        </Card>
        <Card style={{ flex: 1 }}>
          <T variant="caption" tone="dim">Desde la 1.ª sesión</T>
          <T variant="number">{formatSigned(last.bestWeight - first.bestWeight)} kg</T>
        </Card>
      </Row>

      <Card style={{ marginTop: space.lg }}>
        <Segmented<Metric>
          options={[{ key: 'weight', label: 'Peso máximo' }, { key: 'e1rm', label: '1RM estimado' }]}
          value={metric}
          onChange={setMetric}
        />
        <View style={{ marginTop: space.lg }}>
          <LineChart data={series} color={c.protein} formatValue={(v) => formatDecimal(v, 1)} unit="kg" />
        </View>
        {metric === 'e1rm' ? <T variant="caption" tone="dim" style={{ marginTop: space.sm }}>Estimación con la fórmula de Epley a partir de tu mejor serie. Es orientativa.</T> : null}
      </Card>

      {points.length >= 2 ? (
        <Card style={{ marginTop: space.lg }}>
          <T variant="h3" style={{ marginBottom: space.md }}>Volumen por sesión</T>
          <BarChart
            data={points.slice(-12).map((p) => ({ key: p.sessionId, label: formatShort(p.date), value: p.volume, detail: `${formatNumber(p.volume)} kg · ${p.sets} series` }))}
            color={c.accent}
            formatValue={(v) => `${formatNumber(v)} kg`}
            showEveryLabel={points.length > 6 ? 2 : 1}
          />
        </Card>
      ) : null}

      <Card padded={false} style={{ marginTop: space.lg, paddingVertical: space.xs }}>
        {[...points].reverse().map((p, i) => (
          <View key={p.sessionId}>
            {i > 0 ? <Divider style={{ marginHorizontal: space.lg }} /> : null}
            <ListRow
              title={`${formatDecimal(p.bestWeight, 2)} kg × ${p.bestSetReps}`}
              subtitle={`${formatShort(p.date)} · ${p.sets} series · ${formatNumber(p.volume)} kg de volumen`}
              onPress={() => router.push({ pathname: '/sesion/[id]', params: { id: p.sessionId } })}
            />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

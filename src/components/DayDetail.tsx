import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { LogItem, NutritionBars } from '@/components/nutrition';
import { Field } from '@/components/ui/form';
import { Loading } from '@/components/ui/layout';
import { Badge, Button, Card, Divider, IconBubble, Row, SectionHeader, T } from '@/components/ui/primitives';
import { markAttendance, removeAttendance } from '@/data/attendance';
import { getDayDetail, saveDailyNote } from '@/data/history';
import { formatReps } from '@/data/routines';
import { MEAL_CATEGORIES } from '@/domain/nutrition';
import { formatDuration, todayKey, type DateKey } from '@/lib/dates';
import { formatDecimal, formatKcal, formatKg, formatProtein } from '@/lib/format';
import { useMutation, useQuery } from '@/state/db';
import { space } from '@/theme/tokens';

/** Everything recorded on one day, all editable. Used by Historial and /dia/[date]. */
export function DayDetail({ date }: { date: DateKey }) {
  const run = useMutation();
  const { data } = useQuery((db) => getDayDetail(db, date), [date]);
  const [note, setNote] = useState('');

  useEffect(() => {
    setNote(data?.note ?? '');
  }, [data?.note, date]);

  if (!data || data.date !== date) return <Loading variant="list" />;
  const isFuture = date > todayKey();

  return (
    <View style={{ gap: space.lg }}>
      <Card>
        <SectionHeader title="Comidas" action={isFuture ? undefined : 'Agregar'} onAction={() => router.push({ pathname: '/comida/buscar', params: { date } })} />
        <NutritionBars calories={data.totals.calories} protein={data.totals.protein} calorieTarget={data.goal.calories} proteinTarget={data.goal.protein} />
        {data.logs.length === 0 ? (
          <T variant="label" tone="dim" style={{ marginTop: space.md }}>Sin comidas registradas este día.</T>
        ) : (
          <View style={{ marginTop: space.md }}>
            {MEAL_CATEGORIES.map((cat) => {
              const logs = data.logs.filter((l) => l.category === cat.key);
              if (!logs.length) return null;
              return (
                <View key={cat.key} style={{ marginTop: space.sm }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T variant="overline" tone="dim">{cat.label}</T>
                    <T variant="caption" tone="dim">{formatKcal(data.totals.byCategory[cat.key].calories)} kcal · {formatProtein(data.totals.byCategory[cat.key].protein)} g</T>
                  </Row>
                  {logs.map((log) => (
                    <LogItem key={log.id} log={log} onPress={() => router.push({ pathname: '/comida/registro/[id]', params: { id: log.id } })} />
                  ))}
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
          <T variant="h2">Gimnasio</T>
          {data.attendance ? <Badge label={data.attendance.source === 'workout' ? 'Entrenó' : 'Fue (manual)'} /> : <Badge label="No fue" tone="muted" />}
        </Row>
        {data.sessions.map((s) => (
          <View key={s.id} style={{ marginBottom: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="h3">{s.routineName ?? 'Entrenamiento libre'}</T>
              <T variant="caption" tone="dim">{s.durationSeconds ? formatDuration(s.durationSeconds) : ''}</T>
            </Row>
            {s.exercises.filter((e) => e.status === 'done').map((e) => (
              <T key={e.id} variant="caption" tone="muted" style={{ marginTop: 4 }}>
                {e.name}: {e.sets.map((set) => `${set.weight !== null ? formatDecimal(set.weight, 2) : '—'}×${set.reps ?? '—'}`).join(' · ')}
                {e.targetSets ? `  (obj. ${e.targetSets}×${formatReps(e.repsMin, e.repsMax)})` : ''}
              </T>
            ))}
            <Button label="Ver y editar sesión" size="sm" variant="secondary" style={{ marginTop: space.sm, alignSelf: 'flex-start' }} onPress={() => router.push({ pathname: '/sesion/[id]', params: { id: s.id } })} />
          </View>
        ))}
        {data.sessions.length > 0 ? <Divider style={{ marginBottom: space.md }} /> : null}
        {!isFuture ? (
          data.attendance ? (
            <Button label="Desmarcar este día" icon="x" variant="ghost" size="sm" onPress={() => run((db) => removeAttendance(db, date), { success: 'Listo, lo desmarqué' })} />
          ) : (
            <Button label="Ese día fui" icon="check" variant="secondary" size="sm" onPress={() => run((db) => markAttendance(db, date), { success: '¡Bien ahí! Día marcado' })} />
          )
        ) : null}
      </Card>

      <Card>
        <Row gap={space.md}>
          <IconBubble icon="activity" tone="weight" />
          <View style={{ flex: 1 }}>
            <T variant="caption" tone="dim">Peso</T>
            <T variant="h2">{data.weight ? `${formatKg(data.weight.weight)} kg` : 'Sin medición'}</T>
          </View>
          {!isFuture ? (
            <Button
              label={data.weight ? 'Editar' : 'Registrar'}
              size="sm"
              variant="secondary"
              onPress={() => router.push({ pathname: '/peso/registrar', params: data.weight ? { id: data.weight.id } : { date } })}
            />
          ) : null}
        </Row>
      </Card>

      <Card>
        <Field
          label="Nota del día"
          value={note}
          onChangeText={setNote}
          onBlur={() => note !== (data.note ?? '') && run((db) => saveDailyNote(db, date, note), { success: 'Nota guardada' })}
          multiline
          placeholder="Cómo dormiste, energía, lo que quieras recordar"
        />
      </Card>
    </View>
  );
}

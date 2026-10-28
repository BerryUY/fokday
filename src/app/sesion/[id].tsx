import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { View } from 'react-native';
import { DateChip } from '@/components/DatePicker';
import { SessionExerciseCard } from '@/components/SessionExercise';
import { confirm } from '@/components/ui/form';
import { EmptyState, Loading, Screen } from '@/components/ui/layout';
import { Badge, Button, Card, Row, T } from '@/components/ui/primitives';
import { deleteSession, getSession, updateSessionMeta } from '@/data/workouts';
import { capitalize, formatDuration, formatLong, formatTime } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useMutation, useQuery } from '@/state/db';
import { space } from '@/theme/tokens';

/** A finished session, fully editable: date, sets, weights, reps and exercises (history stays correctable). */
export default function SessionDetailScreen() {
  const id = useParams().string('id') ?? '';
  const run = useMutation();
  const { data: session, loading } = useQuery((db) => getSession(db, id), [id]);

  if (loading && !session) return <Screen title="Entrenamiento"><Loading /></Screen>;
  if (!session) return <Screen title="Entrenamiento"><EmptyState icon="alert-circle" title="Este entrenamiento ya no existe" /></Screen>;
  if (session.status === 'in_progress') {
    return (
      <Screen title="Entrenamiento">
        <EmptyState icon="play" title="Este entrenamiento sigue en curso" action={<Button label="Continuar" onPress={() => router.replace('/sesion/activa')} />} />
      </Screen>
    );
  }

  const sets = session.exercises.flatMap((e) => e.sets.filter((s) => s.isCompleted));
  const volume = sets.reduce((sum, s) => sum + (s.reps ?? 0) * (s.weight ?? 0), 0);

  const remove = async () => {
    const ok = await confirm('Eliminar entrenamiento', 'Se borra la sesión con todas sus series. Si fue lo único de ese día, también se quita la asistencia.', 'Eliminar', true);
    if (!ok) return;
    const done = await run((db) => deleteSession(db, session.id), { success: 'Entrenamiento eliminado' });
    if (done !== undefined) goBack();
  };

  return (
    <Screen title={session.routineName ?? 'Entrenamiento libre'} subtitle={capitalize(formatLong(session.date))}>
      <Card style={{ padding: space.xl }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Badge label="Completado · editable" />
          <T variant="caption" tone="dim">{formatTime(session.startedAt)}{session.finishedAt ? ` – ${formatTime(session.finishedAt)}` : ''}</T>
        </Row>
        <Row style={{ justifyContent: 'space-between', marginTop: space.lg }}>
          <Summary label="Duración" value={session.durationSeconds ? formatDuration(session.durationSeconds) : '—'} />
          <Summary label="Ejercicios" value={String(session.exercises.filter((e) => e.status === 'done').length)} />
          <Summary label="Series" value={String(sets.length)} />
          <Summary label="Volumen" value={`${formatNumber(volume)} kg`} />
        </Row>
        <Row style={{ marginTop: space.lg }}>
          <DateChip value={session.date} onChange={(date) => run((db) => updateSessionMeta(db, session.id, { date }), { success: 'Fecha actualizada' })} />
        </Row>
      </Card>

      <View style={{ gap: space.md, marginTop: space.lg }}>
        {session.exercises.map((ex) => (
          <SessionExerciseCard key={ex.id} exercise={ex} />
        ))}
      </View>

      <Button
        label="Agregar ejercicio"
        icon="plus"
        variant="secondary"
        style={{ marginTop: space.lg }}
        onPress={() => router.push({ pathname: '/ejercicios', params: { pick: 'session', target: session.id } })}
      />
      <T variant="caption" tone="dim" style={{ marginTop: space.md }}>
        Todo se puede corregir: la fecha, los pesos, las repeticiones y los ejercicios. Mantené presionado el número de una serie para borrarla.
      </T>
      <Button label="Eliminar entrenamiento" icon="trash-2" variant="danger" style={{ marginTop: space.lg }} onPress={remove} />
    </Screen>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <T variant="h2">{value}</T>
      <T variant="caption" tone="dim">{label}</T>
    </View>
  );
}

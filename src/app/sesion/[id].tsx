import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { View } from 'react-native';
import { DateChip } from '@/components/DatePicker';
import { Foki } from '@/components/mascot/Foki';
import { SessionExerciseCard } from '@/components/SessionExercise';
import { confirm } from '@/components/ui/form';
import { EmptyState, Loading, Screen } from '@/components/ui/layout';
import { Badge, Button, Card, Row, T } from '@/components/ui/primitives';
import { deleteSession, getSession, getSessionRecords, updateSessionMeta } from '@/data/workouts';
import { capitalize, formatDuration, formatLong, formatTime } from '@/lib/dates';
import { formatNumber, toInput } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useMutation, useQuery } from '@/state/db';
import { space } from '@/theme/tokens';

/** A finished session, fully editable: date, sets, weights, reps and exercises (history stays correctable). */
export default function SessionDetailScreen() {
  const params = useParams();
  const id = params.string('id') ?? '';
  const justFinished = params.string('done') === '1';
  const run = useMutation();
  const { data, loading } = useQuery(async (db) => ({ session: await getSession(db, id), records: await getSessionRecords(db, id) }), [id]);
  const session = data?.session;

  if (loading && !data) return <Screen title="Entrenamiento"><Loading variant="cards" /></Screen>;
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
    <Screen title={session.routineName ?? 'Entrenamiento libre'} subtitle={capitalize(formatLong(session.date))} onBack={justFinished ? () => router.replace('/') : undefined}>
      {justFinished ? (
        <View style={{ alignItems: 'center', paddingVertical: space.lg }}>
          <Foki mood="cheer" size={130} />
          <T variant="title" style={{ marginTop: space.md, textAlign: 'center' }}>¡Entrenamiento terminado!</T>
          <T variant="label" tone="muted" style={{ marginTop: 2, textAlign: 'center' }}>Un día más en tu racha.</T>
        </View>
      ) : null}

      {data.records.length ? (
        <Card tone="accent" style={{ marginBottom: space.md, gap: space.sm }}>
          <T variant="h3">{data.records.length === 1 ? 'Récord nuevo' : `${data.records.length} récords nuevos`}</T>
          {data.records.map((r) => (
            <Row key={r.name} style={{ justifyContent: 'space-between' }}>
              <T variant="label" style={{ flexShrink: 1 }}>{r.name}</T>
              <T variant="label" tone="accent">{toInput(r.previous, 2)} → {toInput(r.weight, 2)} kg</T>
            </Row>
          ))}
        </Card>
      ) : null}

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

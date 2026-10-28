import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Vibration, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { SessionExerciseCard } from '@/components/SessionExercise';
import { confirm } from '@/components/ui/form';
import { EmptyState, Loading, Screen } from '@/components/ui/layout';
import { ProgressBar } from '@/components/ui/progress';
import { Button, Row, T } from '@/components/ui/primitives';
import { getProfile } from '@/data/settings';
import { cancelSession, finishSession, getActiveSession, getPreviousPerformance, getSession, type PreviousPerformance } from '@/data/workouts';
import { formatDuration } from '@/lib/dates';
import { useDb, useMutation, useQuery } from '@/state/db';
import { haptic } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/**
 * The live workout. Every tap is written to SQLite immediately, so closing the
 * app (or the phone dying) never loses progress; reopening resumes here.
 */
export default function ActiveSessionScreen() {
  const c = useColors();
  const db = useDb();
  const run = useMutation();
  const [now, setNow] = useState(Date.now());
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [finishing, setFinishing] = useState(false);

  const { data } = useQuery(async (d) => {
    const active = await getActiveSession(d);
    if (!active) return { session: null };
    const [session, profile] = await Promise.all([getSession(d, active.id), getProfile(d)]);
    const previous: Record<string, PreviousPerformance | null> = {};
    for (const ex of session?.exercises ?? []) {
      if (ex.exerciseId && !(ex.exerciseId in previous)) previous[ex.exerciseId] = await getPreviousPerformance(d, ex.exerciseId, active.id);
    }
    return { session, previous, defaultRest: profile.defaultRestSeconds };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (rest && now >= rest.endsAt) {
      setRest(null);
      haptic('success');
      if (Platform.OS === 'android') Vibration.vibrate([0, 180, 120, 180]);
    }
  }, [now, rest]);

  if (!data) return <Screen title="Entrenamiento"><Loading /></Screen>;
  const session = data.session;
  if (!session) {
    return (
      <Screen title="Entrenamiento">
        <EmptyState icon="check-circle" title="No hay un entrenamiento en curso" action={<Button label="Ir a Entrenar" onPress={() => router.replace('/entrenar')} />} />
      </Screen>
    );
  }

  const elapsed = (now - new Date(session.startedAt).getTime()) / 1000;
  const allSets = session.exercises.flatMap((e) => (e.status === 'skipped' ? [] : e.sets));
  const doneSets = allSets.filter((s) => s.isCompleted).length;

  const finish = async () => {
    const pending = allSets.length - doneSets;
    const ok = await confirm(
      'Terminar entrenamiento',
      pending > 0 ? `Hay ${pending} series sin marcar: no se guardan. La asistencia de hoy se registra automáticamente.` : 'Se guarda la sesión y se registra la asistencia de hoy.',
      'Terminar',
    );
    if (!ok) return;
    setFinishing(true);
    const done = await run((d) => finishSession(d, session.id), { success: '¡Entrenamiento guardado! Un día más en tu racha.' });
    setFinishing(false);
    if (done !== undefined) router.replace({ pathname: '/sesion/[id]', params: { id: session.id } });
  };

  const cancel = async () => {
    const ok = await confirm('Cancelar entrenamiento', 'Se descarta esta sesión y todo lo que cargaste en ella.', 'Descartar', true);
    if (!ok) return;
    const done = await run((d) => cancelSession(d, session.id), { success: 'Entrenamiento descartado' });
    if (done !== undefined) goBack();
  };

  return (
    <Screen
      title={session.routineName ?? 'Entrenamiento libre'}
      subtitle={`${formatDuration(elapsed)} · ${doneSets}/${allSets.length} series`}
      right={<Button label="Terminar" size="sm" onPress={finish} loading={finishing} />}
      footer={
        <View style={{ gap: space.sm }}>
          {rest ? (
            <Animated.View entering={FadeInDown} exiting={FadeOutDown} style={[styles.rest, { backgroundColor: c.surfaceAlt }]}>
              <View style={{ flex: 1, gap: 6 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T variant="label" tone="muted">Descanso</T>
                  <T variant="number" tone="accent">{formatDuration(Math.max(0, (rest.endsAt - now) / 1000))}</T>
                </Row>
                <ProgressBar progress={Math.max(0, (rest.endsAt - now) / 1000 / rest.total)} color={c.accent} height={4} />
              </View>
              <Button label="+15 s" size="sm" variant="secondary" onPress={() => setRest({ endsAt: rest.endsAt + 15_000, total: rest.total + 15 })} />
              <Button label="Saltar" size="sm" variant="ghost" onPress={() => setRest(null)} />
            </Animated.View>
          ) : null}
          <Row gap={space.sm}>
            <Button
              label="Agregar ejercicio"
              icon="plus"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/ejercicios', params: { pick: 'session', target: session.id } })}
            />
            <Button label="Cancelar" variant="danger" onPress={cancel} />
          </Row>
        </View>
      }
    >
      <ProgressBar progress={allSets.length ? doneSets / allSets.length : 0} color={c.accent} height={6} style={{ marginBottom: space.md }} />
      {session.routineId ? (
        <Button
          label="Editar la rutina"
          icon="edit-2"
          variant="ghost"
          size="sm"
          style={{ alignSelf: 'flex-start', marginBottom: space.sm }}
          onPress={() => router.push({ pathname: '/rutina/[id]', params: { id: session.routineId! } })}
        />
      ) : null}
      {session.exercises.length === 0 ? (
        <EmptyState icon="plus-circle" title="Entrenamiento libre" message="Agregá los ejercicios a medida que los hacés." />
      ) : (
        <View style={{ gap: space.md }}>
          {session.exercises.map((ex) => (
            <SessionExerciseCard
              key={ex.id}
              exercise={ex}
              previous={ex.exerciseId ? data.previous?.[ex.exerciseId] : null}
              onSetCompleted={(seconds) => {
                const total = seconds ?? data.defaultRest ?? 90;
                setRest({ endsAt: Date.now() + total * 1000, total });
              }}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rest: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.lg, padding: space.md },
});

import { Feather } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, Vibration, View } from 'react-native';
import { SwipeToComplete } from '@/components/juice/SwipeToComplete';
import { Foki } from '@/components/mascot/Foki';
import { Sheet, confirm } from '@/components/ui/form';
import { EmptyState, ListRow, Loading, Screen } from '@/components/ui/layout';
import { ProgressRing } from '@/components/ui/progress';
import { Button, Card, Divider, IconButton, PressableScale, Row, T } from '@/components/ui/primitives';
import { formatReps } from '@/data/routines';
import { getProfile } from '@/data/settings';
import {
  addSet,
  cancelSession,
  completeSet,
  deleteSet,
  finishSession,
  getActiveSession,
  getPreviousPerformance,
  getSession,
  setExerciseSkipped,
  updateSet,
  type PreviousPerformance,
  type WorkoutExercise,
  type WorkoutSet,
} from '@/data/workouts';
import { formatDuration } from '@/lib/dates';
import { parseNonNegative, toInput } from '@/lib/format';
import { goBack } from '@/lib/nav';
import { playReward } from '@/lib/sound';
import { cancelRestEnd, scheduleRestEnd } from '@/notifications/rest';
import { useMutation, useQuery } from '@/state/db';
import { haptic } from '@/state/toast';
import { useColors } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';

type Rest = { endsAt: number; total: number; next: string };
type Draft = { id: string; weight: string; reps: string };

const WEIGHT_STEP = 2.5;

// The rest keeps running if you leave the screen to check something and come back.
let liveRest: Rest | null = null;

const draftOf = (set: WorkoutSet): Draft => ({ id: set.id, weight: toInput(set.weight, 2), reps: set.reps !== null ? String(set.reps) : '' });
const parsed = (d: Draft) => {
  const reps = d.reps.trim() ? parseNonNegative(d.reps) : null;
  return { weight: d.weight.trim() ? parseNonNegative(d.weight) : null, reps: reps === null ? null : Math.round(reps) };
};
const setLabel = (s: { weight: number | null; reps: number | null }) =>
  `${s.weight ? `${toInput(s.weight, 2)} kg × ` : ''}${s.reps ?? '—'}${s.weight ? '' : ' reps'}`;

/**
 * The live workout, thought for someone between sets with sweaty hands: one exercise and one set at
 * a time, big controls, no keyboard needed. The weights come filled in from last time, so most sets
 * are a single tap. Every tap is saved right away; closing the app never loses anything.
 */
export default function ActiveSessionScreen() {
  useKeepAwake();
  const run = useMutation();
  const [now, setNow] = useState(Date.now());
  const [rest, setRestState] = useState<Rest | null>(liveRest);
  const [focus, setFocus] = useState<string | null>(null);
  const [pickedSet, setPickedSet] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [menu, setMenu] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const setRest = (next: Rest | null) => {
    liveRest = next;
    setRestState(next);
  };

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
      liveRest = null;
      setRestState(null);
      haptic('success');
      if (Platform.OS === 'android') Vibration.vibrate([0, 180, 120, 180]);
    }
  }, [now, rest]);

  if (!data) return <Screen title="Entrenamiento"><Loading /></Screen>;
  const session = data.session;
  if (!session) {
    return (
      <Screen title="Entrenamiento">
        <EmptyState icon="check-circle" title="No hay un entrenamiento en curso" action={<Button label="Volver al inicio" onPress={() => router.replace('/')} />} />
      </Screen>
    );
  }

  const elapsed = (now - new Date(session.startedAt).getTime()) / 1000;
  const live = session.exercises.filter((e) => e.status !== 'skipped');
  const allSets = live.flatMap((e) => e.sets);
  const doneSets = allSets.filter((s) => s.isCompleted).length;
  const pending = live.filter((e) => e.sets.some((s) => !s.isCompleted));
  const current = session.exercises.find((e) => e.id === focus) ?? pending[0] ?? null;
  const set = current ? current.sets.find((s) => s.id === pickedSet) ?? current.sets.find((s) => !s.isCompleted) ?? current.sets[current.sets.length - 1] ?? null : null;
  const values = set ? (draft?.id === set.id ? draft : draftOf(set)) : null;
  const allDone = allSets.length > 0 && pending.length === 0 && !focus;
  const previous = current?.exerciseId ? data.previous?.[current.exerciseId] : null;
  const setIndex = current && set ? current.sets.findIndex((s) => s.id === set.id) : -1;

  const pick = (exerciseId: string | null, setId: string | null = null) => {
    setFocus(exerciseId);
    setPickedSet(setId);
    setDraft(null);
  };

  const bump = (field: 'weight' | 'reps', delta: number) => {
    if (!values) return;
    haptic('light');
    const value = Math.max(0, (parseNonNegative(values[field]) ?? 0) + delta);
    setDraft({ ...values, [field]: field === 'weight' ? toInput(value, 2) : String(Math.round(value)) });
  };

  const markDone = async () => {
    if (!set || !values || !current) return;
    const done = await run((d) => completeSet(d, set.id, parsed(values)));
    if (done === undefined) return;
    haptic('medium');
    const nextSet = current.sets.find((s) => !s.isCompleted && s.id !== set.id);
    const nextExercise = pending.find((e) => e.id !== current.id);
    pick(nextSet ? focus : null);
    const next = nextSet
      ? `Serie ${current.sets.indexOf(nextSet) + 1} de ${current.sets.length} · ${current.name}`
      : nextExercise
        ? `Sigue ${nextExercise.name}`
        : null;
    if (!next) return void playReward();
    const seconds = current.restSeconds ?? data.defaultRest ?? 90;
    setRest({ endsAt: Date.now() + seconds * 1000, total: seconds, next });
    void scheduleRestEnd(seconds, next);
  };

  const saveEdit = async () => {
    if (!set || !values) return;
    const ok = await run((d) => updateSet(d, set.id, parsed(values)), { success: 'Serie corregida' });
    if (ok !== undefined) pick(null);
  };

  const undo = async () => {
    if (!set) return;
    const ok = await run((d) => updateSet(d, set.id, { isCompleted: false }));
    if (ok !== undefined) setPickedSet(null);
  };

  const skipRest = () => {
    setRest(null);
    void cancelRestEnd();
  };

  const finish = async () => {
    const left = allSets.length - doneSets;
    if (left > 0) {
      const ok = await confirm('Terminar entrenamiento', `Te ${left === 1 ? 'queda 1 serie' : `quedan ${left} series`} sin hacer: no se guardan.`, 'Terminar');
      if (!ok) return;
    }
    setMenu(false);
    setFinishing(true);
    const done = await run((d) => finishSession(d, session.id));
    setFinishing(false);
    if (done !== undefined) {
      skipRest();
      void playReward();
      router.replace({ pathname: '/sesion/[id]', params: { id: session.id, done: '1' } });
    }
  };

  const discard = async () => {
    const ok = await confirm('Descartar entrenamiento', 'Se borra esta sesión y todo lo que cargaste en ella.', 'Descartar', true);
    if (!ok) return;
    const done = await run((d) => cancelSession(d, session.id), { success: 'Entrenamiento descartado' });
    if (done !== undefined) {
      skipRest();
      setMenu(false);
      goBack();
    }
  };

  const addExercise = () => {
    setMenu(false);
    router.push({ pathname: '/ejercicios', params: { pick: 'session', target: session.id } });
  };

  const footer = rest ? (
    <Row gap={space.sm}>
      <Button label="+15 s" variant="secondary" size="lg" onPress={() => setRest({ ...rest, endsAt: rest.endsAt + 15_000, total: rest.total + 15 })} style={{ flex: 1 }} />
      <Button label="Saltar descanso" size="lg" onPress={skipRest} style={{ flex: 2 }} />
    </Row>
  ) : allDone ? (
    <SwipeToComplete label="Deslizá para terminar" onComplete={() => void finish()} loading={finishing} />
  ) : set?.isCompleted ? (
    <Row gap={space.sm}>
      <Button label="Desmarcar" variant="secondary" size="lg" onPress={undo} style={{ flex: 1 }} />
      <Button label="Guardar" icon="check" size="lg" onPress={saveEdit} style={{ flex: 1 }} />
    </Row>
  ) : set ? (
    <Button label="Serie hecha" icon="check" size="lg" onPress={markDone} />
  ) : (
    <Button label="Agregar ejercicio" icon="plus" size="lg" onPress={addExercise} />
  );

  return (
    <Screen
      title={session.routineName ?? 'Entrenamiento libre'}
      subtitle={formatDuration(elapsed)}
      right={<IconButton icon="list" label="Ver todos los ejercicios" onPress={() => setMenu(true)} />}
      footer={footer}
    >
      <Progress exercises={live} currentId={current?.id ?? null} />

      {rest ? (
        <RestView left={Math.max(0, (rest.endsAt - now) / 1000)} total={rest.total} next={rest.next} />
      ) : allDone ? (
        <View style={styles.center}>
          <Foki mood="cheer" size={150} />
          <T variant="title" style={{ marginTop: space.lg, textAlign: 'center' }}>¡Hiciste todo!</T>
          <T variant="label" tone="muted" style={{ marginTop: 4, textAlign: 'center' }}>{doneSets} series en {formatDuration(elapsed)}</T>
          <Button label="Agregar otro ejercicio" icon="plus" variant="ghost" size="sm" style={{ marginTop: space.lg }} onPress={addExercise} />
        </View>
      ) : !current ? (
        <View style={styles.center}>
          <Foki mood="strong" size={140} />
          <T variant="title" style={{ marginTop: space.lg, textAlign: 'center' }}>Entrenamiento libre</T>
          <T variant="label" tone="muted" style={{ marginTop: 4, textAlign: 'center', maxWidth: 280 }}>Sumá los ejercicios a medida que los vas haciendo.</T>
        </View>
      ) : (
        <View>
          <T variant="overline" tone="dim">Ejercicio {live.indexOf(current) + 1} de {live.length}</T>
          <T variant="display" style={{ marginTop: 4 }}>{current.name}</T>
          {current.targetSets ? (
            <T variant="label" tone="muted" style={{ marginTop: 2 }}>Objetivo: {current.targetSets} × {formatReps(current.repsMin, current.repsMax)} repeticiones</T>
          ) : null}

          <SetPills
            exercise={current}
            selected={set?.id ?? null}
            onSelect={(id) => pick(current.id, id)}
            onAdd={() => run((d) => addSet(d, current.id))}
            onDelete={async (id, i) => {
              const ok = await confirm('Borrar serie', `¿Borrar la serie ${i + 1}?`, 'Borrar', true);
              if (ok) void run((d) => deleteSet(d, id));
            }}
          />

          {set && values ? (
            <Card style={{ marginTop: space.lg, gap: space.lg, padding: space.xl }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="h2">Serie {setIndex + 1}{set.isCompleted ? ' · hecha' : ''}</T>
                {previous?.sets[setIndex] ? <T variant="caption" tone="dim">La vez pasada: {setLabel(previous.sets[setIndex])}</T> : null}
              </Row>
              <BigStepper label="Peso" unit="kg" value={values.weight} keyboardType="decimal-pad" onChange={(weight) => setDraft({ ...values, weight })} onMinus={() => bump('weight', -WEIGHT_STEP)} onPlus={() => bump('weight', WEIGHT_STEP)} />
              <Divider />
              <BigStepper label="Repeticiones" unit="reps" value={values.reps} keyboardType="number-pad" onChange={(reps) => setDraft({ ...values, reps })} onMinus={() => bump('reps', -1)} onPlus={() => bump('reps', 1)} />
            </Card>
          ) : (
            <Card style={{ marginTop: space.lg }}>
              <T variant="label" tone="muted">Este ejercicio no tiene series. Tocá el + para sumar una.</T>
            </Card>
          )}
        </View>
      )}

      <Sheet visible={menu} onClose={() => setMenu(false)} title="Ejercicios de hoy">
        <View style={{ gap: space.md }}>
          <Card tone="alt" padded={false} style={{ paddingVertical: space.xs }}>
            {session.exercises.map((e, i) => {
              const skipped = e.status === 'skipped';
              const done = e.sets.filter((s) => s.isCompleted).length;
              return (
                <View key={e.id}>
                  {i > 0 ? <Divider style={{ marginLeft: 62 }} /> : null}
                  <ListRow
                    icon={skipped ? 'skip-forward' : done === e.sets.length && done > 0 ? 'check' : 'circle'}
                    iconTone={skipped ? 'muted' : done === e.sets.length && done > 0 ? 'accent' : 'muted'}
                    title={e.name}
                    subtitle={skipped ? 'Salteado · tocá para retomarlo' : `${done} de ${e.sets.length} series`}
                    right={e.id === current?.id && !allDone ? <T variant="caption" tone="accent">Ahora</T> : undefined}
                    chevron={false}
                    onPress={async () => {
                      if (skipped) await run((d) => setExerciseSkipped(d, e.id, false));
                      pick(e.id);
                      setMenu(false);
                    }}
                  />
                </View>
              );
            })}
          </Card>
          <Button label="Agregar ejercicio" icon="plus" variant="secondary" onPress={addExercise} />
          {current && !allDone ? (
            <Button
              label={`Saltear ${current.name}`}
              icon="skip-forward"
              variant="secondary"
              onPress={async () => {
                await run((d) => setExerciseSkipped(d, current.id, true));
                pick(null);
                setMenu(false);
              }}
            />
          ) : null}
          {session.routineId ? (
            <Button
              label="Editar la rutina"
              icon="edit-2"
              variant="secondary"
              onPress={() => {
                setMenu(false);
                router.push({ pathname: '/rutina/[id]', params: { id: session.routineId! } });
              }}
            />
          ) : null}
          <Button label="Terminar entrenamiento" icon="flag" onPress={finish} loading={finishing} disabled={doneSets === 0} />
          <Button label="Descartar entrenamiento" variant="ghost" size="sm" onPress={discard} />
        </View>
      </Sheet>
    </Screen>
  );
}

/** One small bar per exercise, filling as its sets get done. */
function Progress({ exercises, currentId }: { exercises: WorkoutExercise[]; currentId: string | null }) {
  const c = useColors();
  if (exercises.length === 0) return null;
  return (
    <Row gap={4} style={{ marginBottom: space.xl }}>
      {exercises.map((e) => {
        const done = e.sets.length ? e.sets.filter((s) => s.isCompleted).length / e.sets.length : 0;
        return (
          <View key={e.id} style={[styles.segment, { backgroundColor: e.id === currentId ? c.textDim : c.track }]}>
            <View style={{ width: `${done * 100}%`, height: '100%', borderRadius: 3, backgroundColor: c.accent }} />
          </View>
        );
      })}
    </Row>
  );
}

function SetPills({ exercise, selected, onSelect, onAdd, onDelete }: {
  exercise: WorkoutExercise;
  selected: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string, index: number) => void;
}) {
  const c = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.lg, marginHorizontal: -space.lg }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
      {exercise.sets.map((s, i) => {
        const active = s.id === selected;
        return (
          <PressableScale
            key={s.id}
            accessibilityRole="button"
            accessibilityLabel={`Serie ${i + 1}${s.isCompleted ? ', hecha' : ''}`}
            onPress={() => onSelect(s.id)}
            onLongPress={() => onDelete(s.id, i)}
            scaleTo={0.94}
            style={[styles.pill, { backgroundColor: s.isCompleted ? c.accentSoft : c.surface, borderColor: active ? c.accent : 'transparent' }]}
          >
            {s.isCompleted ? <Feather name="check" size={14} color={c.accent} /> : <T variant="label" tone={active ? 'default' : 'dim'}>{i + 1}</T>}
            {s.isCompleted ? <T variant="label" tone="accent">{setLabel(s)}</T> : null}
          </PressableScale>
        );
      })}
      <PressableScale accessibilityRole="button" accessibilityLabel="Agregar una serie" onPress={onAdd} scaleTo={0.94} style={[styles.pill, { backgroundColor: c.surface, borderColor: 'transparent' }]}>
        <Feather name="plus" size={16} color={c.textMuted} />
      </PressableScale>
    </ScrollView>
  );
}

/** A number you change with big buttons; tapping the number itself lets you type it. */
function BigStepper({ label, unit, value, keyboardType, onChange, onMinus, onPlus }: {
  label: string;
  unit: string;
  value: string;
  keyboardType: 'decimal-pad' | 'number-pad';
  onChange: (v: string) => void;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const c = useColors();
  return (
    <Row gap={space.md}>
      <PressableScale accessibilityRole="button" accessibilityLabel={`Menos ${label.toLowerCase()}`} onPress={onMinus} scaleTo={0.9} style={[styles.round, { backgroundColor: c.surfaceAlt }]}>
        <Feather name="minus" size={24} color={c.text} />
      </PressableScale>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          selectTextOnFocus
          placeholder="0"
          placeholderTextColor={c.textDim}
          accessibilityLabel={label}
          style={[styles.number, { color: c.text }]}
        />
        <T variant="caption" tone="dim">{unit}</T>
      </View>
      <PressableScale accessibilityRole="button" accessibilityLabel={`Más ${label.toLowerCase()}`} onPress={onPlus} scaleTo={0.9} style={[styles.round, { backgroundColor: c.surfaceAlt }]}>
        <Feather name="plus" size={24} color={c.text} />
      </PressableScale>
    </Row>
  );
}

function RestView({ left, total, next }: { left: number; total: number; next: string }) {
  const c = useColors();
  return (
    <View style={styles.center}>
      <T variant="overline" tone="dim" style={{ marginBottom: space.lg }}>Descanso</T>
      <ProgressRing progress={left / total} size={220} stroke={12} color={c.accent}>
        <T variant="hero" style={{ fontSize: 56, lineHeight: 62, fontVariant: ['tabular-nums'] }}>{formatDuration(left)}</T>
      </ProgressRing>
      <Foki mood="happy" size={92} style={{ marginTop: space.xl }} />
      <T variant="label" tone="dim" style={{ marginTop: space.sm }}>Lo que sigue</T>
      <T variant="h3" style={{ marginTop: 2, textAlign: 'center' }}>{next}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingTop: space.lg },
  segment: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 44, height: 40, paddingHorizontal: 13, borderRadius: radius.pill, justifyContent: 'center', borderWidth: 1.5 },
  round: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  number: { width: '100%', minWidth: 0, textAlign: 'center', fontFamily: font.bold, fontSize: 44, lineHeight: 52, padding: 0, fontVariant: ['tabular-nums'] },
});

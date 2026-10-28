import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Field, Sheet, Stepper, confirm } from '@/components/ui/form';
import { EmptyState, Loading, Screen } from '@/components/ui/layout';
import { Button, Card, Chip, IconButton, Row, SectionHeader, T } from '@/components/ui/primitives';
import {
  deleteRoutine,
  exercisesForWeekday,
  formatReps,
  getRoutine,
  moveRoutineExercise,
  removeRoutineExercise,
  saveRoutine,
  setRoutineWeekdays,
  updateRoutineExercise,
  type RoutineExercise,
} from '@/data/routines';
import { getActiveSession, startSession } from '@/data/workouts';
import { DAY_SHORT, todayKey, weekday, WEEK_ORDER } from '@/lib/dates';
import { parsePositive } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useMutation, useQuery } from '@/state/db';
import { space } from '@/theme/tokens';

export default function RoutineScreen() {
  const id = useParams().string('id') ?? '';
  const run = useMutation();
  const [editing, setEditing] = useState<RoutineExercise | null>(null);
  const [renaming, setRenaming] = useState(false);
  // null = automatic: today's exercises when the routine splits them by day, otherwise all of them.
  const [view, setView] = useState<number | 'all' | null>(null);

  const { data, loading } = useQuery(async (db) => ({ routine: await getRoutine(db, id), active: await getActiveSession(db) }), [id]);
  const routine = data?.routine;

  if (loading && !data) return <Screen title="Rutina"><Loading /></Screen>;
  if (!routine) return <Screen title="Rutina"><EmptyState icon="alert-circle" title="Esta rutina ya no existe" /></Screen>;

  const toggleDay = (d: number) => {
    const next = routine.weekdays.includes(d) ? routine.weekdays.filter((x) => x !== d) : [...routine.weekdays, d];
    run((db) => setRoutineWeekdays(db, routine.id, next));
  };

  const splitByDay = routine.exercises.some((e) => e.days.length > 0);
  const today = weekday(todayKey());
  const shownDay: number | 'all' = view ?? (splitByDay ? today : 'all');
  const shown = shownDay === 'all' ? routine.exercises : exercisesForWeekday(routine.exercises, shownDay);

  const start = async () => {
    const sessionId = await run((db) => startSession(db, todayKey(), routine.id, shownDay === 'all' ? null : shownDay));
    if (sessionId) router.push('/sesion/activa');
  };

  const remove = async () => {
    const ok = await confirm('Eliminar rutina', `Se elimina “${routine.name}”. Los entrenamientos que ya hiciste con ella se conservan en el historial.`, 'Eliminar', true);
    if (!ok) return;
    const done = await run((db) => deleteRoutine(db, routine.id), { success: 'Rutina eliminada' });
    if (done !== undefined) goBack();
  };

  return (
    <Screen
      title={routine.name}
      subtitle={`${routine.exerciseCount} ejercicios · ${routine.totalSets} series`}
      right={<IconButton icon="plus" label="Agregar ejercicio" onPress={() => router.push({ pathname: '/ejercicios', params: { pick: 'routine', target: routine.id } })} />}
      footer={
        data?.active ? (
          <Button label="Continuar entrenamiento" icon="play" size="lg" onPress={() => router.push('/sesion/activa')} />
        ) : (
          <Button label={shownDay === 'all' ? 'Iniciar entrenamiento' : `Iniciar entrenamiento · ${DAY_SHORT[shownDay]}`} icon="play" size="lg" onPress={start} disabled={shown.length === 0} />
        )
      }
    >
      <Card onPress={() => setRenaming(true)} style={{ marginBottom: space.md }}>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}>
            <T variant="overline" tone="dim">Rutina</T>
            <T variant="h2" style={{ marginTop: 2 }}>{routine.name}</T>
          </View>
          <Button label="Editar" icon="edit-2" size="sm" variant="secondary" onPress={() => setRenaming(true)} />
        </Row>
      </Card>

      <Card>
        <SectionHeader title="Días asignados" />
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {WEEK_ORDER.map((d) => (
            <Chip key={d} label={DAY_SHORT[d]} compact selected={routine.weekdays.includes(d)} onPress={() => toggleDay(d)} />
          ))}
        </Row>
        <T variant="caption" tone="dim" style={{ marginTop: space.sm }}>Cada día tiene una sola rutina: si elegís un día ocupado, pasa a esta.</T>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <SectionHeader
          title="Ejercicios"
          action="Agregar"
          onAction={() => router.push({ pathname: '/ejercicios', params: { pick: 'routine', target: routine.id } })}
        />
        {routine.exercises.length === 0 ? (
          <Card>
            <EmptyState
              icon="plus-circle"
              title="Agregá ejercicios"
              message="Elegilos de tu biblioteca o creá nuevos. Después ajustás series, repeticiones y descanso."
              action={<Button label="Agregar ejercicio" icon="plus" onPress={() => router.push({ pathname: '/ejercicios', params: { pick: 'routine', target: routine.id } })} />}
            />
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            <Row style={{ flexWrap: 'wrap' }} gap={6}>
              <Chip label="Todos" compact selected={shownDay === 'all'} onPress={() => setView('all')} />
              {WEEK_ORDER.map((d) => (
                <Chip key={d} label={DAY_SHORT[d]} compact selected={shownDay === d} onPress={() => setView(d)} />
              ))}
            </Row>
            {shownDay !== 'all' && shown.length === 0 ? <T variant="label" tone="muted">Ese día no tiene ejercicios. Asignalos desde el lápiz de cada ejercicio.</T> : null}
            <T variant="caption" tone="dim">Tocá un ejercicio para cambiar series, repeticiones, descanso o notas. Usá las flechas para reordenar.{data?.active ? ' Los cambios valen desde el próximo entrenamiento; el que está en curso no cambia.' : ''}</T>
            {shown.map((ex, i) => (
              <Animated.View key={ex.id} layout={LinearTransition.duration(220)} entering={FadeInDown.delay(i * 25)}>
                <Card style={{ paddingVertical: space.md }} onPress={() => setEditing(ex)}>
                  <Row align="center" gap={space.md}>
                    <View style={{ flex: 1 }}>
                      <T variant="h3">{ex.name}</T>
                      <T variant="caption" tone="dim">{ex.muscleGroup}</T>
                      <Row gap={space.md} style={{ marginTop: 6 }}>
                        <T variant="label" tone="accent">{ex.sets} × {formatReps(ex.repsMin, ex.repsMax)}</T>
                        {ex.restSeconds ? <T variant="label" tone="muted">Descanso {ex.restSeconds} s</T> : null}
                      </Row>
                      <T variant="caption" tone="dim" style={{ marginTop: 2 }}>{ex.days.length ? ex.days.map((d) => DAY_SHORT[d]).join(' · ') : 'Todos los días'}</T>
                    </View>
                    <IconButton icon="edit-2" label={`Editar ${ex.name}`} size={32} onPress={() => setEditing(ex)} />
                    <View style={{ gap: 6 }}>
                      <IconButton icon="chevron-up" label="Subir" size={32} onPress={i > 0 ? () => run((db) => moveRoutineExercise(db, routine.id, ex.id, -1)) : undefined} style={i === 0 && { opacity: 0.3 }} />
                      <IconButton
                        icon="chevron-down"
                        label="Bajar"
                        size={32}
                        onPress={i < shown.length - 1 ? () => run((db) => moveRoutineExercise(db, routine.id, ex.id, 1)) : undefined}
                        style={i === shown.length - 1 && { opacity: 0.3 }}
                      />
                    </View>
                  </Row>
                </Card>
              </Animated.View>
            ))}
          </View>
        )}
      </View>

      <Button label="Eliminar rutina" icon="trash-2" variant="ghost" style={{ marginTop: space.xl }} onPress={remove} />

      {editing ? (
        <TargetsSheet
          key={editing.id}
          exercise={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const ok = await run((db) => updateRoutineExercise(db, editing.id, input), { success: 'Ejercicio actualizado' });
            if (ok !== undefined) setEditing(null);
          }}
          onRemove={async () => {
            const ok = await run((db) => removeRoutineExercise(db, editing.id), { success: 'Quitado de la rutina' });
            if (ok !== undefined) setEditing(null);
          }}
        />
      ) : null}

      <RenameSheet
        key={`${routine.name}-${renaming}`}
        visible={renaming}
        name={routine.name}
        onClose={() => setRenaming(false)}
        onSave={async (name) => {
          const ok = await run((db) => saveRoutine(db, { name, notes: routine.notes }, routine.id), { success: 'Rutina actualizada' });
          if (ok) setRenaming(false);
        }}
      />
    </Screen>
  );
}

function TargetsSheet({ exercise, onClose, onSave, onRemove }: {
  exercise: RoutineExercise;
  onClose: () => void;
  onSave: (input: { sets: number; repsMin: number | null; repsMax: number | null; restSeconds: number | null; notes: string | null; days: number[] }) => void;
  onRemove: () => void;
}) {
  const [sets, setSets] = useState(exercise.sets);
  const [min, setMin] = useState(exercise.repsMin ? String(exercise.repsMin) : '');
  const [max, setMax] = useState(exercise.repsMax ? String(exercise.repsMax) : '');
  const [rest, setRest] = useState(exercise.restSeconds ?? 90);
  const [hasRest, setHasRest] = useState(exercise.restSeconds !== null);
  const [days, setDays] = useState<number[]>(exercise.days);
  const repsMin = min.trim() ? parsePositive(min) : null;
  const repsMax = max.trim() ? parsePositive(max) : null;
  return (
    <Sheet visible onClose={onClose} title={exercise.name}>
      <View style={{ gap: space.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="bodyMedium">Series</T>
          <Stepper value={sets} onChange={setSets} min={1} max={20} />
        </Row>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}><Field label="Reps mínimas" value={min} onChangeText={setMin} keyboardType="number-pad" placeholder="8" /></View>
          <View style={{ flex: 1 }}><Field label="Reps máximas" value={max} onChangeText={setMax} keyboardType="number-pad" placeholder="12" /></View>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Chip label={hasRest ? 'Descanso' : 'Sin descanso definido'} selected={hasRest} onPress={() => setHasRest(!hasRest)} />
          {hasRest ? <Stepper value={rest} onChange={setRest} min={15} max={600} step={15} format={(v) => `${v} s`} /> : null}
        </Row>
        <View style={{ gap: 6 }}>
          <T variant="bodyMedium">¿Qué días lo hacés?</T>
          <T variant="caption" tone="dim">Si no marcás ninguno, aparece todos los días de la rutina.</T>
          <Row style={{ flexWrap: 'wrap', marginTop: 4 }} gap={6}>
            {WEEK_ORDER.map((d) => (
              <Chip key={d} label={DAY_SHORT[d]} compact selected={days.includes(d)} onPress={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])} />
            ))}
          </Row>
        </View>
        <Button
          label="Guardar"
          onPress={() =>
            onSave({
              sets,
              repsMin: repsMin === null ? null : Math.round(repsMin),
              repsMax: repsMax === null ? null : Math.round(repsMax),
              restSeconds: hasRest ? rest : null,
              notes: exercise.notes,
              days,
            })
          }
        />
        <Button
          label="Editar nombre o grupo muscular"
          icon="edit-3"
          variant="ghost"
          size="sm"
          onPress={() => {
            onClose();
            router.push({ pathname: '/ejercicios/editar', params: { id: exercise.exerciseId } });
          }}
        />
        <Button label="Quitar de la rutina" icon="trash-2" variant="danger" onPress={onRemove} />
      </View>
    </Sheet>
  );
}

function RenameSheet({ visible, name, onClose, onSave }: { visible: boolean; name: string; onClose: () => void; onSave: (name: string) => void }) {
  const [value, setValue] = useState(name);
  return (
    <Sheet visible={visible} onClose={onClose} title="Nombre de la rutina">
      <View style={{ gap: space.lg }}>
        <Field label="Nombre" value={value} onChangeText={setValue} />
        <Button label="Guardar" onPress={() => onSave(value)} disabled={!value.trim()} />
      </View>
    </Sheet>
  );
}

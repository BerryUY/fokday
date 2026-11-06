import { router } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useState } from 'react';
import { View } from 'react-native';
import { Field, Sheet, Stepper, confirm } from '@/components/ui/form';
import { EmptyState, ListRow, Loading, Screen } from '@/components/ui/layout';
import { Button, Card, Chip, Divider, IconButton, PressableScale, Row, SectionHeader, T } from '@/components/ui/primitives';
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
import { DAY_LETTER, DAY_LONG, DAY_SHORT, daysLabel, todayKey, weekday, WEEK_ORDER } from '@/lib/dates';
import { parsePositive } from '@/lib/format';
import { useParams } from '@/lib/params';
import { useMutation, useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
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

  const addExercise = () => router.push({ pathname: '/ejercicios', params: { pick: 'routine', target: routine.id } });

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
      right={<IconButton icon="edit-2" label="Cambiar el nombre" onPress={() => setRenaming(true)} />}
      footer={
        data?.active ? (
          <Button label="Continuar entrenamiento" icon="play" size="lg" onPress={() => router.push('/sesion/activa')} />
        ) : (
          <Button label="Empezar" icon="play" size="lg" onPress={start} disabled={shown.length === 0} />
        )
      }
    >
      <Card>
        <T variant="h3">¿Qué días la hacés?</T>
        <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
          {WEEK_ORDER.map((d) => (
            <DayToggle key={d} day={d} selected={routine.weekdays.includes(d)} onPress={() => toggleDay(d)} />
          ))}
        </Row>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <SectionHeader title="Ejercicios" action="Agregar" onAction={addExercise} />
        {routine.exercises.length === 0 ? (
          <Card>
            <EmptyState icon="plus-circle" title="Sumá tu primer ejercicio" message="Elegilos de la lista y después ajustás series y repeticiones." action={<Button label="Agregar ejercicio" icon="plus" onPress={addExercise} />} />
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            {splitByDay ? (
              <Row style={{ flexWrap: 'wrap' }} gap={6}>
                <Chip label="Todos" compact selected={shownDay === 'all'} onPress={() => setView('all')} />
                {WEEK_ORDER.map((d) => (
                  <Chip key={d} label={DAY_SHORT[d]} compact selected={shownDay === d} onPress={() => setView(d)} />
                ))}
              </Row>
            ) : null}
            {shownDay !== 'all' && shown.length === 0 ? <T variant="label" tone="muted">Ese día no tiene ejercicios.</T> : null}
            {data?.active ? <T variant="caption" tone="dim">Los cambios valen desde el próximo entrenamiento.</T> : null}
            {shown.length ? (
              <Card padded={false} style={{ paddingVertical: space.xs }}>
                {shown.map((ex, i) => (
                  <View key={ex.id}>
                    {i > 0 ? <Divider style={{ marginLeft: space.lg }} /> : null}
                    <ListRow
                      title={ex.name}
                      subtitle={`${ex.sets} × ${formatReps(ex.repsMin, ex.repsMax)}${ex.restSeconds ? ` · descanso ${ex.restSeconds} s` : ''}${ex.days.length ? ` · ${daysLabel(ex.days)}` : ''}`}
                      onPress={() => setEditing(ex)}
                    />
                  </View>
                ))}
              </Card>
            ) : null}
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
          onMove={(direction) => run((db) => moveRoutineExercise(db, routine.id, editing.id, direction))}
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

function DayToggle({ day, selected, onPress }: { day: number; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={DAY_LONG[day]}
      onPress={onPress}
      hapticFeedback
      scaleTo={0.9}
      style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? c.accent : c.surfaceAlt }}
    >
      <T variant="label" color={selected ? c.accentText : c.textMuted}>{DAY_LETTER[day]}</T>
    </PressableScale>
  );
}

function TargetsSheet({ exercise, onClose, onSave, onRemove, onMove }: {
  exercise: RoutineExercise;
  onClose: () => void;
  onSave: (input: { sets: number; repsMin: number | null; repsMax: number | null; restSeconds: number | null; notes: string | null; days: number[] }) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [sets, setSets] = useState(exercise.sets);
  const [min, setMin] = useState(exercise.repsMin ? String(exercise.repsMin) : '');
  const [max, setMax] = useState(exercise.repsMax ? String(exercise.repsMax) : '');
  const [rest, setRest] = useState(exercise.restSeconds ?? 90);
  const [hasRest, setHasRest] = useState(exercise.restSeconds !== null);
  const [days, setDays] = useState<number[]>(exercise.days);
  const [someDays, setSomeDays] = useState(exercise.days.length > 0);
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
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="bodyMedium">Solo algunos días</T>
            <Chip label={someDays ? 'Sí' : 'No'} compact selected={someDays} onPress={() => { setSomeDays(!someDays); if (someDays) setDays([]); }} />
          </Row>
          {someDays ? (
            <Row style={{ flexWrap: 'wrap', marginTop: 4 }} gap={6}>
              {WEEK_ORDER.map((d) => (
                <Chip key={d} label={DAY_SHORT[d]} compact selected={days.includes(d)} onPress={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])} />
              ))}
            </Row>
          ) : null}
        </View>
        <Row gap={space.sm}>
          <Button label="Subir" icon="chevron-up" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => onMove(-1)} />
          <Button label="Bajar" icon="chevron-down" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => onMove(1)} />
        </Row>
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

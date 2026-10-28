import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Sheet, confirm } from '@/components/ui/form';
import { Badge, Button, Card, IconButton, Row, T } from '@/components/ui/primitives';
import { SetHeader, SetRow } from '@/components/workout';
import { formatReps } from '@/data/routines';
import {
  addSet,
  deleteSet,
  removeSessionExercise,
  setExerciseSkipped,
  updateSet,
  type PreviousPerformance,
  type WorkoutExercise,
} from '@/data/workouts';
import { formatShort } from '@/lib/dates';
import { formatDecimal } from '@/lib/format';
import { useMutation } from '@/state/db';
import { space } from '@/theme/tokens';

/** An exercise inside a session (live or past): sets table, extra sets, skip, remove. */
export function SessionExerciseCard({ exercise, previous, onSetCompleted }: {
  exercise: WorkoutExercise;
  previous?: PreviousPerformance | null;
  onSetCompleted?: (restSeconds: number | null) => void;
}) {
  const run = useMutation();
  const [menu, setMenu] = useState(false);
  const skipped = exercise.status === 'skipped';
  const doneSets = exercise.sets.filter((s) => s.isCompleted).length;

  return (
    <Card style={{ paddingHorizontal: space.md, opacity: skipped ? 0.6 : 1 }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }} align="flex-start">
        <View style={{ flex: 1 }}>
          <T variant="h3">{exercise.name}</T>
          <Row gap={8} style={{ marginTop: 2 }}>
            {exercise.targetSets ? <T variant="caption" tone="accent">{exercise.targetSets} × {formatReps(exercise.repsMin, exercise.repsMax)}</T> : null}
            {exercise.muscleGroup ? <T variant="caption" tone="dim">{exercise.muscleGroup}</T> : null}
            {exercise.restSeconds ? <T variant="caption" tone="dim">· {exercise.restSeconds} s</T> : null}
          </Row>
        </View>
        <Row gap={6}>
          {skipped ? <Badge label="Salteado" tone="muted" /> : exercise.status === 'done' ? <Badge label="Hecho" /> : <Badge label={`${doneSets}/${exercise.sets.length}`} tone="muted" />}
          <IconButton icon="more-horizontal" label="Opciones del ejercicio" size={32} onPress={() => setMenu(true)} />
        </Row>
      </Row>
      {previous ? (
        <T variant="caption" tone="dim" style={{ paddingHorizontal: 4, marginTop: 6 }}>
          Anterior ({formatShort(previous.date)}): {previous.sets.map((s) => `${s.weight !== null ? formatDecimal(s.weight, 2) : '—'}×${s.reps ?? '—'}`).join(' · ')}
        </T>
      ) : null}

      {!skipped ? (
        <View style={{ marginTop: space.md }}>
          <SetHeader />
          {exercise.sets.map((set, i) => (
            <SetRow
              key={set.id}
              set={set}
              index={i}
              previous={previous?.sets[i]}
              onCommit={(patch) => run((db) => updateSet(db, set.id, patch), { silent: false })}
              onToggle={async (patch) => {
                await run((db) => updateSet(db, set.id, patch));
                if (patch.isCompleted) onSetCompleted?.(exercise.restSeconds);
              }}
              onDelete={async () => {
                const ok = await confirm('Borrar serie', `¿Borrar la serie ${i + 1}?`, 'Borrar', true);
                if (ok) run((db) => deleteSet(db, set.id));
              }}
            />
          ))}
          <Button label="Agregar serie" icon="plus" variant="ghost" size="sm" onPress={() => run((db) => addSet(db, exercise.id))} />
        </View>
      ) : null}

      <Sheet visible={menu} onClose={() => setMenu(false)} title={exercise.name}>
        <View style={{ gap: space.md }}>
          <Button
            label={skipped ? 'Retomar ejercicio' : 'Saltear ejercicio'}
            icon={skipped ? 'rotate-ccw' : 'skip-forward'}
            variant="secondary"
            onPress={async () => {
              await run((db) => setExerciseSkipped(db, exercise.id, !skipped));
              setMenu(false);
            }}
          />
          {exercise.exerciseId ? (
            <Button
              label="Ver progresión"
              icon="trending-up"
              variant="secondary"
              onPress={() => {
                setMenu(false);
                router.push({ pathname: '/ejercicio-progreso/[id]', params: { id: exercise.exerciseId! } });
              }}
            />
          ) : null}
          <Button
            label="Quitar de esta sesión"
            icon="trash-2"
            variant="danger"
            onPress={async () => {
              const ok = await confirm('Quitar ejercicio', 'Se borran sus series de esta sesión.', 'Quitar', true);
              if (!ok) return;
              await run((db) => removeSessionExercise(db, exercise.id));
              setMenu(false);
            }}
          />
        </View>
      </Sheet>
    </Card>
  );
}

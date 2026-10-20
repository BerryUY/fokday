import type { Db } from '@/db/types';
import { nowIso } from '@/lib/dates';
import { newId } from '@/lib/ids';

export const MUSCLE_GROUPS = [
  'Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Antebrazos',
  'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Pantorrillas', 'Core', 'Cuerpo completo', 'Cardio', 'Otro',
] as const;

/**
 * Name suggestions shown when creating an exercise. They are only typing shortcuts:
 * nothing is stored until the user saves an exercise.
 */
export const EXERCISE_SUGGESTIONS: { name: string; group: (typeof MUSCLE_GROUPS)[number] }[] = [
  { name: 'Press de banca', group: 'Pecho' },
  { name: 'Press inclinado con mancuernas', group: 'Pecho' },
  { name: 'Aperturas con mancuernas', group: 'Pecho' },
  { name: 'Fondos', group: 'Tríceps' },
  { name: 'Dominadas', group: 'Espalda' },
  { name: 'Jalón al pecho', group: 'Espalda' },
  { name: 'Remo con barra', group: 'Espalda' },
  { name: 'Remo con mancuerna', group: 'Espalda' },
  { name: 'Press militar', group: 'Hombros' },
  { name: 'Elevaciones laterales', group: 'Hombros' },
  { name: 'Curl con barra', group: 'Bíceps' },
  { name: 'Curl martillo', group: 'Bíceps' },
  { name: 'Extensión de tríceps en polea', group: 'Tríceps' },
  { name: 'Sentadilla', group: 'Cuádriceps' },
  { name: 'Prensa', group: 'Cuádriceps' },
  { name: 'Extensión de cuádriceps', group: 'Cuádriceps' },
  { name: 'Peso muerto rumano', group: 'Isquiotibiales' },
  { name: 'Curl femoral', group: 'Isquiotibiales' },
  { name: 'Hip thrust', group: 'Glúteos' },
  { name: 'Elevación de talones', group: 'Pantorrillas' },
  { name: 'Plancha', group: 'Core' },
];

// ---------- Exercises ----------

export type Exercise = { id: string; name: string; muscleGroup: string; notes: string | null };

export async function listExercises(db: Db): Promise<Exercise[]> {
  return db.getAllAsync<Exercise>(
    'SELECT id, name, muscle_group AS muscleGroup, notes FROM exercises WHERE is_archived = 0 ORDER BY muscle_group, name',
    [],
  );
}

export async function getExercise(db: Db, id: string): Promise<Exercise | null> {
  return db.getFirstAsync<Exercise>('SELECT id, name, muscle_group AS muscleGroup, notes FROM exercises WHERE id = ?', [id]);
}

export async function saveExercise(db: Db, input: { name: string; muscleGroup: string; notes?: string | null }, id?: string): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error('El ejercicio necesita un nombre.');
  const dup = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM exercises WHERE lower(name) = lower(?) AND is_archived = 0 AND id IS NOT ?',
    [name, id ?? null],
  );
  if (dup) throw new Error('Ya tenés un ejercicio con ese nombre.');
  const now = nowIso();
  if (id) {
    await db.runAsync('UPDATE exercises SET name = ?, muscle_group = ?, notes = ?, updated_at = ? WHERE id = ?', [
      name, input.muscleGroup, input.notes?.trim() || null, now, id,
    ]);
    return id;
  }
  const newExerciseId = newId();
  await db.runAsync(
    'INSERT INTO exercises (id, name, muscle_group, notes, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    [newExerciseId, name, input.muscleGroup, input.notes?.trim() || null, now, now],
  );
  return newExerciseId;
}

/** Exercises with workout history are archived (history keeps its copy of the name); unused ones are deleted. */
export async function deleteExercise(db: Db, id: string): Promise<void> {
  const used = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM workout_exercises WHERE exercise_id = ?', [id]);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM routine_exercises WHERE exercise_id = ?', [id]);
    if (used?.n) await db.runAsync('UPDATE exercises SET is_archived = 1, updated_at = ? WHERE id = ?', [nowIso(), id]);
    else await db.runAsync('DELETE FROM exercises WHERE id = ?', [id]);
  });
}

// ---------- Routines ----------

export type RoutineSummary = { id: string; name: string; notes: string | null; exerciseCount: number; totalSets: number; weekdays: number[] };

export type RoutineExercise = {
  id: string;
  exerciseId: string;
  name: string;
  muscleGroup: string;
  position: number;
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  restSeconds: number | null;
  notes: string | null;
};

export type Routine = RoutineSummary & { exercises: RoutineExercise[] };

export async function listRoutines(db: Db): Promise<RoutineSummary[]> {
  const rows = await db.getAllAsync<Omit<RoutineSummary, 'weekdays'>>(
    `SELECT r.id, r.name, r.notes, count(re.id) AS exerciseCount, coalesce(sum(re.sets), 0) AS totalSets
     FROM workout_routines r LEFT JOIN routine_exercises re ON re.routine_id = r.id
     GROUP BY r.id ORDER BY r.sort_order, r.created_at`,
    [],
  );
  const schedule = await db.getAllAsync<{ weekday: number; routineId: string }>('SELECT weekday, routine_id AS routineId FROM routine_schedule', []);
  return rows.map((r) => ({ ...r, weekdays: schedule.filter((s) => s.routineId === r.id).map((s) => s.weekday).sort() }));
}

export async function getRoutine(db: Db, id: string): Promise<Routine | null> {
  const summary = (await listRoutines(db)).find((r) => r.id === id);
  if (!summary) return null;
  const exercises = await db.getAllAsync<RoutineExercise>(
    `SELECT re.id, re.exercise_id AS exerciseId, e.name, e.muscle_group AS muscleGroup, re.position, re.sets,
       re.reps_min AS repsMin, re.reps_max AS repsMax, re.rest_seconds AS restSeconds, re.notes
     FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
     WHERE re.routine_id = ? ORDER BY re.position`,
    [id],
  );
  return { ...summary, exercises };
}

export async function getRoutineForWeekday(db: Db, weekday: number): Promise<RoutineSummary | null> {
  const row = await db.getFirstAsync<{ routineId: string }>('SELECT routine_id AS routineId FROM routine_schedule WHERE weekday = ?', [weekday]);
  if (!row) return null;
  return (await listRoutines(db)).find((r) => r.id === row.routineId) ?? null;
}

export async function saveRoutine(db: Db, input: { name: string; notes?: string | null }, id?: string): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error('La rutina necesita un nombre.');
  const now = nowIso();
  if (id) {
    await db.runAsync('UPDATE workout_routines SET name = ?, notes = ?, updated_at = ? WHERE id = ?', [name, input.notes?.trim() || null, now, id]);
    return id;
  }
  const routineId = newId();
  const order = await db.getFirstAsync<{ n: number }>('SELECT coalesce(max(sort_order), 0) + 1 AS n FROM workout_routines', []);
  await db.runAsync(
    'INSERT INTO workout_routines (id, name, notes, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [routineId, name, input.notes?.trim() || null, order?.n ?? 0, now, now],
  );
  return routineId;
}

/** Past sessions keep their copied routine name; only the template disappears. */
export async function deleteRoutine(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM workout_routines WHERE id = ?', [id]);
}

/** Assigns the routine to exactly these weekdays. A weekday holds one routine, so it is taken from any other routine. */
export async function setRoutineWeekdays(db: Db, routineId: string, weekdays: number[]): Promise<void> {
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM routine_schedule WHERE routine_id = ?', [routineId]);
    for (const wd of new Set(weekdays)) {
      await db.runAsync(
        `INSERT INTO routine_schedule (weekday, routine_id, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (weekday) DO UPDATE SET routine_id = excluded.routine_id, updated_at = excluded.updated_at`,
        [wd, routineId, now],
      );
    }
  });
}

export type RoutineExerciseInput = {
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  restSeconds: number | null;
  notes: string | null;
};

function validateTargets(input: RoutineExerciseInput) {
  if (!(input.sets >= 1 && input.sets <= 20)) throw new Error('Las series tienen que estar entre 1 y 20.');
  if (input.repsMin !== null && input.repsMax !== null && input.repsMax < input.repsMin) {
    throw new Error('El máximo de repeticiones no puede ser menor al mínimo.');
  }
}

export async function addRoutineExercise(db: Db, routineId: string, exerciseId: string, input: RoutineExerciseInput): Promise<string> {
  validateTargets(input);
  const now = nowIso();
  const id = newId();
  const pos = await db.getFirstAsync<{ n: number }>('SELECT coalesce(max(position), -1) + 1 AS n FROM routine_exercises WHERE routine_id = ?', [routineId]);
  await db.runAsync(
    `INSERT INTO routine_exercises (id, routine_id, exercise_id, position, sets, reps_min, reps_max, rest_seconds, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, routineId, exerciseId, pos?.n ?? 0, input.sets, input.repsMin, input.repsMax, input.restSeconds, input.notes?.trim() || null, now, now],
  );
  return id;
}

export async function updateRoutineExercise(db: Db, id: string, input: RoutineExerciseInput): Promise<void> {
  validateTargets(input);
  await db.runAsync(
    'UPDATE routine_exercises SET sets = ?, reps_min = ?, reps_max = ?, rest_seconds = ?, notes = ?, updated_at = ? WHERE id = ?',
    [input.sets, input.repsMin, input.repsMax, input.restSeconds, input.notes?.trim() || null, nowIso(), id],
  );
}

export async function removeRoutineExercise(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM routine_exercises WHERE id = ?', [id]);
}

/** Moves an exercise one slot up (-1) or down (+1) and renumbers positions densely. */
export async function moveRoutineExercise(db: Db, routineId: string, id: string, direction: -1 | 1): Promise<void> {
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM routine_exercises WHERE routine_id = ? ORDER BY position', [routineId]);
  const index = rows.findIndex((r) => r.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= rows.length) return;
  [rows[index], rows[target]] = [rows[target], rows[index]];
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    for (const [position, row] of rows.entries()) {
      await db.runAsync('UPDATE routine_exercises SET position = ?, updated_at = ? WHERE id = ? AND position IS NOT ?', [position, now, row.id, position]);
    }
  });
}

export function formatReps(min: number | null, max: number | null): string {
  if (min && max && min !== max) return `${min}–${max}`;
  if (min || max) return String(min ?? max);
  return '—';
}

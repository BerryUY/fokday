import type { Db } from '@/db/types';
import { nowIso, weekday, type DateKey } from '@/lib/dates';
import { newId } from '@/lib/ids';
import { markAttendance } from './attendance';
import { exercisesForWeekday, getExercise, getRoutine } from './routines';

export type SessionStatus = 'in_progress' | 'completed';
export type ExerciseStatus = 'pending' | 'done' | 'skipped';

export type WorkoutSet = {
  id: string;
  position: number;
  reps: number | null;
  weight: number | null;
  isCompleted: boolean;
  completedAt: string | null;
};

export type WorkoutExercise = {
  id: string;
  exerciseId: string | null;
  name: string;
  muscleGroup: string | null;
  position: number;
  targetSets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  restSeconds: number | null;
  status: ExerciseStatus;
  notes: string | null;
  sets: WorkoutSet[];
};

export type WorkoutSession = {
  id: string;
  routineId: string | null;
  routineName: string | null;
  date: DateKey;
  status: SessionStatus;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number | null;
  notes: string | null;
};

export type SessionDetail = WorkoutSession & { exercises: WorkoutExercise[] };

const SESSION_COLUMNS = `id, routine_id AS routineId, routine_name AS routineName, session_date AS date, status,
  started_at AS startedAt, finished_at AS finishedAt, duration_seconds AS durationSeconds, notes`;

export async function getActiveSession(db: Db): Promise<WorkoutSession | null> {
  return db.getFirstAsync<WorkoutSession>(
    `SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE status = 'in_progress' ORDER BY started_at DESC LIMIT 1`,
    [],
  );
}

export async function getSession(db: Db, id: string): Promise<SessionDetail | null> {
  const session = await db.getFirstAsync<WorkoutSession>(`SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE id = ?`, [id]);
  if (!session) return null;
  const exercises = await db.getAllAsync<Omit<WorkoutExercise, 'sets'>>(
    `SELECT id, exercise_id AS exerciseId, exercise_name AS name, muscle_group AS muscleGroup, position, target_sets AS targetSets,
       reps_min AS repsMin, reps_max AS repsMax, rest_seconds AS restSeconds, status, notes
     FROM workout_exercises WHERE session_id = ? ORDER BY position`,
    [id],
  );
  const sets = await db.getAllAsync<Omit<WorkoutSet, 'isCompleted'> & { exId: string; isCompleted: number }>(
    `SELECT s.id, s.workout_exercise_id AS exId, s.position, s.reps, s.weight_kg AS weight, s.is_completed AS isCompleted, s.completed_at AS completedAt
     FROM workout_sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
     WHERE we.session_id = ? ORDER BY s.position`,
    [id],
  );
  return {
    ...session,
    exercises: exercises.map((e) => ({
      ...e,
      sets: sets.filter((s) => s.exId === e.id).map(({ exId: _exId, ...s }) => ({ ...s, isCompleted: !!s.isCompleted })),
    })),
  };
}

async function insertSet(db: Db, workoutExerciseId: string, position: number, reps: number | null, weight: number | null) {
  const now = nowIso();
  const id = newId();
  await db.runAsync(
    `INSERT INTO workout_sets (id, workout_exercise_id, position, reps, weight_kg, is_completed, completed_at, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)`,
    [id, workoutExerciseId, position, reps, weight, now, now],
  );
  return id;
}

async function insertWorkoutExercise(
  db: Db,
  sessionId: string,
  position: number,
  ex: { exerciseId: string; name: string; muscleGroup: string; sets: number; repsMin: number | null; repsMax: number | null; restSeconds: number | null; notes: string | null },
) {
  const now = nowIso();
  const id = newId();
  await db.runAsync(
    `INSERT INTO workout_exercises (id, session_id, exercise_id, exercise_name, muscle_group, position, target_sets, reps_min, reps_max,
       rest_seconds, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [id, sessionId, ex.exerciseId, ex.name, ex.muscleGroup, position, ex.sets, ex.repsMin, ex.repsMax, ex.restSeconds, ex.notes, now, now],
  );
  // Pre-fill each planned set from the last time this exercise was done, so logging is mostly tapping ✓.
  const previous = await getPreviousPerformance(db, ex.exerciseId, sessionId);
  for (let i = 0; i < ex.sets; i++) {
    const prev = previous?.sets[i] ?? previous?.sets[previous.sets.length - 1];
    await insertSet(db, id, i, prev?.reps ?? ex.repsMax ?? ex.repsMin ?? null, prev?.weight ?? null);
  }
  return id;
}

/**
 * Starts a session from a routine (or empty). Only one session can be in progress.
 * Only the exercises that apply on `onWeekday` (default: the weekday of `date`; null = all) are added.
 */
export function startSession(db: Db, date: DateKey, routineId: string | null, onWeekday: number | null = weekday(date)): Promise<string> {
  // A double tap must not open two workouts: both calls would see that none is running yet.
  starting ??= createSession(db, date, routineId, onWeekday).finally(() => {
    starting = null;
  });
  return starting;
}

let starting: Promise<string> | null = null;

async function createSession(db: Db, date: DateKey, routineId: string | null, onWeekday: number | null): Promise<string> {
  const active = await getActiveSession(db);
  if (active) return active.id;
  const routine = routineId ? await getRoutine(db, routineId) : null;
  const id = newId();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO workout_sessions (id, routine_id, routine_name, session_date, status, started_at, finished_at, duration_seconds, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'in_progress', ?, NULL, NULL, NULL, ?, ?)`,
      [id, routine?.id ?? null, routine?.name ?? null, date, now, now, now],
    );
    for (const [i, ex] of exercisesForWeekday(routine?.exercises ?? [], onWeekday).entries()) {
      await insertWorkoutExercise(db, id, i, ex);
    }
  });
  return id;
}

export async function addExerciseToSession(db: Db, sessionId: string, exerciseId: string, sets = 3): Promise<void> {
  const ex = await getExercise(db, exerciseId);
  if (!ex) throw new Error('Ese ejercicio ya no existe.');
  const pos = await db.getFirstAsync<{ n: number }>('SELECT coalesce(max(position), -1) + 1 AS n FROM workout_exercises WHERE session_id = ?', [sessionId]);
  await db.withTransactionAsync(async () => {
    await insertWorkoutExercise(db, sessionId, pos?.n ?? 0, {
      exerciseId: ex.id, name: ex.name, muscleGroup: ex.muscleGroup, sets, repsMin: null, repsMax: null, restSeconds: null, notes: null,
    });
    await touchSession(db, sessionId);
  });
}

async function touchSession(db: Db, sessionId: string) {
  await db.runAsync('UPDATE workout_sessions SET updated_at = ? WHERE id = ?', [nowIso(), sessionId]);
}

/** Adds a set copying the last set's reps and weight. */
export async function addSet(db: Db, workoutExerciseId: string): Promise<void> {
  const last = await db.getFirstAsync<{ position: number; reps: number | null; weight: number | null }>(
    'SELECT position, reps, weight_kg AS weight FROM workout_sets WHERE workout_exercise_id = ? ORDER BY position DESC LIMIT 1',
    [workoutExerciseId],
  );
  await insertSet(db, workoutExerciseId, (last?.position ?? -1) + 1, last?.reps ?? null, last?.weight ?? null);
  await db.runAsync(`UPDATE workout_exercises SET status = CASE WHEN status = 'skipped' THEN 'pending' ELSE status END, updated_at = ? WHERE id = ?`, [
    nowIso(), workoutExerciseId,
  ]);
}

export async function updateSet(db: Db, setId: string, patch: { reps?: number | null; weight?: number | null; isCompleted?: boolean }): Promise<void> {
  if (patch.reps !== undefined && patch.reps !== null && !(patch.reps >= 0 && patch.reps <= 1000)) throw new Error('Repeticiones inválidas.');
  if (patch.weight !== undefined && patch.weight !== null && !(patch.weight >= 0 && patch.weight <= 1000)) throw new Error('Peso inválido.');
  const now = nowIso();
  // Read inside the transaction: a quick kg-then-tick sequence sees the kg just saved
  // instead of writing the old value back over it.
  await db.withTransactionAsync(async () => {
    const current = await db.getFirstAsync<{ reps: number | null; weight: number | null; isCompleted: number; weId: string }>(
      'SELECT reps, weight_kg AS weight, is_completed AS isCompleted, workout_exercise_id AS weId FROM workout_sets WHERE id = ?',
      [setId],
    );
    if (!current) return;
    const completed = patch.isCompleted ?? !!current.isCompleted;
    await db.runAsync(
      'UPDATE workout_sets SET reps = ?, weight_kg = ?, is_completed = ?, completed_at = ?, updated_at = ? WHERE id = ?',
      [
        patch.reps !== undefined ? patch.reps : current.reps,
        patch.weight !== undefined ? patch.weight : current.weight,
        completed ? 1 : 0,
        completed ? now : null,
        now,
        setId,
      ],
    );
    await refreshExerciseStatus(db, current.weId);
  });
}

/**
 * Ticks a set with what was actually lifted. If the weight or reps changed, the sets still to come
 * in this exercise take the same values, so going up in weight is one change and not three.
 */
export async function completeSet(db: Db, setId: string, values: { reps: number | null; weight: number | null }): Promise<void> {
  const before = await db.getFirstAsync<{ reps: number | null; weight: number | null; weId: string; position: number }>(
    'SELECT reps, weight_kg AS weight, workout_exercise_id AS weId, position FROM workout_sets WHERE id = ?',
    [setId],
  );
  if (!before) return;
  await updateSet(db, setId, { ...values, isCompleted: true });
  if (values.reps === before.reps && values.weight === before.weight) return;
  await db.runAsync(
    'UPDATE workout_sets SET reps = ?, weight_kg = ?, updated_at = ? WHERE workout_exercise_id = ? AND position > ? AND is_completed = 0',
    [values.reps, values.weight, nowIso(), before.weId, before.position],
  );
}

async function refreshExerciseStatus(db: Db, workoutExerciseId: string) {
  const row = await db.getFirstAsync<{ total: number; done: number; status: ExerciseStatus }>(
    `SELECT count(s.id) AS total, coalesce(sum(s.is_completed), 0) AS done, we.status
     FROM workout_exercises we LEFT JOIN workout_sets s ON s.workout_exercise_id = we.id WHERE we.id = ? GROUP BY we.id`,
    [workoutExerciseId],
  );
  if (!row) return;
  const next: ExerciseStatus = row.total > 0 && row.done === row.total ? 'done' : row.status === 'skipped' ? 'skipped' : 'pending';
  if (next !== row.status) {
    await db.runAsync('UPDATE workout_exercises SET status = ?, updated_at = ? WHERE id = ?', [next, nowIso(), workoutExerciseId]);
  }
}

export async function deleteSet(db: Db, setId: string): Promise<void> {
  const row = await db.getFirstAsync<{ weId: string }>('SELECT workout_exercise_id AS weId FROM workout_sets WHERE id = ?', [setId]);
  await db.runAsync('DELETE FROM workout_sets WHERE id = ?', [setId]);
  if (row) await refreshExerciseStatus(db, row.weId);
}

export async function setExerciseSkipped(db: Db, workoutExerciseId: string, skipped: boolean): Promise<void> {
  await db.runAsync('UPDATE workout_exercises SET status = ?, updated_at = ? WHERE id = ?', [skipped ? 'skipped' : 'pending', nowIso(), workoutExerciseId]);
  if (!skipped) await refreshExerciseStatus(db, workoutExerciseId);
}

export async function removeSessionExercise(db: Db, workoutExerciseId: string): Promise<void> {
  await db.runAsync('DELETE FROM workout_exercises WHERE id = ?', [workoutExerciseId]);
}

export async function updateExerciseNotes(db: Db, workoutExerciseId: string, notes: string): Promise<void> {
  await db.runAsync('UPDATE workout_exercises SET notes = ?, updated_at = ? WHERE id = ?', [notes.trim() || null, nowIso(), workoutExerciseId]);
}

export async function updateSessionNotes(db: Db, sessionId: string, notes: string): Promise<void> {
  await db.runAsync('UPDATE workout_sessions SET notes = ?, updated_at = ? WHERE id = ?', [notes.trim() || null, nowIso(), sessionId]);
}

/**
 * Completes the session: drops sets that were never ticked, marks untouched exercises
 * as skipped, stores the duration and registers gym attendance for the session's day.
 */
export async function finishSession(db: Db, sessionId: string, now: Date = new Date()): Promise<void> {
  const session = await db.getFirstAsync<WorkoutSession>(`SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE id = ?`, [sessionId]);
  if (!session) throw new Error('La sesión ya no existe.');
  if (session.status === 'completed') return;
  const completedSets = await db.getFirstAsync<{ n: number }>(
    `SELECT count(*) AS n FROM workout_sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id WHERE we.session_id = ? AND s.is_completed = 1`,
    [sessionId],
  );
  if (!completedSets?.n) throw new Error('Marcá al menos una serie como hecha para terminar el entrenamiento.');
  const finishedAt = now.toISOString();
  const duration = Math.max(0, Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 1000));
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM workout_sets WHERE is_completed = 0 AND workout_exercise_id IN (SELECT id FROM workout_exercises WHERE session_id = ?)`,
      [sessionId],
    );
    await db.runAsync(
      `UPDATE workout_exercises SET status = CASE
         WHEN EXISTS (SELECT 1 FROM workout_sets s WHERE s.workout_exercise_id = workout_exercises.id) THEN 'done' ELSE 'skipped' END,
       updated_at = ? WHERE session_id = ?`,
      [finishedAt, sessionId],
    );
    await db.runAsync(
      `UPDATE workout_sessions SET status = 'completed', finished_at = ?, duration_seconds = ?, updated_at = ? WHERE id = ?`,
      [finishedAt, duration, finishedAt, sessionId],
    );
    await markAttendance(db, session.date, 'workout', sessionId);
  });
}

/** Cancelling discards an unfinished session entirely. */
export async function cancelSession(db: Db, sessionId: string): Promise<void> {
  await db.runAsync(`DELETE FROM workout_sessions WHERE id = ? AND status = 'in_progress'`, [sessionId]);
}

/** Deletes a past session. Attendance it created goes too, unless another completed session covers that day. */
export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  const session = await db.getFirstAsync<{ date: string }>('SELECT session_date AS date FROM workout_sessions WHERE id = ?', [sessionId]);
  if (!session) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM workout_sessions WHERE id = ?', [sessionId]);
    const other = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM workout_sessions WHERE session_date = ? AND status = 'completed' LIMIT 1`,
      [session.date],
    );
    if (other) {
      await db.runAsync(`UPDATE gym_attendance SET session_id = ?, updated_at = ? WHERE date = ? AND source = 'workout'`, [other.id, nowIso(), session.date]);
    } else {
      await db.runAsync(`DELETE FROM gym_attendance WHERE date = ? AND source = 'workout'`, [session.date]);
    }
  });
}

export async function updateSessionMeta(db: Db, sessionId: string, patch: { date?: DateKey; durationSeconds?: number }): Promise<void> {
  const session = await db.getFirstAsync<WorkoutSession>(`SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE id = ?`, [sessionId]);
  if (!session) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE workout_sessions SET session_date = ?, duration_seconds = ?, updated_at = ? WHERE id = ?', [
      patch.date ?? session.date, patch.durationSeconds ?? session.durationSeconds, nowIso(), sessionId,
    ]);
    if (patch.date && patch.date !== session.date && session.status === 'completed') {
      await markAttendance(db, patch.date, 'workout', sessionId);
      const other = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM workout_sessions WHERE session_date = ? AND status = 'completed' AND id <> ? LIMIT 1`,
        [session.date, sessionId],
      );
      if (!other) await db.runAsync(`DELETE FROM gym_attendance WHERE date = ? AND session_id = ?`, [session.date, sessionId]);
    }
  });
}

export type SessionSummary = WorkoutSession & { exerciseCount: number; setCount: number; volume: number };

export async function listSessions(db: Db, from: DateKey | null, to: DateKey): Promise<SessionSummary[]> {
  return db.getAllAsync<SessionSummary>(
    `SELECT ws.id, ws.routine_id AS routineId, ws.routine_name AS routineName, ws.session_date AS date, ws.status,
       ws.started_at AS startedAt, ws.finished_at AS finishedAt, ws.duration_seconds AS durationSeconds, ws.notes,
       (SELECT count(*) FROM workout_exercises we WHERE we.session_id = ws.id AND we.status = 'done') AS exerciseCount,
       (SELECT count(*) FROM workout_sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id WHERE we.session_id = ws.id AND s.is_completed = 1) AS setCount,
       (SELECT coalesce(sum(coalesce(s.reps, 0) * coalesce(s.weight_kg, 0)), 0) FROM workout_sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
          WHERE we.session_id = ws.id AND s.is_completed = 1) AS volume
     FROM workout_sessions ws
     WHERE ws.status = 'completed' AND ws.session_date <= ? AND (? IS NULL OR ws.session_date >= ?)
     ORDER BY ws.session_date DESC, ws.started_at DESC`,
    [to, from, from],
  );
}

export type PreviousPerformance = { sessionId: string; date: DateKey; sets: { reps: number | null; weight: number | null }[] };

/** Sets from the most recent completed session that included this exercise. */
export async function getPreviousPerformance(db: Db, exerciseId: string, excludeSessionId?: string): Promise<PreviousPerformance | null> {
  const last = await db.getFirstAsync<{ weId: string; sessionId: string; date: string }>(
    `SELECT we.id AS weId, ws.id AS sessionId, ws.session_date AS date
     FROM workout_exercises we JOIN workout_sessions ws ON ws.id = we.session_id
     WHERE we.exercise_id = ? AND ws.status = 'completed' AND ws.id IS NOT ? AND we.status = 'done'
     ORDER BY ws.session_date DESC, ws.started_at DESC LIMIT 1`,
    [exerciseId, excludeSessionId ?? null],
  );
  if (!last) return null;
  const sets = await db.getAllAsync<{ reps: number | null; weight: number | null }>(
    'SELECT reps, weight_kg AS weight FROM workout_sets WHERE workout_exercise_id = ? AND is_completed = 1 ORDER BY position',
    [last.weId],
  );
  return { sessionId: last.sessionId, date: last.date, sets };
}

/** What beat your own best in a session: the heaviest weight ever for that exercise. */
export type SessionRecord = { name: string; weight: number; previous: number };

export async function getSessionRecords(db: Db, sessionId: string): Promise<SessionRecord[]> {
  const rows = await db.getAllAsync<{ name: string; weight: number; previous: number | null }>(
    `SELECT we.exercise_name AS name, max(s.weight_kg) AS weight,
       (SELECT max(s2.weight_kg) FROM workout_sets s2
          JOIN workout_exercises we2 ON we2.id = s2.workout_exercise_id
          JOIN workout_sessions ws2 ON ws2.id = we2.session_id
        WHERE we2.exercise_id = we.exercise_id AND ws2.id <> ? AND ws2.status = 'completed' AND s2.is_completed = 1
          AND ws2.started_at < (SELECT started_at FROM workout_sessions WHERE id = ?)) AS previous
     FROM workout_exercises we JOIN workout_sets s ON s.workout_exercise_id = we.id
     WHERE we.session_id = ? AND s.is_completed = 1 AND s.weight_kg > 0 AND we.exercise_id IS NOT NULL
     GROUP BY we.id ORDER BY we.position`,
    [sessionId, sessionId, sessionId],
  );
  // A first time isn't a record: there has to be something to beat.
  return rows.filter((r): r is SessionRecord => r.previous !== null && r.previous > 0 && r.weight > r.previous);
}

/** Roughly how long a workout takes: about a minute per set plus the rest between sets. */
export function estimateMinutes(sets: number, restSeconds = 90): number {
  return Math.max(5, Math.round((sets * (60 + restSeconds)) / 60 / 5) * 5);
}

export type ExerciseProgressPoint = {
  date: DateKey;
  sessionId: string;
  bestWeight: number;
  bestSetReps: number;
  /** Epley estimate of the one-rep max for the best set. */
  estimated1RM: number;
  volume: number;
  sets: number;
};

export async function getExerciseProgress(db: Db, exerciseId: string, from: DateKey | null = null): Promise<ExerciseProgressPoint[]> {
  const rows = await db.getAllAsync<{ date: string; sessionId: string; reps: number | null; weight: number | null }>(
    `SELECT ws.session_date AS date, ws.id AS sessionId, s.reps, s.weight_kg AS weight
     FROM workout_sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id JOIN workout_sessions ws ON ws.id = we.session_id
     WHERE we.exercise_id = ? AND ws.status = 'completed' AND s.is_completed = 1 AND (? IS NULL OR ws.session_date >= ?)
     ORDER BY ws.session_date, ws.started_at, s.position`,
    [exerciseId, from, from],
  );
  const bySession = new Map<string, ExerciseProgressPoint>();
  for (const r of rows) {
    const reps = r.reps ?? 0;
    const weight = r.weight ?? 0;
    const point = bySession.get(r.sessionId) ?? { date: r.date, sessionId: r.sessionId, bestWeight: 0, bestSetReps: 0, estimated1RM: 0, volume: 0, sets: 0 };
    point.sets += 1;
    point.volume += reps * weight;
    const e1rm = reps > 0 ? weight * (1 + reps / 30) : weight;
    if (weight > point.bestWeight || (weight === point.bestWeight && reps > point.bestSetReps)) {
      point.bestWeight = weight;
      point.bestSetReps = reps;
    }
    point.estimated1RM = Math.max(point.estimated1RM, Math.round(e1rm * 10) / 10);
    bySession.set(r.sessionId, point);
  }
  return [...bySession.values()];
}

/** Exercises that have at least one completed set, for the progress picker. */
export async function listTrainedExercises(db: Db): Promise<{ exerciseId: string; name: string; muscleGroup: string | null; sessions: number }[]> {
  return db.getAllAsync(
    `SELECT we.exercise_id AS exerciseId, max(we.exercise_name) AS name, max(we.muscle_group) AS muscleGroup, count(DISTINCT ws.id) AS sessions
     FROM workout_exercises we JOIN workout_sessions ws ON ws.id = we.session_id
     WHERE ws.status = 'completed' AND we.status = 'done' AND we.exercise_id IS NOT NULL
     GROUP BY we.exercise_id ORDER BY sessions DESC, name`,
    [],
  );
}

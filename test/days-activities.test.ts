import { deleteActivity, getActivity, listActivities, saveActivity } from '@/data/activities';
import { getAttendance, getAttendanceStats } from '@/data/attendance';
import { addRoutineExercise, getRoutine, getRoutineForWeekday, saveExercise, saveRoutine, setRoutineWeekdays, updateRoutineExercise } from '@/data/routines';
import { getSession, startSession } from '@/data/workouts';
import { createSnapshot, restoreSnapshot, validateEnvelope, wrapSnapshot } from '@/backup/snapshot';
import type { Db } from '@/db/types';
import { createTestDb } from './helpers/db';

// 2026-10-19 is a Monday (1), 2026-10-20 a Tuesday (2).
const MONDAY = '2026-10-19';
const TUESDAY = '2026-10-20';
const T = { sets: 3, repsMin: 8, repsMax: 12, restSeconds: null, notes: null };

describe('routine exercises by weekday', () => {
  let db: Db;
  let routineId: string;
  beforeEach(async () => {
    db = await createTestDb();
    routineId = await saveRoutine(db, { name: 'Mi rutina' });
    const squat = await saveExercise(db, { name: 'Sentadilla', muscleGroup: 'Cuádriceps' });
    const bench = await saveExercise(db, { name: 'Press banca', muscleGroup: 'Pecho' });
    const abs = await saveExercise(db, { name: 'Abdominales', muscleGroup: 'Core' });
    await addRoutineExercise(db, routineId, squat, { ...T, days: [1] });
    await addRoutineExercise(db, routineId, bench, { ...T, days: [2] });
    await addRoutineExercise(db, routineId, abs, T);
    await setRoutineWeekdays(db, routineId, [1, 2]);
  });

  it('stores the days of each exercise and treats none as every day', async () => {
    const routine = (await getRoutine(db, routineId))!;
    expect(routine.exercises.map((e) => [e.name, e.days])).toEqual([['Sentadilla', [1]], ['Press banca', [2]], ['Abdominales', []]]);
  });

  it('starts a session with only that day\'s exercises plus the untagged ones', async () => {
    const monday = (await getSession(db, await startSession(db, MONDAY, routineId)))!;
    expect(monday.exercises.map((e) => e.name)).toEqual(['Sentadilla', 'Abdominales']);
    await db.runAsync(`DELETE FROM workout_sessions`, []);
    const tuesday = (await getSession(db, await startSession(db, TUESDAY, routineId)))!;
    expect(tuesday.exercises.map((e) => e.name)).toEqual(['Press banca', 'Abdominales']);
  });

  it('lets the person pick another day than the date\'s weekday', async () => {
    const session = (await getSession(db, await startSession(db, TUESDAY, routineId, 1)))!;
    expect(session.exercises.map((e) => e.name)).toEqual(['Sentadilla', 'Abdominales']);
  });

  it('counts only today\'s exercises in the summary', async () => {
    expect(await getRoutineForWeekday(db, 1)).toMatchObject({ exerciseCount: 2, totalSets: 6 });
    expect(await getRoutineForWeekday(db, 2)).toMatchObject({ exerciseCount: 2 });
  });

  it('edits the days, and selecting all seven days means every day', async () => {
    const [squat] = (await getRoutine(db, routineId))!.exercises;
    await updateRoutineExercise(db, squat.id, { ...T, days: [1, 4] });
    expect((await getRoutine(db, routineId))!.exercises[0].days).toEqual([1, 4]);
    await updateRoutineExercise(db, squat.id, { ...T, days: [0, 1, 2, 3, 4, 5, 6] });
    expect((await getRoutine(db, routineId))!.exercises[0].days).toEqual([]);
  });
});

describe('free activities', () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('saves a walk and counts the day as exercise without creating a gym session', async () => {
    const id = await saveActivity(db, { date: MONDAY, type: 'caminata', minutes: 45, distanceKm: 3.5, notes: 'por la rambla' });
    expect(await getActivity(db, id)).toMatchObject({ type: 'caminata', minutes: 45, distanceKm: 3.5, notes: 'por la rambla' });
    expect(await getAttendance(db, MONDAY)).toMatchObject({ source: 'manual', sessionId: null });
    const sessions = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM workout_sessions', []);
    expect(sessions?.n).toBe(0);
    const stats = await getAttendanceStats(db, MONDAY);
    expect(stats.thisWeek).toBe(1);
  });

  it('rejects empty durations', async () => {
    await expect(saveActivity(db, { date: MONDAY, type: 'bicicleta', minutes: 0 })).rejects.toThrow();
  });

  it('keeps the day counted while another activity remains, and drops it when the last one goes', async () => {
    const a = await saveActivity(db, { date: MONDAY, type: 'caminata', minutes: 30 });
    const b = await saveActivity(db, { date: MONDAY, type: 'bicicleta', minutes: 60 });
    await deleteActivity(db, a);
    expect(await getAttendance(db, MONDAY)).not.toBeNull();
    await deleteActivity(db, b);
    expect(await getAttendance(db, MONDAY)).toBeNull();
    expect(await listActivities(db)).toEqual([]);
  });

  it('does not remove attendance from a real workout when an activity is deleted', async () => {
    const id = await saveActivity(db, { date: MONDAY, type: 'correr', minutes: 20 });
    await db.runAsync(`UPDATE gym_attendance SET source = 'workout' WHERE date = ?`, [MONDAY]);
    await deleteActivity(db, id);
    expect(await getAttendance(db, MONDAY)).not.toBeNull();
  });

  it('is included in backups', async () => {
    await saveActivity(db, { date: MONDAY, type: 'natacion', minutes: 40 });
    const env = await wrapSnapshot(await createSnapshot(db, 'dev'));
    const other = await createTestDb();
    await restoreSnapshot(other, (await validateEnvelope(env)).snapshot);
    expect((await listActivities(other)).map((x) => x.type)).toEqual(['natacion']);
  });
});

import { getAttendanceStats, listAttendance, markAttendance, removeAttendance } from '@/data/attendance';
import { addRoutineExercise, getRoutine, saveExercise, saveRoutine, setRoutineWeekdays, updateRoutineExercise } from '@/data/routines';
import { updateProfile } from '@/data/settings';
import {
  addSet,
  deleteSession,
  finishSession,
  getPreviousPerformance,
  getSession,
  getExerciseProgress,
  startSession,
  updateSet,
  cancelSession,
} from '@/data/workouts';
import { computeAttendanceStats } from '@/domain/attendance';
import { createTestDb } from './helpers/db';

// 2026-03-02 is a Monday.
const MWF = [1, 3, 5];

describe('attendance streaks respect the schedule', () => {
  it('rest days do not break the streak', () => {
    // Mon, Wed, Fri, Mon attended; today is Tuesday.
    const s = computeAttendanceStats(['2026-03-02', '2026-03-04', '2026-03-06', '2026-03-09'], MWF, '2026-03-10');
    expect(s.currentStreak).toBe(4);
    expect(s.longestStreak).toBe(4);
  });

  it('a missed scheduled day breaks it', () => {
    // Wednesday 4th missed.
    const s = computeAttendanceStats(['2026-03-02', '2026-03-06', '2026-03-09'], MWF, '2026-03-10');
    expect(s.currentStreak).toBe(2);
    expect(s.longestStreak).toBe(2);
  });

  it('today never breaks the streak before the day ends', () => {
    // Wednesday 11th is today and scheduled, not attended yet.
    const s = computeAttendanceStats(['2026-03-06', '2026-03-09'], MWF, '2026-03-11');
    expect(s.currentStreak).toBe(2);
  });

  it('an extra session on a rest day adds to the streak', () => {
    const s = computeAttendanceStats(['2026-03-02', '2026-03-03', '2026-03-04'], MWF, '2026-03-05');
    expect(s.currentStreak).toBe(3);
  });

  it('keeps the longest streak after a break', () => {
    const s = computeAttendanceStats(
      ['2026-03-02', '2026-03-04', '2026-03-06', '2026-03-09', /* miss 11 */ '2026-03-13'],
      MWF,
      '2026-03-14',
    );
    expect(s.longestStreak).toBe(4);
    expect(s.currentStreak).toBe(1);
  });

  it('without a schedule, every day without training breaks the streak', () => {
    const s = computeAttendanceStats(['2026-03-02', '2026-03-03', '2026-03-05'], [], '2026-03-05');
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(2);
    expect(s.consistency).toBeNull();
  });

  it('computes consistency over scheduled days and weekly/monthly counts', () => {
    const s = computeAttendanceStats(['2026-03-02', '2026-03-06', '2026-03-09'], MWF, '2026-03-10');
    // Scheduled since first attendance: 2, 4, 6, 9 → 3 of 4.
    expect(s.consistency).toBeCloseTo(0.75);
    expect(s.thisWeek).toBe(1);
    expect(s.thisMonth).toBe(3);
    expect(s.total).toBe(3);
  });

  it('has empty stats with no history', () => {
    expect(computeAttendanceStats([], MWF, '2026-03-10')).toMatchObject({ total: 0, currentStreak: 0, longestStreak: 0, consistency: null });
  });
});

describe('attendance storage', () => {
  it('never counts the same day twice', async () => {
    const db = await createTestDb();
    await markAttendance(db, '2026-03-02');
    await markAttendance(db, '2026-03-02');
    await markAttendance(db, '2026-03-02', 'workout', null);
    const rows = await listAttendance(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('workout');
    await removeAttendance(db, '2026-03-02');
    expect(await listAttendance(db)).toHaveLength(0);
  });

  it('uses settings training days, or the routine schedule when none are set', async () => {
    const db = await createTestDb();
    const r = await saveRoutine(db, { name: 'Push' });
    await setRoutineWeekdays(db, r, [1, 4]);
    expect((await getAttendanceStats(db, '2026-03-10')).scheduledDays).toEqual([1, 4]);
    await updateProfile(db, { trainingDays: [1, 3, 5] });
    expect((await getAttendanceStats(db, '2026-03-10')).scheduledDays).toEqual([1, 3, 5]);
  });
});

describe('workout sessions', () => {
  async function setup() {
    const db = await createTestDb();
    const bench = await saveExercise(db, { name: 'Press de banca', muscleGroup: 'Pecho' });
    const routine = await saveRoutine(db, { name: 'Empuje' });
    const re = await addRoutineExercise(db, routine, bench, { sets: 2, repsMin: 8, repsMax: 12, restSeconds: 120, notes: null });
    return { db, bench, routine, re };
  }

  it('completing a workout registers attendance once and keeps history after routine edits', async () => {
    const { db, bench, routine, re } = await setup();
    const id = await startSession(db, '2026-03-02', routine);
    expect(await startSession(db, '2026-03-02', routine)).toBe(id); // only one in progress

    let s = (await getSession(db, id))!;
    expect(s.exercises[0].sets).toHaveLength(2);
    for (const set of s.exercises[0].sets) await updateSet(db, set.id, { reps: 10, weight: 40, isCompleted: true });
    await addSet(db, s.exercises[0].id); // extra set, never completed → dropped on finish
    await finishSession(db, id, new Date(new Date(s.startedAt).getTime() + 3600_000));

    s = (await getSession(db, id))!;
    expect(s.status).toBe('completed');
    expect(s.durationSeconds).toBe(3600);
    expect(s.exercises[0].sets).toHaveLength(2);
    expect(s.exercises[0].status).toBe('done');
    expect(await listAttendance(db)).toEqual([{ date: '2026-03-02', source: 'workout', sessionId: id }]);

    await updateRoutineExercise(db, re, { sets: 5, repsMin: 5, repsMax: 5, restSeconds: null, notes: null });
    await saveRoutine(db, { name: 'Empuje pesado' }, routine);
    const again = (await getSession(db, id))!;
    expect(again.routineName).toBe('Empuje');
    expect(again.exercises[0]).toMatchObject({ name: 'Press de banca', targetSets: 2, repsMin: 8 });

    const prev = await getPreviousPerformance(db, bench);
    expect(prev?.sets).toEqual([{ reps: 10, weight: 40 }, { reps: 10, weight: 40 }]);
    expect((await getRoutine(db, routine))!.exercises[0].sets).toBe(5);
  });

  it('pre-fills the next session with previous performance and tracks progression', async () => {
    const { db, bench, routine } = await setup();
    const first = await startSession(db, '2026-03-02', routine);
    for (const set of (await getSession(db, first))!.exercises[0].sets) await updateSet(db, set.id, { reps: 10, weight: 40, isCompleted: true });
    await finishSession(db, first);

    const second = await startSession(db, '2026-03-04', routine);
    const sets = (await getSession(db, second))!.exercises[0].sets;
    expect(sets.map((x) => [x.reps, x.weight])).toEqual([[10, 40], [10, 40]]);
    await updateSet(db, sets[0].id, { weight: 42.5, reps: 8, isCompleted: true });
    await finishSession(db, second);

    const progress = await getExerciseProgress(db, bench);
    expect(progress.map((p) => p.bestWeight)).toEqual([40, 42.5]);
    expect(progress[0].volume).toBe(800);
  });

  it('refuses to finish an empty session and cancels without leaving traces', async () => {
    const { db, routine } = await setup();
    const id = await startSession(db, '2026-03-02', routine);
    await expect(finishSession(db, id)).rejects.toThrow(/al menos una serie/);
    await cancelSession(db, id);
    expect(await getSession(db, id)).toBeNull();
    expect(await listAttendance(db)).toHaveLength(0);
  });

  it('deleting a session removes the attendance it created', async () => {
    const { db, routine } = await setup();
    const id = await startSession(db, '2026-03-02', routine);
    const set = (await getSession(db, id))!.exercises[0].sets[0];
    await updateSet(db, set.id, { isCompleted: true });
    await finishSession(db, id);
    await deleteSession(db, id);
    expect(await listAttendance(db)).toHaveLength(0);
  });
});

import { buildMissions, fokiLine, usualHour, type DayState } from '@/domain/dayPlan';
import { computeStreak, MAX_SHIELDS, NEW_VAULT, settleStreak, type StreakVault } from '@/domain/streak';
import { createFromTemplate, ROUTINE_TEMPLATES, spreadOverDays } from '@/data/routineTemplates';
import { addRoutineExercise, getRoutine, listRoutines, saveExercise, saveRoutine } from '@/data/routines';
import { completeSet, finishSession, getSession, getSessionRecords, startSession } from '@/data/workouts';
import type { Db } from '@/db/types';
import { createTestDb } from './helpers/db';

const streakDays = (n: number, last: string) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${last}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - i);
  return d.toISOString().slice(0, 10);
});

describe('settleStreak', () => {
  it('spends a shield on a missed day and keeps the streak', () => {
    const dates = streakDays(5, '2026-10-27');
    const { vault, event } = settleStreak(dates, NEW_VAULT, '2026-10-29');
    expect(event).toEqual({ kind: 'saved', days: 1, streak: 5 });
    expect(vault.shields).toBe(0);
    expect(computeStreak(dates, '2026-10-29', vault.frozen)).toMatchObject({ current: 5, doneToday: false });
  });

  it('does nothing the second time', () => {
    const dates = streakDays(5, '2026-10-27');
    const first = settleStreak(dates, NEW_VAULT, '2026-10-29');
    const second = settleStreak(dates, first.vault, '2026-10-29');
    expect(second.event).toBeNull();
    expect(second.vault).toEqual(first.vault);
  });

  it('reports a lost streak once when there are not enough shields', () => {
    const dates = streakDays(5, '2026-10-20');
    const first = settleStreak(dates, NEW_VAULT, '2026-10-29');
    expect(first.event).toEqual({ kind: 'lost', streak: 5 });
    expect(first.vault.shields).toBe(1);
    expect(settleStreak(dates, first.vault, '2026-10-29').event).toBeNull();
  });

  it('earns a shield every 7 days, up to the maximum', () => {
    const empty: StreakVault = { ...NEW_VAULT, shields: 0 };
    const seven = settleStreak(streakDays(7, '2026-10-29'), empty, '2026-10-29');
    expect(seven.event).toEqual({ kind: 'earned', streak: 7 });
    expect(seven.vault.shields).toBe(1);
    const full = settleStreak(streakDays(14, '2026-10-29'), { ...NEW_VAULT, shields: MAX_SHIELDS, rewardedAt: 7 }, '2026-10-29');
    expect(full.vault.shields).toBe(MAX_SHIELDS);
    expect(full.event).toBeNull();
  });

  it('has nothing to say to someone without a streak', () => {
    expect(settleStreak([], NEW_VAULT, '2026-10-29').event).toBeNull();
  });
});

const day: DayState = {
  name: 'Sofi', hour: 12, meals: 1, protein: 40, proteinTarget: 120, routineName: 'Piernas', trainingDay: true, trained: false,
  waterMl: 500, waterGoalMl: 2500, tracksWater: true, creatine: false, tracksCreatine: false, streak: 5, streakDoneToday: true,
};

describe('the missions of the day', () => {
  it('follows what the person has turned on', () => {
    expect(buildMissions(day).map((m) => m.key)).toEqual(['meals', 'protein', 'train', 'water']);
    expect(buildMissions({ ...day, trainingDay: false, tracksWater: false }).map((m) => m.key)).toEqual(['meals', 'protein']);
  });

  it('Foki celebrates a perfect day and worries about a streak at night', () => {
    const allDone = { ...day, meals: 3, protein: 120, trained: true, waterMl: 2500 };
    expect(fokiLine(allDone, buildMissions(allDone)).mood).toBe('cheer');
    const risky = { ...day, hour: 21, streakDoneToday: false };
    expect(fokiLine(risky, buildMissions(risky)).mood).toBe('worried');
  });

  it('learns a usual hour only with enough data, and keeps it in range', () => {
    expect(usualHour([8, 9], 13, 11, 15)).toBe(13);
    expect(usualHour([14, 14, 14.5, 15], 13, 11, 15)).toBe(14.5);
    expect(usualHour([20, 20, 20, 20], 13, 11, 15)).toBe(15);
  });
});

describe('workouts', () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  const setup = async () => {
    const exercise = await saveExercise(db, { name: 'Sentadilla', muscleGroup: 'Cuádriceps' });
    const routine = await saveRoutine(db, { name: 'Pierna' });
    await addRoutineExercise(db, routine, exercise, { sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90, notes: null });
    return routine;
  };

  it('a change in weight carries to the sets still to come', async () => {
    const id = await startSession(db, '2026-10-20', await setup(), null);
    const [first, second, third] = (await getSession(db, id))!.exercises[0].sets;
    await completeSet(db, first.id, { weight: 60, reps: 10 });
    const after = (await getSession(db, id))!.exercises[0].sets;
    expect(after[0]).toMatchObject({ weight: 60, reps: 10, isCompleted: true });
    expect(after[1]).toMatchObject({ id: second.id, weight: 60, reps: 10, isCompleted: false });
    expect(after[2]).toMatchObject({ id: third.id, weight: 60, reps: 10, isCompleted: false });
  });

  it('a set already done is not touched by a later change', async () => {
    const id = await startSession(db, '2026-10-20', await setup(), null);
    const [first, second] = (await getSession(db, id))!.exercises[0].sets;
    await completeSet(db, first.id, { weight: 60, reps: 10 });
    await completeSet(db, second.id, { weight: 65, reps: 8 });
    expect((await getSession(db, id))!.exercises[0].sets[0]).toMatchObject({ weight: 60, reps: 10 });
  });

  it('finds the records of a session, but not on a first time', async () => {
    const routine = await setup();
    const first = await startSession(db, '2026-10-20', routine, null);
    await completeSet(db, (await getSession(db, first))!.exercises[0].sets[0].id, { weight: 60, reps: 10 });
    await finishSession(db, first, new Date('2026-10-20T19:00:00Z'));
    expect(await getSessionRecords(db, first)).toEqual([]);

    await new Promise((r) => setTimeout(r, 5));
    const second = await startSession(db, '2026-10-22', routine, null);
    await completeSet(db, (await getSession(db, second))!.exercises[0].sets[0].id, { weight: 70, reps: 8 });
    await finishSession(db, second, new Date('2026-10-22T19:00:00Z'));
    expect(await getSessionRecords(db, second)).toEqual([{ name: 'Sentadilla', weight: 70, previous: 60 }]);
  });

  it('a template creates its routines, reuses exercises and takes turns over the training days', async () => {
    const existing = await saveExercise(db, { name: 'Sentadilla', muscleGroup: 'Cuádriceps' });
    const template = ROUTINE_TEMPLATES.find((t) => t.key === 'upper-lower')!;
    await createFromTemplate(db, template, [1, 2, 4, 5], 90);
    const routines = await listRoutines(db);
    expect(routines.map((r) => [r.name, r.weekdays])).toEqual([['Torso', [1, 4]], ['Pierna', [2, 5]]]);
    const legs = await getRoutine(db, routines[1].id);
    expect(legs!.exercises[0].exerciseId).toBe(existing);
  });

  it('spreads routines starting on Monday, with Sunday last', () => {
    expect(spreadOverDays(2, [0, 1, 3])).toEqual([[1, 0], [3]]);
  });
});

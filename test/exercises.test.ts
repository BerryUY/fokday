import { addRoutineExercise, deleteExercise, getRoutine, listExercises, saveExercise, saveRoutine } from '@/data/routines';
import { addExerciseToSession, finishSession, getSession, startSession, updateSet } from '@/data/workouts';
import type { Db } from '@/db/types';
import { createTestDb } from './helpers/db';

const T = { sets: 3, repsMin: 8, repsMax: 12, restSeconds: null, notes: null };

describe('deleting exercises', () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('deletes an unused exercise and removes it from routines', async () => {
    const id = await saveExercise(db, { name: 'Remo', muscleGroup: 'Espalda' });
    const routine = await saveRoutine(db, { name: 'Espalda' });
    await addRoutineExercise(db, routine, id, T);
    await deleteExercise(db, id);
    expect((await listExercises(db)).map((e) => e.name)).not.toContain('Remo');
    expect((await getRoutine(db, routine))!.exercises).toHaveLength(0);
    expect(await db.getFirstAsync('SELECT id FROM exercises WHERE id = ?', [id])).toBeNull();
  });

  it('hides an exercise with history but keeps the past workouts intact', async () => {
    const id = await saveExercise(db, { name: 'Sentadilla', muscleGroup: 'Cuádriceps' });
    const session = await startSession(db, '2026-10-20', null);
    await addExerciseToSession(db, session, id);
    const set = (await getSession(db, session))!.exercises[0].sets[0];
    await updateSet(db, set.id, { reps: 8, weight: 60, isCompleted: true });
    await finishSession(db, session, new Date('2026-10-20T19:00:00Z'));

    await deleteExercise(db, id);
    expect((await listExercises(db)).map((e) => e.name)).not.toContain('Sentadilla');
    const past = (await getSession(db, session))!;
    expect(past.exercises[0].name).toBe('Sentadilla');
    expect(past.exercises[0].sets[0]).toMatchObject({ reps: 8, weight: 60 });
    // The same name can be created again afterwards.
    await expect(saveExercise(db, { name: 'Sentadilla', muscleGroup: 'Cuádriceps' })).resolves.toBeTruthy();
  });

  it('adds exercises to a finished workout so past days can be completed', async () => {
    const id = await saveExercise(db, { name: 'Press banca', muscleGroup: 'Pecho' });
    const other = await saveExercise(db, { name: 'Fondos', muscleGroup: 'Tríceps' });
    const session = await startSession(db, '2026-10-21', null);
    await addExerciseToSession(db, session, id);
    const first = (await getSession(db, session))!.exercises[0].sets[0];
    await updateSet(db, first.id, { reps: 10, weight: 50, isCompleted: true });
    await finishSession(db, session, new Date('2026-10-21T19:00:00Z'));
    await addExerciseToSession(db, session, other);
    const done = (await getSession(db, session))!;
    expect(done.status).toBe('completed');
    expect(done.exercises.map((e) => e.name)).toEqual(['Press banca', 'Fondos']);
  });
});

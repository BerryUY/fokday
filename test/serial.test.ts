import { getSession, startSession, updateSet } from '@/data/workouts';
import { addRoutineExercise, saveExercise, saveRoutine } from '@/data/routines';
import { prepareDatabase } from '@/db/migrate';
import { serializeTransactions } from '@/db/serial';
import { createRawDb } from './helpers/db';

const pause = () => new Promise((r) => setTimeout(r, 5));

describe('transactions one after another', () => {
  it('two transactions at once fail without it and both commit with it', async () => {
    const work = (db: ReturnType<typeof createRawDb>, n: number) =>
      db.withTransactionAsync(async () => {
        await pause();
        await db.runAsync('INSERT INTO t (n) VALUES (?)', [n]);
      });

    const plain = createRawDb();
    await plain.execAsync('CREATE TABLE t (n INTEGER)');
    await expect(Promise.all([work(plain, 1), work(plain, 2)])).rejects.toThrow();

    const safe = serializeTransactions(createRawDb());
    await safe.execAsync('CREATE TABLE t (n INTEGER)');
    await Promise.all([work(safe, 1), work(safe, 2), work(safe, 3)]);
    expect(await safe.getAllAsync('SELECT n FROM t ORDER BY n', [])).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it('a failed transaction does not block the next one', async () => {
    const db = serializeTransactions(createRawDb());
    await db.execAsync('CREATE TABLE t (n INTEGER)');
    const failing = db.withTransactionAsync(async () => {
      throw new Error('boom');
    });
    await expect(failing).rejects.toThrow('boom');
    await db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO t (n) VALUES (1)', []);
    });
    expect(await db.getAllAsync('SELECT n FROM t', [])).toEqual([{ n: 1 }]);
  });

  it('saving kg, reps and the tick of a set at the same time keeps all three', async () => {
    const db = serializeTransactions(createRawDb());
    await prepareDatabase(db);
    const routine = await saveRoutine(db, { name: 'Piernas' });
    const ex = await saveExercise(db, { name: 'Sentadilla', muscleGroup: 'Cuádriceps' });
    await addRoutineExercise(db, routine, ex, { sets: 1, repsMin: 8, repsMax: 12, restSeconds: 90, notes: null, days: [] });
    const session = await startSession(db, '2026-10-29', routine);
    const setId = (await getSession(db, session))!.exercises[0].sets[0].id;

    await Promise.all([updateSet(db, setId, { weight: 85 }), updateSet(db, setId, { reps: 10 }), updateSet(db, setId, { isCompleted: true })]);

    const set = (await getSession(db, session))!.exercises[0].sets[0];
    expect(set).toMatchObject({ weight: 85, reps: 10, isCompleted: true });
  });
});

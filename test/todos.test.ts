import { addTodo, bringPending, deleteTodo, listTodos, pendingFromYesterday, setTodoDone } from '@/data/todos';
import { createSnapshot, restoreSnapshot, validateEnvelope, wrapSnapshot } from '@/backup/snapshot';
import type { Db } from '@/db/types';
import { createTestDb } from './helpers/db';

describe('daily to-do list', () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('adds, checks, unchecks and deletes items of a day in order', async () => {
    const a = await addTodo(db, '2026-10-28', '  Comprar avena ');
    const b = await addTodo(db, '2026-10-28', 'Llamar al médico');
    await addTodo(db, '2026-10-29', 'Otro día');
    await expect(addTodo(db, '2026-10-28', '   ')).rejects.toThrow();
    await setTodoDone(db, a.id, true);
    expect(await listTodos(db, '2026-10-28')).toEqual([
      expect.objectContaining({ text: 'Comprar avena', done: true, position: 0 }),
      expect.objectContaining({ text: 'Llamar al médico', done: false, position: 1 }),
    ]);
    await setTodoDone(db, a.id, false);
    await deleteTodo(db, b.id);
    expect((await listTodos(db, '2026-10-28')).map((t) => [t.text, t.done])).toEqual([['Comprar avena', false]]);
  });

  it('brings yesterday\'s unfinished items once, without duplicates', async () => {
    const done = await addTodo(db, '2026-10-27', 'Hecho');
    await setTodoDone(db, done.id, true);
    await addTodo(db, '2026-10-27', 'Pendiente');
    expect((await pendingFromYesterday(db, '2026-10-28')).map((t) => t.text)).toEqual(['Pendiente']);
    expect(await bringPending(db, '2026-10-28')).toBe(1);
    expect(await bringPending(db, '2026-10-28')).toBe(0);
    expect((await listTodos(db, '2026-10-28')).map((t) => t.text)).toEqual(['Pendiente']);
    expect((await listTodos(db, '2026-10-27')).map((t) => t.text)).toEqual(['Hecho', 'Pendiente']);
  });

  it('is included in backups and old backups restore without it', async () => {
    await addTodo(db, '2026-10-28', 'Respaldame');
    const other = await createTestDb();
    await restoreSnapshot(other, (await validateEnvelope(await wrapSnapshot(await createSnapshot(db, 'dev')))).snapshot);
    expect((await listTodos(other, '2026-10-28')).map((t) => t.text)).toEqual(['Respaldame']);

    const old = await createSnapshot(db, 'dev');
    old.schemaVersion = 2;
    delete (old.tables as Record<string, unknown>).daily_todos;
    delete (old.counts as Record<string, unknown>).daily_todos;
    const third = await createTestDb();
    await restoreSnapshot(third, (await validateEnvelope(await wrapSnapshot(old))).snapshot);
    expect(await listTodos(third, '2026-10-28')).toEqual([]);
  });
});

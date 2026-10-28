import type { Db } from '@/db/types';
import { addDays, nowIso, type DateKey } from '@/lib/dates';
import { newId } from '@/lib/ids';

/** "Para hoy": one short list per day. Done items stay visible (crossed out) until the day ends. */

export type Todo = { id: string; date: DateKey; text: string; done: boolean; position: number };

const COLUMNS = 'id, date, text, done, position';
const toTodo = (r: Omit<Todo, 'done'> & { done: number }): Todo => ({ ...r, done: !!r.done });

export async function listTodos(db: Db, date: DateKey): Promise<Todo[]> {
  const rows = await db.getAllAsync<Omit<Todo, 'done'> & { done: number }>(`SELECT ${COLUMNS} FROM daily_todos WHERE date = ? ORDER BY position, created_at`, [date]);
  return rows.map(toTodo);
}

export async function addTodo(db: Db, date: DateKey, text: string): Promise<Todo> {
  const clean = text.trim().slice(0, 200);
  if (!clean) throw new Error('Escribí la tarea.');
  const pos = await db.getFirstAsync<{ n: number }>('SELECT coalesce(max(position), -1) + 1 AS n FROM daily_todos WHERE date = ?', [date]);
  const now = nowIso();
  const todo: Todo = { id: newId(), date, text: clean, done: false, position: pos?.n ?? 0 };
  await db.runAsync('INSERT INTO daily_todos (id, date, text, done, position, done_at, created_at, updated_at) VALUES (?, ?, ?, 0, ?, NULL, ?, ?)', [
    todo.id, date, clean, todo.position, now, now,
  ]);
  return todo;
}

export async function setTodoDone(db: Db, id: string, done: boolean): Promise<void> {
  const now = nowIso();
  await db.runAsync('UPDATE daily_todos SET done = ?, done_at = ?, updated_at = ? WHERE id = ?', [done ? 1 : 0, done ? now : null, now, id]);
}

export async function deleteTodo(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM daily_todos WHERE id = ?', [id]);
}

/** Unfinished items from the previous day, for the "Traer pendientes de ayer" shortcut. */
export async function pendingFromYesterday(db: Db, date: DateKey): Promise<Todo[]> {
  const rows = await db.getAllAsync<Omit<Todo, 'done'> & { done: number }>(
    `SELECT ${COLUMNS} FROM daily_todos WHERE date = ? AND done = 0 ORDER BY position`,
    [addDays(date, -1)],
  );
  const today = new Set((await listTodos(db, date)).map((t) => t.text.toLowerCase()));
  return rows.map(toTodo).filter((t) => !today.has(t.text.toLowerCase()));
}

/** Copies yesterday's unfinished items to `date` (they stay in yesterday as they were). */
export async function bringPending(db: Db, date: DateKey): Promise<number> {
  const pending = await pendingFromYesterday(db, date);
  for (const t of pending) await addTodo(db, date, t.text);
  return pending.length;
}

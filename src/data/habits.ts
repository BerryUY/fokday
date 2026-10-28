import type { Db } from '@/db/types';
import { addDays, nowIso, type DateKey } from '@/lib/dates';

export type DailyHabits = { creatine: boolean; waterMl: number };

export const MAX_WATER_ML = 10000;

export async function getHabits(db: Db, date: DateKey): Promise<DailyHabits> {
  const row = await db.getFirstAsync<{ creatine: number; waterMl: number }>(
    'SELECT creatine, water_ml AS waterMl FROM daily_habits WHERE date = ?',
    [date],
  );
  return { creatine: !!row?.creatine, waterMl: row?.waterMl ?? 0 };
}

export async function setCreatine(db: Db, date: DateKey, taken: boolean): Promise<void> {
  await db.runAsync(
    `INSERT INTO daily_habits (date, creatine, water_ml, updated_at) VALUES (?, ?, 0, ?)
     ON CONFLICT (date) DO UPDATE SET creatine = excluded.creatine, updated_at = excluded.updated_at`,
    [date, taken ? 1 : 0, nowIso()],
  );
}

/** Adds (or removes, with a negative number) water for the day, never below zero. Returns the new total. */
export async function addWater(db: Db, date: DateKey, deltaMl: number): Promise<number> {
  const current = (await getHabits(db, date)).waterMl;
  const next = Math.min(MAX_WATER_ML, Math.max(0, Math.round(current + deltaMl)));
  await db.runAsync(
    `INSERT INTO daily_habits (date, creatine, water_ml, updated_at) VALUES (?, 0, ?, ?)
     ON CONFLICT (date) DO UPDATE SET water_ml = excluded.water_ml, updated_at = excluded.updated_at`,
    [date, next, nowIso()],
  );
  return next;
}

/** Consecutive days with creatine up to today (today counts only once it's marked). */
export async function creatineStreak(db: Db, today: DateKey): Promise<number> {
  const rows = await db.getAllAsync<{ date: string }>('SELECT date FROM daily_habits WHERE creatine = 1 AND date <= ? ORDER BY date DESC LIMIT 400', [today]);
  const taken = new Set(rows.map((r) => r.date));
  let day = taken.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (taken.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

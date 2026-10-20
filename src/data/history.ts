import type { Db } from '@/db/types';
import { sumDailyTotals, type DailyTotals } from '@/domain/nutrition';
import { endOfMonth, nowIso, startOfMonth, type DateKey } from '@/lib/dates';
import { getAttendance, type Attendance } from './attendance';
import { getLogsForDate, type MealLog } from './meals';
import { getGoalForDate, type NutritionGoal } from './settings';
import { getWeightForDate, type WeightEntry } from './weight';
import { getSession, type SessionDetail } from './workouts';

export type DayDetail = {
  date: DateKey;
  logs: MealLog[];
  totals: DailyTotals;
  goal: NutritionGoal;
  sessions: SessionDetail[];
  attendance: Attendance | null;
  weight: WeightEntry | null;
  note: string | null;
};

export async function getDayDetail(db: Db, date: DateKey): Promise<DayDetail> {
  const [logs, goal, attendance, weight, note, sessionRows] = await Promise.all([
    getLogsForDate(db, date),
    getGoalForDate(db, date),
    getAttendance(db, date),
    getWeightForDate(db, date),
    getDailyNote(db, date),
    db.getAllAsync<{ id: string }>(`SELECT id FROM workout_sessions WHERE session_date = ? AND status = 'completed' ORDER BY started_at`, [date]),
  ]);
  const sessions = (await Promise.all(sessionRows.map((s) => getSession(db, s.id)))).filter((s): s is SessionDetail => !!s);
  return { date, logs, totals: sumDailyTotals(logs), goal, sessions, attendance, weight, note };
}

export async function getDailyNote(db: Db, date: DateKey): Promise<string | null> {
  const row = await db.getFirstAsync<{ text: string }>('SELECT text FROM daily_notes WHERE date = ?', [date]);
  return row?.text ?? null;
}

export async function saveDailyNote(db: Db, date: DateKey, text: string): Promise<void> {
  const clean = text.trim();
  if (!clean) {
    await db.runAsync('DELETE FROM daily_notes WHERE date = ?', [date]);
    return;
  }
  await db.runAsync(
    `INSERT INTO daily_notes (date, text, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (date) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
    [date, clean, nowIso()],
  );
}

export type DayMarkers = { meals: boolean; gym: boolean; weight: boolean; note: boolean };

/** Which kinds of records exist on each day of the month containing `anyDay`. */
export async function getMonthMarkers(db: Db, anyDay: DateKey): Promise<Record<DateKey, DayMarkers>> {
  const from = startOfMonth(anyDay);
  const to = endOfMonth(anyDay);
  const rows = await db.getAllAsync<{ date: string; kind: keyof DayMarkers }>(
    `SELECT DISTINCT log_date AS date, 'meals' AS kind FROM meal_logs WHERE log_date BETWEEN ? AND ?
     UNION ALL SELECT date, 'gym' FROM gym_attendance WHERE date BETWEEN ? AND ?
     UNION ALL SELECT date, 'weight' FROM weight_entries WHERE date BETWEEN ? AND ?
     UNION ALL SELECT date, 'note' FROM daily_notes WHERE date BETWEEN ? AND ?`,
    [from, to, from, to, from, to, from, to],
  );
  const out: Record<DateKey, DayMarkers> = {};
  for (const r of rows) {
    out[r.date] ??= { meals: false, gym: false, weight: false, note: false };
    out[r.date][r.kind] = true;
  }
  return out;
}

export async function getFirstRecordDate(db: Db): Promise<DateKey | null> {
  const row = await db.getFirstAsync<{ d: string | null }>(
    `SELECT min(d) AS d FROM (
       SELECT min(log_date) AS d FROM meal_logs UNION ALL SELECT min(date) FROM gym_attendance
       UNION ALL SELECT min(date) FROM weight_entries UNION ALL SELECT min(session_date) FROM workout_sessions)`,
    [],
  );
  return row?.d ?? null;
}

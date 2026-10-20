import type { Db } from '@/db/types';
import { computeAttendanceStats, type AttendanceStats } from '@/domain/attendance';
import { nowIso, type DateKey } from '@/lib/dates';
import { getProfile } from './settings';

export type Attendance = { date: DateKey; source: 'manual' | 'workout'; sessionId: string | null };

export async function listAttendance(db: Db, from?: DateKey, to?: DateKey): Promise<Attendance[]> {
  return db.getAllAsync<Attendance>(
    `SELECT date, source, session_id AS sessionId FROM gym_attendance
     WHERE (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?) ORDER BY date`,
    [from ?? null, from ?? null, to ?? null, to ?? null],
  );
}

export async function getAttendance(db: Db, date: DateKey): Promise<Attendance | null> {
  return db.getFirstAsync<Attendance>('SELECT date, source, session_id AS sessionId FROM gym_attendance WHERE date = ?', [date]);
}

/**
 * Idempotent: the date is the primary key, so a day is never counted twice.
 * A completed workout upgrades a manual mark and links the session.
 */
export async function markAttendance(db: Db, date: DateKey, source: Attendance['source'] = 'manual', sessionId: string | null = null): Promise<void> {
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO gym_attendance (date, source, session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (date) DO UPDATE SET source = excluded.source, session_id = excluded.session_id, updated_at = excluded.updated_at
     WHERE excluded.source = 'workout'`,
    [date, source, sessionId, now, now],
  );
}

export async function removeAttendance(db: Db, date: DateKey): Promise<void> {
  await db.runAsync('DELETE FROM gym_attendance WHERE date = ?', [date]);
}

/** Training days from settings; if none are set, the weekdays that have a routine assigned. */
export async function getScheduledDays(db: Db): Promise<number[]> {
  const profile = await getProfile(db);
  if (profile.trainingDays.length > 0) return profile.trainingDays;
  const rows = await db.getAllAsync<{ weekday: number }>('SELECT weekday FROM routine_schedule ORDER BY weekday', []);
  return rows.map((r) => r.weekday);
}

export async function getAttendanceStats(db: Db, today: DateKey, consistencyFrom?: DateKey): Promise<AttendanceStats & { scheduledDays: number[] }> {
  const [all, scheduledDays] = await Promise.all([listAttendance(db), getScheduledDays(db)]);
  return {
    ...computeAttendanceStats(all.map((a) => a.date), scheduledDays, today, consistencyFrom),
    scheduledDays,
  };
}

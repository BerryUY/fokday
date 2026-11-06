import type { Db } from '@/db/types';
import { computeStreak, NEW_VAULT, settleStreak, type Streak, type StreakEvent, type StreakVault } from '@/domain/streak';
import { addDays, type DateKey } from '@/lib/dates';
import { getSetting, setSetting } from './settings';

/** Every day with a meal or with training (a workout or activity; both mark attendance). Weighing in alone doesn't count. */
export async function listActiveDates(db: Db): Promise<DateKey[]> {
  const rows = await db.getAllAsync<{ d: DateKey }>(
    `SELECT log_date AS d FROM meal_logs
     UNION SELECT date AS d FROM gym_attendance`,
    [],
  );
  return rows.map((r) => r.d);
}

/** Kept in settings, not in local bookkeeping, so shields travel with the backup. */
export async function getVault(db: Db): Promise<StreakVault> {
  try {
    const raw = await getSetting(db, 'streak.vault');
    return raw ? { ...NEW_VAULT, ...(JSON.parse(raw) as Partial<StreakVault>) } : NEW_VAULT;
  } catch {
    return NEW_VAULT;
  }
}

export async function getStreak(db: Db, today: DateKey): Promise<Streak & { shields: number }> {
  const [dates, vault] = await Promise.all([listActiveDates(db), getVault(db)]);
  return { ...computeStreak(dates, today, vault.frozen), shields: vault.shields };
}

/** Run when the app opens or data changes. Returns what happened, once, for the app to tell the person. */
export async function settleVault(db: Db, today: DateKey): Promise<StreakEvent | null> {
  const [dates, vault] = await Promise.all([listActiveDates(db), getVault(db)]);
  const { vault: next, event } = settleStreak(dates, vault, today);
  if (JSON.stringify(next) !== JSON.stringify(vault)) await setSetting(db, 'streak.vault', JSON.stringify(next));
  return event;
}

// ---- Perfect days: every mission of the day done ----

export async function listPerfectDays(db: Db): Promise<DateKey[]> {
  try {
    return JSON.parse((await getSetting(db, 'streak.perfect')) ?? '[]') as DateKey[];
  } catch {
    return [];
  }
}

/** True the first time a day becomes perfect. */
export async function markPerfectDay(db: Db, today: DateKey): Promise<boolean> {
  const days = await listPerfectDays(db);
  if (days.includes(today)) return false;
  await setSetting(db, 'streak.perfect', JSON.stringify([...days, today].filter((d) => d >= addDays(today, -400))));
  return true;
}

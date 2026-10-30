import type { Db } from '@/db/types';
import { computeStreak, type Streak } from '@/domain/streak';
import type { DateKey } from '@/lib/dates';

/** Every day with a meal or with training (a workout or activity; both mark attendance). Weighing in alone doesn't count. */
export async function listActiveDates(db: Db): Promise<DateKey[]> {
  const rows = await db.getAllAsync<{ d: DateKey }>(
    `SELECT log_date AS d FROM meal_logs
     UNION SELECT date AS d FROM gym_attendance`,
    [],
  );
  return rows.map((r) => r.d);
}

export async function getStreak(db: Db, today: DateKey): Promise<Streak> {
  return computeStreak(await listActiveDates(db), today);
}

import { getAttendance } from '@/data/attendance';
import { getHabits } from '@/data/habits';
import { getDailyTotals, getLogsForDate } from '@/data/meals';
import { listRoutines } from '@/data/routines';
import { getGoalForDate, getProfile, getSetting, setSetting } from '@/data/settings';
import { getStreak } from '@/data/streak';
import { listTodos } from '@/data/todos';
import { listWeights } from '@/data/weight';
import type { Db } from '@/db/types';
import { usualHour } from '@/domain/dayPlan';
import { latestEntry } from '@/domain/weight';
import { addDays, todayKey } from '@/lib/dates';
import type { ChannelKey } from './channels';
import { DEFAULT_HOURS, planReminders, type Intensity, type PlannedNotification, type ReminderState, type UsualHours } from './plan';

export type NotificationPrefs = { intensity: Intensity; off: ChannelKey[] };

export async function getNotificationPrefs(db: Db): Promise<NotificationPrefs> {
  const [intensity, off] = await Promise.all([getSetting(db, 'notifications.intensity'), getSetting(db, 'notifications.off')]);
  let parsed: ChannelKey[] = [];
  try {
    parsed = JSON.parse(off ?? '[]') as ChannelKey[];
  } catch {
    parsed = [];
  }
  return { intensity: intensity === 'suave' || intensity === 'insistente' ? intensity : 'normal', off: parsed };
}

export async function saveNotificationPrefs(db: Db, prefs: NotificationPrefs): Promise<void> {
  await setSetting(db, 'notifications.intensity', prefs.intensity);
  await setSetting(db, 'notifications.off', JSON.stringify(prefs.off));
}

/** The hours this person really eats, from the last three weeks. Until there's enough data, the usual ones. */
async function learnHours(db: Db, today: string): Promise<UsualHours> {
  const rows = await db.getAllAsync<{ category: string; loggedAt: string }>(
    `SELECT category, logged_at AS loggedAt FROM meal_logs WHERE log_date >= ? AND category IN ('desayuno', 'almuerzo', 'cena')`,
    [addDays(today, -21)],
  );
  const hoursOf = (category: string) =>
    rows.filter((r) => r.category === category).map((r) => {
      const d = new Date(r.loggedAt);
      return d.getHours() + d.getMinutes() / 60;
    });
  return {
    breakfast: usualHour(hoursOf('desayuno'), DEFAULT_HOURS.breakfast, 6, 11),
    lunch: usualHour(hoursOf('almuerzo'), DEFAULT_HOURS.lunch, 11, 15.5),
    dinner: usualHour(hoursOf('cena'), DEFAULT_HOURS.dinner, 18.5, 22),
  };
}

export async function reminderState(db: Db): Promise<ReminderState> {
  const today = todayKey();
  const [profile, attendance, logs, habits, todos, weights, streak, routines, totals, goal, prefs, usualHours] = await Promise.all([
    getProfile(db),
    getAttendance(db, today),
    getLogsForDate(db, today),
    getHabits(db, today),
    listTodos(db, today),
    listWeights(db),
    getStreak(db, today),
    listRoutines(db),
    getDailyTotals(db, today),
    getGoalForDate(db, today),
    getNotificationPrefs(db),
    learnHours(db, today),
  ]);
  const byWeekday: Record<number, string> = {};
  for (const r of routines) for (const d of r.weekdays) byWeekday[d] = r.name;
  return {
    now: new Date(),
    name: profile.name,
    features: profile.features,
    trainingDays: profile.trainingDays,
    routines: byWeekday,
    attendedToday: !!attendance,
    mealsLoggedToday: logs.length,
    proteinLeft: Math.max(0, goal.protein - totals.protein),
    waterMlToday: habits.waterMl,
    waterGoalMl: profile.waterGoalMl,
    creatineToday: habits.creatine,
    pendingTodosToday: todos.filter((t) => !t.done).length,
    lastWeightDate: latestEntry(weights)?.date ?? null,
    streak: streak.current,
    streakDoneToday: streak.doneToday,
    shields: streak.shields,
    usualHours,
    intensity: prefs.intensity,
    off: prefs.off,
  };
}

export async function currentPlan(db: Db): Promise<PlannedNotification[]> {
  return planReminders(await reminderState(db));
}

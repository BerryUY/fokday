import type { Db } from '@/db/types';
import { computeAttendanceStats } from '@/domain/attendance';
import { isGoalMet } from '@/domain/nutrition';
import { addDays, diffDays, maxKey, startOfWeek, type DateKey } from '@/lib/dates';
import { getScheduledDays, listAttendance } from './attendance';
import { getDailyTotalsRange, getMealFrequency, type DayNutrition, type MealFrequency } from './meals';
import { getGoalTimeline, goalForDate } from './settings';
import { listSessions, type SessionSummary } from './workouts';

export type RangeKey = '7d' | '30d' | '90d' | 'all';

export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '7d', label: '7 días', days: 7 },
  { key: '30d', label: '30 días', days: 30 },
  { key: '90d', label: '90 días', days: 90 },
  { key: 'all', label: 'Todo', days: null },
];

export function rangeStart(range: RangeKey, today: DateKey): DateKey | null {
  const days = RANGES.find((r) => r.key === range)?.days;
  return days ? addDays(today, -(days - 1)) : null;
}

export type NutritionStats = {
  days: (DayNutrition & { calorieGoal: number; proteinGoal: number })[];
  daysLogged: number;
  /** Calendar days in the range (from the first log when the range is "Todo"). */
  daysInRange: number;
  avgCalories: number | null;
  avgProtein: number | null;
  calorieGoalDays: number;
  proteinGoalDays: number;
  topMeals: MealFrequency[];
};

/** Averages only include days with at least one logged meal: an unlogged day is missing data, not a 0 kcal day. */
export async function getNutritionStats(db: Db, range: RangeKey, today: DateKey): Promise<NutritionStats> {
  const from = rangeStart(range, today);
  const [rows, timeline, topMeals] = await Promise.all([getDailyTotalsRange(db, from, today), getGoalTimeline(db), getMealFrequency(db, from, today, 5)]);
  const days = rows.map((d) => {
    const goal = goalForDate(timeline, d.date);
    return { ...d, calorieGoal: goal.calories, proteinGoal: goal.protein };
  });
  const n = days.length;
  const start = from ?? days[0]?.date ?? today;
  return {
    days,
    daysLogged: n,
    daysInRange: diffDays(start, today) + 1,
    avgCalories: n ? Math.round(days.reduce((s, d) => s + d.calories, 0) / n) : null,
    avgProtein: n ? Math.round((days.reduce((s, d) => s + d.protein, 0) / n) * 10) / 10 : null,
    calorieGoalDays: days.filter((d) => isGoalMet(d.calories, d.calorieGoal)).length,
    proteinGoalDays: days.filter((d) => isGoalMet(d.protein, d.proteinGoal)).length,
    topMeals,
  };
}

export type GymStats = {
  sessionsInRange: number;
  attendanceInRange: number;
  perWeek: number | null;
  perMonth: number | null;
  consistency: number | null;
  scheduledDays: number[];
  weekly: { weekStart: DateKey; count: number }[];
  sessions: SessionSummary[];
  totalVolume: number;
  totalAllTime: number;
  currentStreak: number;
  longestStreak: number;
};

export async function getGymStats(db: Db, range: RangeKey, today: DateKey): Promise<GymStats> {
  const from = rangeStart(range, today);
  const [all, scheduledDays, sessions] = await Promise.all([listAttendance(db), getScheduledDays(db), listSessions(db, from, today)]);
  const dates = all.map((a) => a.date);
  const inRange = dates.filter((d) => (!from || d >= from) && d <= today);
  const effectiveFrom = from ?? dates[0] ?? null;
  const stats = computeAttendanceStats(dates, scheduledDays, today, from ?? undefined);

  // Rates are measured from the later of the range start and the first record, so a new user isn't penalised for days before they started.
  const spanStart = effectiveFrom && dates[0] ? maxKey(effectiveFrom, dates[0]) : null;
  const spanDays = spanStart ? diffDays(spanStart, today) + 1 : 0;

  const weekly: GymStats['weekly'] = [];
  const weeksToShow = range === '7d' ? 4 : range === '30d' ? 6 : range === '90d' ? 13 : Math.min(26, Math.max(4, Math.ceil(spanDays / 7)));
  const thisWeek = startOfWeek(today);
  for (let i = weeksToShow - 1; i >= 0; i--) {
    const ws = addDays(thisWeek, -7 * i);
    const we = addDays(ws, 6);
    weekly.push({ weekStart: ws, count: dates.filter((d) => d >= ws && d <= we).length });
  }

  return {
    sessionsInRange: sessions.length,
    attendanceInRange: inRange.length,
    perWeek: spanDays >= 7 ? Math.round((inRange.length / spanDays) * 7 * 10) / 10 : null,
    perMonth: spanDays >= 28 ? Math.round((inRange.length / spanDays) * 30 * 10) / 10 : null,
    consistency: stats.consistency,
    scheduledDays,
    weekly,
    sessions,
    totalVolume: sessions.reduce((s, x) => s + x.volume, 0),
    totalAllTime: stats.total,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
  };
}

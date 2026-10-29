import type { Db } from '@/db/types';
import type { WeekNumbers } from '@/domain/weeklySummary';
import { addDays, type DateKey } from '@/lib/dates';
import { listActivities } from './activities';
import { getGoalForDate, getProfile } from './settings';
import { getGymStats, getNutritionStats } from './stats';
import { getStreak } from './streak';
import { listWeights } from './weight';
import { getExerciseProgress, listSessions, listTrainedExercises } from './workouts';

/** Everything the weekly summary looks at: the last 7 days, with the 7 before for comparison. */
export async function gatherWeekNumbers(db: Db, today: DateKey): Promise<WeekNumbers> {
  const from = addDays(today, -6);
  const prevFrom = addDays(today, -13);
  const prevTo = addDays(today, -7);
  const [nutrition, gym, weights, profile, goal, prevDays, prevSessions, activities, streak, trained, habits, todos] = await Promise.all([
    getNutritionStats(db, '7d', today),
    getGymStats(db, '7d', today),
    listWeights(db),
    getProfile(db),
    getGoalForDate(db, today),
    db.getAllAsync<{ date: string; calories: number; protein: number }>(
      'SELECT log_date AS date, sum(calories) AS calories, sum(protein) AS protein FROM meal_logs WHERE log_date BETWEEN ? AND ? GROUP BY log_date',
      [prevFrom, prevTo],
    ),
    listSessions(db, prevFrom, prevTo),
    listActivities(db, from, today),
    getStreak(db, today),
    listTrainedExercises(db),
    db.getAllAsync<{ water: number; creatine: number }>('SELECT water_ml AS water, creatine FROM daily_habits WHERE date BETWEEN ? AND ?', [from, today]),
    db.getFirstAsync<{ done: number; total: number }>(
      'SELECT coalesce(sum(done), 0) AS done, count(*) AS total FROM daily_todos WHERE date BETWEEN ? AND ?',
      [from, today],
    ),
  ]);
  const prevGym = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM gym_attendance WHERE date BETWEEN ? AND ?', [prevFrom, prevTo]);

  // Best weight this week vs the best of the four weeks before, per exercise trained this week.
  const progressions: NonNullable<WeekNumbers['progressions']> = [];
  for (const ex of trained.slice(0, 12)) {
    const points = await getExerciseProgress(db, ex.exerciseId, addDays(today, -34));
    const now = points.filter((p) => p.date >= from);
    const before = points.filter((p) => p.date < from);
    if (!now.length || !before.length) continue;
    const toKg = Math.max(...now.map((p) => p.bestWeight));
    const fromKg = Math.max(...before.map((p) => p.bestWeight));
    if (toKg > fromKg) progressions.push({ exercise: ex.name, fromKg, toKg });
  }
  progressions.sort((a, b) => b.toKg - b.fromKg - (a.toKg - a.fromKg));

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const inWeek = weights.filter((w) => w.date >= from && w.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = [...weights].sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  return {
    daysLogged: nutrition.daysLogged,
    avgCalories: nutrition.avgCalories,
    avgProtein: nutrition.avgProtein,
    proteinGoalDays: nutrition.proteinGoalDays,
    calorieGoalDays: nutrition.calorieGoalDays,
    calorieGoal: goal.calories,
    proteinGoal: goal.protein,
    gymDays: gym.attendanceInRange,
    plannedGymDays: gym.scheduledDays.length,
    sessions: gym.sessionsInRange,
    volumeKg: gym.totalVolume,
    previous: {
      avgCalories: avg(prevDays.map((d) => d.calories)),
      avgProtein: avg(prevDays.map((d) => d.protein)),
      gymDays: prevGym?.n ?? 0,
      volumeKg: prevSessions.reduce((s, x) => s + x.volume, 0),
    },
    progressions,
    activities: { count: activities.length, minutes: activities.reduce((s, a) => s + a.minutes, 0) },
    water: profile.features.includes('water') && habits.length ? { avgMl: habits.reduce((s, h) => s + h.water, 0) / 7, goalMl: profile.waterGoalMl } : null,
    creatineDays: profile.features.includes('creatine') ? habits.filter((h) => h.creatine).length : null,
    todos: { done: todos?.done ?? 0, total: todos?.total ?? 0 },
    streak: { current: streak.current, best: streak.longest },
    weights: inWeek,
    currentWeight: latest?.weight ?? null,
    startWeight: profile.startWeight,
    targetWeight: profile.targetWeight,
  };
}

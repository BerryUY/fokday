import { addDays, startOfWeek, type DateKey } from '@/lib/dates';

/**
 * The app streak (like Duolingo's): consecutive days on which the person logged a meal or trained
 * (a workout or an activity). It stays alive through today while today is still
 * open, so it only breaks once a whole day passes with nothing.
 */
export type Streak = {
  current: number;
  longest: number;
  /** Today already counts (the flame is lit). */
  doneToday: boolean;
  /** Monday-first, this week: whether each day counted, and which one is today. */
  week: { date: DateKey; done: boolean; isToday: boolean; future: boolean }[];
};

/** Streak lengths worth a celebration. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 150, 200, 365] as const;

export function computeStreak(activeDates: Iterable<DateKey>, today: DateKey): Streak {
  const days = new Set([...activeDates].filter((d) => d <= today));
  const doneToday = days.has(today);

  let current = 0;
  for (let d = doneToday ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) current += 1;

  let longest = 0;
  let run = 0;
  let prev: DateKey | null = null;
  for (const d of [...days].sort()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }

  const monday = startOfWeek(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, done: days.has(date), isToday: date === today, future: date > today };
  });
  return { current, longest: Math.max(longest, current), doneToday, week };
}

/** The milestone reached exactly at `n` days, if any. */
export const milestoneAt = (n: number): number | null => (STREAK_MILESTONES as readonly number[]).includes(n) ? n : null;

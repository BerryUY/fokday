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
  /** Monday-first, this week: whether each day counted (or a shield covered it), and which one is today. */
  week: { date: DateKey; done: boolean; frozen: boolean; isToday: boolean; future: boolean }[];
};

/** Streak lengths worth a celebration. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 150, 200, 365] as const;

/** Days covered by a shield bridge the streak, but don't add to it. */
export function computeStreak(activeDates: Iterable<DateKey>, today: DateKey, frozenDates: Iterable<DateKey> = []): Streak {
  const days = new Set([...activeDates].filter((d) => d <= today));
  const frozen = new Set([...frozenDates].filter((d) => d <= today && !days.has(d)));
  const doneToday = days.has(today);

  let current = 0;
  for (let d = doneToday ? today : addDays(today, -1); days.has(d) || frozen.has(d); d = addDays(d, -1)) if (days.has(d)) current += 1;

  let longest = 0;
  let run = 0;
  let prev: DateKey | null = null;
  for (const d of [...days, ...frozen].sort()) {
    const counted = days.has(d) ? 1 : 0;
    run = prev && addDays(prev, 1) === d ? run + counted : counted;
    longest = Math.max(longest, run);
    prev = d;
  }

  const monday = startOfWeek(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, done: days.has(date), frozen: frozen.has(date), isToday: date === today, future: date > today };
  });
  return { current, longest: Math.max(longest, current), doneToday, week };
}

/** The milestone reached exactly at `n` days, if any. */
export const milestoneAt = (n: number): number | null => (STREAK_MILESTONES as readonly number[]).includes(n) ? n : null;

/**
 * Shields: a missed day doesn't break the streak if there's a shield to cover it. Everyone starts with
 * one and earns another every 7 days of streak, up to MAX_SHIELDS.
 */
export const MAX_SHIELDS = 2;
export const DAYS_PER_SHIELD = 7;

export type StreakVault = {
  shields: number;
  frozen: DateKey[];
  /** Streak length that last earned a shield. */
  rewardedAt: number;
  /** Last active day of a streak already reported as lost, so it's only announced once. */
  lostAfter: DateKey | null;
};

export const NEW_VAULT: StreakVault = { shields: 1, frozen: [], rewardedAt: 0, lostAfter: null };

export type StreakEvent = { kind: 'saved'; days: number; streak: number } | { kind: 'lost'; streak: number } | { kind: 'earned'; streak: number };

/** Reconciles the vault with what happened: spends shields on missed days, or reports the lost streak. Safe to run any number of times. */
export function settleStreak(activeDates: Iterable<DateKey>, vault: StreakVault, today: DateKey): { vault: StreakVault; event: StreakEvent | null } {
  const days = [...activeDates].filter((d) => d <= today);
  const covered = new Set([...days, ...vault.frozen]);
  const yesterday = addDays(today, -1);
  const last = [...covered].filter((d) => d <= yesterday).sort().pop();
  const next = { ...vault };
  let event: StreakEvent | null = null;

  if (last && last < yesterday) {
    const streak = computeStreak(days, last, vault.frozen).current;
    const missed: DateKey[] = [];
    for (let d = addDays(last, 1); d <= yesterday; d = addDays(d, 1)) missed.push(d);
    if (streak > 0 && missed.length <= vault.shields) {
      next.shields -= missed.length;
      next.frozen = [...vault.frozen, ...missed].slice(-60);
      event = { kind: 'saved', days: missed.length, streak };
    } else if (streak > 0 && vault.lostAfter !== last) {
      next.lostAfter = last;
      next.rewardedAt = 0;
      event = { kind: 'lost', streak };
    }
  }

  const current = computeStreak(days, today, next.frozen).current;
  if (current < next.rewardedAt) next.rewardedAt = 0;
  if (Math.floor(current / DAYS_PER_SHIELD) > Math.floor(next.rewardedAt / DAYS_PER_SHIELD)) {
    next.rewardedAt = current;
    if (next.shields < MAX_SHIELDS) {
      next.shields += 1;
      event ??= { kind: 'earned', streak: current };
    }
  }
  return { vault: next, event };
}

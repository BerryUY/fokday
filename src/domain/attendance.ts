import { addDays, maxKey, startOfMonth, startOfWeek, weekday, type DateKey } from '@/lib/dates';

/**
 * Attendance statistics that respect the training schedule:
 * only a *scheduled* day without attendance breaks a streak. Rest days never do,
 * and an extra session on a rest day still adds to the streak.
 * Without a schedule, any day without attendance breaks it.
 * Today never breaks a streak (the day is not over yet).
 */
export type AttendanceStats = {
  total: number;
  thisWeek: number;
  thisMonth: number;
  currentStreak: number;
  longestStreak: number;
  /** attended scheduled days / scheduled days elapsed; null without schedule or history. */
  consistency: number | null;
  firstDate: DateKey | null;
};

export function computeAttendanceStats(
  attendedDates: DateKey[],
  scheduledWeekdays: number[],
  today: DateKey,
  consistencyFrom?: DateKey,
): AttendanceStats {
  const attended = new Set(attendedDates.filter((d) => d <= today));
  const sorted = [...attended].sort();
  const firstDate = sorted[0] ?? null;
  const weekStart = startOfWeek(today);
  const monthStart = startOfMonth(today);

  const base = {
    total: attended.size,
    thisWeek: sorted.filter((d) => d >= weekStart).length,
    thisMonth: sorted.filter((d) => d >= monthStart).length,
    firstDate,
  };
  if (!firstDate) return { ...base, currentStreak: 0, longestStreak: 0, consistency: null };

  const schedule = new Set(scheduledWeekdays);
  const isMissed = (day: DateKey) =>
    day < today && !attended.has(day) && (schedule.size === 0 || schedule.has(weekday(day)));

  let longest = 0;
  let running = 0;
  for (let d = firstDate; d <= today; d = addDays(d, 1)) {
    if (attended.has(d)) {
      running += 1;
      longest = Math.max(longest, running);
    } else if (isMissed(d)) {
      running = 0;
    }
  }

  return {
    ...base,
    currentStreak: running,
    longestStreak: longest,
    consistency: consistencyRatio(attended, schedule, consistencyFrom ? maxKey(consistencyFrom, firstDate) : firstDate, today),
  };
}

function consistencyRatio(attended: Set<DateKey>, schedule: Set<number>, from: DateKey, today: DateKey): number | null {
  if (schedule.size === 0) return null;
  let due = 0;
  let done = 0;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    if (!schedule.has(weekday(d))) continue;
    // Today only counts once it is attended.
    if (d === today && !attended.has(d)) continue;
    due += 1;
    if (attended.has(d)) done += 1;
  }
  return due > 0 ? done / due : null;
}

export function isScheduled(day: DateKey, scheduledWeekdays: number[]): boolean {
  return scheduledWeekdays.includes(weekday(day));
}

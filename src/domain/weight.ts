import { addDays, type DateKey } from '@/lib/dates';

export type WeightPoint = { date: DateKey; weight: number };

export type WeightProgress = {
  start: number;
  target: number;
  current: number | null;
  /** current − start (can be negative). null without measurements. */
  gained: number | null;
  /** target − current, never below 0. */
  remaining: number | null;
  /** 0..1 share of the start→target distance covered. */
  progress: number | null;
  reached: boolean;
};

export function weightProgress(start: number, target: number, entries: WeightPoint[]): WeightProgress {
  const latest = latestEntry(entries);
  if (!latest) {
    return { start, target, current: null, gained: null, remaining: null, progress: null, reached: false };
  }
  const current = latest.weight;
  const span = target - start;
  const gained = round1(current - start);
  const remaining = round1(Math.max(0, target - current));
  const progress = span > 0 ? clamp01((current - start) / span) : current >= target ? 1 : 0;
  return { start, target, current, gained, remaining, progress, reached: current >= target };
}

export function latestEntry(entries: WeightPoint[]): WeightPoint | null {
  let latest: WeightPoint | null = null;
  for (const e of entries) if (!latest || e.date > latest.date) latest = e;
  return latest;
}

export function sortByDate(entries: WeightPoint[]): WeightPoint[] {
  return [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Average of the measurements in the 7 calendar days ending on each entry.
 * Smooths day-to-day water/food fluctuations without inventing values for missing days.
 */
export function rollingAverage(entries: WeightPoint[], windowDays = 7): WeightPoint[] {
  const sorted = sortByDate(entries);
  return sorted.map((entry, i) => {
    const from = addDays(entry.date, -(windowDays - 1));
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && sorted[j].date >= from; j--) {
      sum += sorted[j].weight;
      n++;
    }
    return { date: entry.date, weight: round1(sum / n) };
  });
}

/**
 * Change between the latest measurement and the last one taken at least `days` days earlier.
 * Returns null when there is no measurement that old.
 */
export function changeOverDays(entries: WeightPoint[], days: number): { change: number; from: WeightPoint; to: WeightPoint } | null {
  const sorted = sortByDate(entries);
  const to = sorted[sorted.length - 1];
  if (!to) return null;
  const cutoff = addDays(to.date, -days);
  let from: WeightPoint | null = null;
  for (const e of sorted) if (e.date <= cutoff) from = e;
  if (!from) return null;
  return { change: round1(to.weight - from.weight), from, to };
}

/** Change against the immediately previous measurement. */
export function changeFromPrevious(entries: WeightPoint[]): number | null {
  const sorted = sortByDate(entries);
  if (sorted.length < 2) return null;
  return round1(sorted[sorted.length - 1].weight - sorted[sorted.length - 2].weight);
}

export type MilestoneStatus = { weight: number; achievedOn: DateKey | null };

/** A milestone counts as reached on the first day a real measurement hit it. */
export function milestoneStatus(milestoneWeights: number[], entries: WeightPoint[]): MilestoneStatus[] {
  const sorted = sortByDate(entries);
  return [...milestoneWeights]
    .sort((a, b) => a - b)
    .map((weight) => ({ weight, achievedOn: sorted.find((e) => e.weight >= weight)?.date ?? null }));
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

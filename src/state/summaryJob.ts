import { useSyncExternalStore } from 'react';
import { ApiError, cloudApi, type CloudConfig } from '@/backup/api';
import { setSetting } from '@/data/settings';
import { gatherWeekNumbers } from '@/data/weekReport';
import type { Db } from '@/db/types';
import { buildWeekInput, parseWeekSummary, weekKey } from '@/domain/weeklySummary';
import { todayKey } from '@/lib/dates';
import { notifyDataChanged } from './dataBus';

/**
 * The Pro weekly summary is made in the background: the card shows "Armando tu resumen…" while
 * the person keeps using the app, a busy AI is retried on its own, and a toast says when it's
 * ready. The result is kept for the week in settings 'summary.week' / 'summary.json'.
 */
export type SummaryJob =
  | { status: 'idle' }
  | { status: 'running'; attempt: number; startedAt: number }
  | { status: 'done'; at: number }
  | { status: 'error'; message: string; at: number };

let job: SummaryJob = { status: 'idle' };
const listeners = new Set<() => void>();

function set(next: SummaryJob) {
  job = next;
  for (const l of listeners) l();
}

export function subscribeSummaryJob(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getSummaryJob = () => job;

export function useSummaryJob(): SummaryJob {
  return useSyncExternalStore(subscribeSummaryJob, getSummaryJob, getSummaryJob);
}

/** Waits between tries when the AI is busy (Google's free tier has rushes that pass in a minute). */
export const RETRY_DELAYS_MS = [20_000, 45_000];

const busy = (e: unknown) => e instanceof ApiError && (e.status === null || e.status === 502 || e.status === 503);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Starts the summary unless one is already running. Resolves when it's done or gave up. */
export async function startWeeklySummary(db: Db, config: CloudConfig, delays = RETRY_DELAYS_MS): Promise<void> {
  if (job.status === 'running') return;
  const startedAt = Date.now();
  set({ status: 'running', attempt: 1, startedAt });
  try {
    const today = todayKey();
    const input = buildWeekInput(await gatherWeekNumbers(db, today));
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await cloudApi.weeklySummary(config, input);
        const summary = parseWeekSummary(res.summary) ?? { title: 'Tu semana', wins: [], improve: [], tip: res.text, focus: '' };
        await setSetting(db, 'summary.week', weekKey(today));
        await setSetting(db, 'summary.json', JSON.stringify(summary));
        notifyDataChanged();
        set({ status: 'done', at: Date.now() });
        return;
      } catch (e) {
        if (!busy(e) || attempt > delays.length) throw e;
        await wait(delays[attempt - 1]);
        set({ status: 'running', attempt: attempt + 1, startedAt });
      }
    }
  } catch (e) {
    set({ status: 'error', message: e instanceof Error ? e.message : 'No pudimos armar el resumen.', at: Date.now() });
  }
}

/** Clears a finished or failed job once its notice was shown. */
export function acknowledgeSummaryJob() {
  if (job.status === 'done' || job.status === 'error') set({ status: 'idle' });
}

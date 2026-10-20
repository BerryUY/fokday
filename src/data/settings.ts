import type { Db } from '@/db/types';
import { INITIAL_GOAL_DATE, SETTING_DEFAULTS } from '@/db/seed';
import { nowIso, type DateKey } from '@/lib/dates';
import { newId } from '@/lib/ids';

export type ThemePreference = 'dark' | 'light' | 'system';

export type Profile = {
  name: string;
  startWeight: number;
  targetWeight: number;
  /** Weekdays (0 = domingo) the user plans to train. */
  trainingDays: number[];
  theme: ThemePreference;
  defaultRestSeconds: number;
};

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? SETTING_DEFAULTS[key] ?? null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
     WHERE settings.value IS NOT excluded.value`,
    [key, value, nowIso()],
  );
}

function parseDays(raw: string | null): number[] {
  try {
    const parsed = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort() : [];
  } catch {
    return [];
  }
}

export async function getProfile(db: Db): Promise<Profile> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings', []);
  const map: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  const theme = map['appearance.theme'];
  return {
    name: map['profile.name'] || '',
    startWeight: Number(map['weight.start']) || 0,
    targetWeight: Number(map['weight.target']) || 0,
    trainingDays: parseDays(map['training.days']),
    theme: theme === 'light' || theme === 'system' ? theme : 'dark',
    defaultRestSeconds: Number(map['workout.default_rest']) || 90,
  };
}

export async function updateProfile(db: Db, patch: Partial<Profile>): Promise<void> {
  await db.withTransactionAsync(async () => {
    if (patch.name !== undefined) await setSetting(db, 'profile.name', patch.name.trim());
    if (patch.startWeight !== undefined) await setSetting(db, 'weight.start', String(patch.startWeight));
    if (patch.targetWeight !== undefined) await setSetting(db, 'weight.target', String(patch.targetWeight));
    if (patch.trainingDays !== undefined) await setSetting(db, 'training.days', JSON.stringify([...new Set(patch.trainingDays)].sort()));
    if (patch.theme !== undefined) await setSetting(db, 'appearance.theme', patch.theme);
    if (patch.defaultRestSeconds !== undefined) await setSetting(db, 'workout.default_rest', String(Math.round(patch.defaultRestSeconds)));
  });
}

// ---- Nutrition goals (versioned by date so past days keep the goal they had) ----

export type NutritionGoal = { effectiveFrom: DateKey; calories: number; protein: number };

export async function getGoalTimeline(db: Db): Promise<NutritionGoal[]> {
  return db.getAllAsync<NutritionGoal>(
    'SELECT effective_from AS effectiveFrom, calories, protein FROM nutrition_goals ORDER BY effective_from',
    [],
  );
}

export function goalForDate(timeline: NutritionGoal[], date: DateKey): NutritionGoal {
  let current = timeline[0];
  for (const g of timeline) if (g.effectiveFrom <= date) current = g;
  return current ?? { effectiveFrom: INITIAL_GOAL_DATE, calories: 2750, protein: 115 };
}

export async function getGoalForDate(db: Db, date: DateKey): Promise<NutritionGoal> {
  return goalForDate(await getGoalTimeline(db), date);
}

/** New targets apply from `from` onward; earlier days keep their previous targets. */
export async function setGoalsFrom(db: Db, from: DateKey, calories: number, protein: number): Promise<void> {
  if (!(calories > 0) || !(protein > 0)) throw new Error('Los objetivos tienen que ser mayores a cero.');
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO nutrition_goals (id, effective_from, calories, protein, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (effective_from) DO UPDATE SET calories = excluded.calories, protein = excluded.protein, updated_at = excluded.updated_at`,
      [newId(), from, calories, protein, now, now],
    );
    // Later versions would override the new goal; the latest edit wins.
    await db.runAsync('DELETE FROM nutrition_goals WHERE effective_from > ?', [from]);
  });
}

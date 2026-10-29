import type { Db } from '@/db/types';
import { INITIAL_GOAL_DATE, SETTING_DEFAULTS } from '@/db/seed';
import { nowIso, type DateKey } from '@/lib/dates';
import { newId } from '@/lib/ids';
import type { ActivityLevel, Sex } from '@/domain/energy';
import { isValidWeight, WEIGHT_RANGE_MESSAGE } from '@/domain/weight';
import { ACCENTS, type AccentKey } from '@/theme/tokens';

export type ThemePreference = 'dark' | 'light' | 'system';

export type Profile = {
  name: string;
  startWeight: number;
  targetWeight: number;
  /** Weekdays (0 = domingo) the user plans to train. */
  trainingDays: number[];
  theme: ThemePreference;
  /** Pro color theme; free accounts always see the default (lima). */
  accent: AccentKey;
  /** Reward sounds (task done, creatine, gym, AI photo). On unless turned off. */
  sounds: boolean;
  defaultRestSeconds: number;
  /** Optional trackers the person turned on (see FEATURE_KEYS). Everything is off by default. */
  features: FeatureKey[];
  waterGoalMl: number;
};

export const HABIT_FEATURES = [
  { key: 'water', label: 'Agua', description: 'Cuántos litros tomaste en el día' },
  { key: 'creatine', label: 'Creatina', description: 'Marcar si la tomaste hoy' },
] as const;

export const FEATURE_KEYS = ['water', 'creatine', 'carbs', 'fat', 'fiber', 'dairy'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

function parseFeatures(raw: string | null): FeatureKey[] {
  try {
    const parsed = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? FEATURE_KEYS.filter((k) => parsed.includes(k)) : [];
  } catch {
    return [];
  }
}

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
    accent: ACCENTS.find((a) => a.key === map['appearance.accent'])?.key ?? 'lima',
    sounds: map['appearance.sounds'] !== '0',
    defaultRestSeconds: Number(map['workout.default_rest']) || 90,
    features: parseFeatures(map['features.enabled']),
    waterGoalMl: Number(map['water.goal_ml']) || 2500,
  };
}

export async function updateProfile(db: Db, patch: Partial<Profile>): Promise<void> {
  for (const kg of [patch.startWeight, patch.targetWeight]) {
    if (kg !== undefined && !isValidWeight(kg)) throw new Error(WEIGHT_RANGE_MESSAGE);
  }
  await db.withTransactionAsync(async () => {
    if (patch.name !== undefined) await setSetting(db, 'profile.name', patch.name.trim());
    if (patch.startWeight !== undefined) await setSetting(db, 'weight.start', String(patch.startWeight));
    if (patch.targetWeight !== undefined) await setSetting(db, 'weight.target', String(patch.targetWeight));
    if (patch.trainingDays !== undefined) await setSetting(db, 'training.days', JSON.stringify([...new Set(patch.trainingDays)].sort()));
    if (patch.theme !== undefined) await setSetting(db, 'appearance.theme', patch.theme);
    if (patch.accent !== undefined) await setSetting(db, 'appearance.accent', patch.accent);
    if (patch.sounds !== undefined) await setSetting(db, 'appearance.sounds', patch.sounds ? '1' : '0');
    if (patch.defaultRestSeconds !== undefined) await setSetting(db, 'workout.default_rest', String(Math.round(patch.defaultRestSeconds)));
    if (patch.features !== undefined) await setSetting(db, 'features.enabled', JSON.stringify(FEATURE_KEYS.filter((k) => patch.features!.includes(k))));
    if (patch.waterGoalMl !== undefined) await setSetting(db, 'water.goal_ml', String(Math.round(patch.waterGoalMl)));
  });
}

// ---- Body data (for the calorie formula) ----

export type BodyData = { sex: Sex; heightCm: number; birthYear: number; activity: ActivityLevel };

export async function saveBody(db: Db, body: BodyData): Promise<void> {
  await db.withTransactionAsync(async () => {
    await setSetting(db, 'body.sex', body.sex);
    await setSetting(db, 'body.height_cm', String(Math.round(body.heightCm)));
    await setSetting(db, 'body.birth_year', String(body.birthYear));
    await setSetting(db, 'body.activity', body.activity);
  });
}

export async function getBody(db: Db): Promise<BodyData | null> {
  const [sex, height, year, activity] = await Promise.all(['body.sex', 'body.height_cm', 'body.birth_year', 'body.activity'].map((k) => getSetting(db, k)));
  if (!sex || !height || !year || !activity) return null;
  return { sex: sex as Sex, heightCm: Number(height), birthYear: Number(year), activity: activity as ActivityLevel };
}

// ---- First-run setup ----

/** False only on a fresh install that has not been through the welcome screen. Missing flag counts as done. */
export async function isOnboarded(db: Db): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM settings WHERE key = 'onboarding.done'`, []);
  return row?.value !== '0';
}

export type OnboardingInput = {
  name: string;
  currentWeight: number;
  targetWeight: number;
  calories: number;
  protein: number;
  trainingDays: number[];
};

/** Saves the person's own profile, goals and first weigh-in, then marks setup as done. */
export async function completeOnboarding(db: Db, input: OnboardingInput, today: DateKey): Promise<void> {
  if (!isValidWeight(input.currentWeight) || !isValidWeight(input.targetWeight)) throw new Error(WEIGHT_RANGE_MESSAGE);
  if (!(input.calories > 0) || !(input.protein > 0)) throw new Error('Los objetivos tienen que ser mayores a cero.');
  // Not one transaction (the helpers open their own); the flag goes last, so a failure just shows the form again.
  await updateProfile(db, {
    name: input.name,
    startWeight: input.currentWeight,
    targetWeight: input.targetWeight,
    trainingDays: input.trainingDays,
  });
  // Replaces the factory goal for every day: there is no history yet on a fresh install.
  await setGoalsFrom(db, INITIAL_GOAL_DATE, input.calories, input.protein);
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO weight_entries (id, date, weight_kg, notes, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)
     ON CONFLICT (date) DO UPDATE SET weight_kg = excluded.weight_kg, updated_at = excluded.updated_at`,
    [newId(), today, input.currentWeight, now, now],
  );
  await setSetting(db, 'onboarding.done', '1');
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

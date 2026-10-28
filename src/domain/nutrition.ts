export type MealCategory = 'desayuno' | 'almuerzo' | 'merienda' | 'cena' | 'extra';

export const MEAL_CATEGORIES: { key: MealCategory; label: string; short: string }[] = [
  { key: 'desayuno', label: 'Desayuno', short: 'Desayuno' },
  { key: 'almuerzo', label: 'Almuerzo', short: 'Almuerzo' },
  { key: 'merienda', label: 'Merienda', short: 'Merienda' },
  { key: 'cena', label: 'Cena', short: 'Cena' },
  { key: 'extra', label: 'Extras y snacks', short: 'Extras' },
];

export const CATEGORY_KEYS = MEAL_CATEGORIES.map((c) => c.key);

export function categoryLabel(key: string): string {
  return MEAL_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export function isMealCategory(value: unknown): value is MealCategory {
  return typeof value === 'string' && (CATEGORY_KEYS as string[]).includes(value);
}

export const PORTIONS = [0.5, 1, 1.5, 2] as const;

export type Nutrition = { calories: number; protein: number };

/** Optional nutrients: each person turns on only the ones they want to follow. */
export const EXTRA_NUTRIENTS = [
  { key: 'carbs', label: 'Carbohidratos', unit: 'g' },
  { key: 'fat', label: 'Grasas', unit: 'g' },
  { key: 'fiber', label: 'Fibra', unit: 'g' },
  { key: 'dairy', label: 'Lácteos', unit: 'porc.' },
] as const;

export type ExtraKey = (typeof EXTRA_NUTRIENTS)[number]['key'];
export type Extras = Partial<Record<ExtraKey, number>>;

const EXTRA_KEYS: string[] = EXTRA_NUTRIENTS.map((e) => e.key);

export function parseExtras(raw: string | null | undefined): Extras {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Extras = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (EXTRA_KEYS.includes(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) out[k as ExtraKey] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Stores only positive known values; null when there is nothing to store. */
export function serializeExtras(extras: Extras | null | undefined): string | null {
  const clean: Extras = {};
  for (const k of EXTRA_KEYS as ExtraKey[]) {
    const v = extras?.[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) clean[k] = Math.round(v * 10) / 10;
  }
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
}

export function scaleExtras(base: Extras, portion: number): Extras {
  const out: Extras = {};
  for (const k of EXTRA_KEYS as ExtraKey[]) if (base[k]) out[k] = Math.round(base[k]! * portion * 10) / 10;
  return out;
}

/** Calories are kept as whole kcal and protein with one decimal; that is the precision the plan uses. */
export function scaleNutrition(base: Nutrition, portion: number): Nutrition {
  return {
    calories: Math.round(base.calories * portion),
    protein: Math.round(base.protein * portion * 10) / 10,
  };
}

/** `extras` are per base portion; the logged amount is extras × portion. */
export type LoggedNutrition = Nutrition & { category: string; extras?: Extras; portion?: number };

export type DailyTotals = Nutrition & {
  entries: number;
  extras: Extras;
  byCategory: Record<MealCategory, Nutrition & { entries: number }>;
};

export function emptyByCategory(): DailyTotals['byCategory'] {
  const out = {} as DailyTotals['byCategory'];
  for (const key of CATEGORY_KEYS) out[key] = { calories: 0, protein: 0, entries: 0 };
  return out;
}

export function sumDailyTotals(logs: LoggedNutrition[]): DailyTotals {
  const byCategory = emptyByCategory();
  let calories = 0;
  let protein = 0;
  const extras: Extras = {};
  for (const log of logs) {
    calories += log.calories;
    protein += log.protein;
    const scaled = scaleExtras(log.extras ?? {}, log.portion ?? 1);
    for (const k of Object.keys(scaled) as ExtraKey[]) extras[k] = (extras[k] ?? 0) + scaled[k]!;
    const bucket = byCategory[isMealCategory(log.category) ? log.category : 'extra'];
    bucket.calories += log.calories;
    bucket.protein += log.protein;
    bucket.entries += 1;
  }
  for (const key of CATEGORY_KEYS) byCategory[key].protein = Math.round(byCategory[key].protein * 10) / 10;
  for (const k of Object.keys(extras) as ExtraKey[]) extras[k] = Math.round(extras[k]! * 10) / 10;
  return { calories: Math.round(calories), protein: Math.round(protein * 10) / 10, entries: logs.length, extras, byCategory };
}

export type GoalProgress = {
  consumed: number;
  target: number;
  /** consumed / target, not clamped (1.1 = 110 %). */
  ratio: number;
  remaining: number;
  over: number;
};

export function goalProgress(consumed: number, target: number): GoalProgress {
  const ratio = target > 0 ? consumed / target : 0;
  return {
    consumed,
    target,
    ratio,
    remaining: Math.max(0, target - consumed),
    over: Math.max(0, consumed - target),
  };
}

/** A day "meets" a goal at 95 % or more; targets are guides, so a small margin is fine. */
export const GOAL_MET_THRESHOLD = 0.95;

export function isGoalMet(consumed: number, target: number): boolean {
  return target > 0 && consumed / target >= GOAL_MET_THRESHOLD;
}

/** The meal moment that fits a time of day; always changeable before saving. */
export function guessCategory(at: Date = new Date()): MealCategory {
  const h = at.getHours() + at.getMinutes() / 60;
  if (h >= 5 && h < 11) return 'desayuno';
  if (h >= 11 && h < 16) return 'almuerzo';
  if (h >= 16 && h < 20) return 'merienda';
  return 'cena';
}

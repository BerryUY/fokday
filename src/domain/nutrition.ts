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

/** Calories are kept as whole kcal and protein with one decimal; that is the precision the plan uses. */
export function scaleNutrition(base: Nutrition, portion: number): Nutrition {
  return {
    calories: Math.round(base.calories * portion),
    protein: Math.round(base.protein * portion * 10) / 10,
  };
}

export type LoggedNutrition = Nutrition & { category: string };

export type DailyTotals = Nutrition & {
  entries: number;
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
  for (const log of logs) {
    calories += log.calories;
    protein += log.protein;
    const bucket = byCategory[isMealCategory(log.category) ? log.category : 'extra'];
    bucket.calories += log.calories;
    bucket.protein += log.protein;
    bucket.entries += 1;
  }
  for (const key of CATEGORY_KEYS) byCategory[key].protein = Math.round(byCategory[key].protein * 10) / 10;
  return { calories: Math.round(calories), protein: Math.round(protein * 10) / 10, entries: logs.length, byCategory };
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

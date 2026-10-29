import type { Goal } from './onboarding';

/**
 * Daily calories and protein from the person's body and activity.
 *
 * - Resting energy: Mifflin-St Jeor (1990), the most reliable of the common equations in
 *   Frankenfield et al.'s systematic review (J Am Diet Assoc 2005;105:775-89).
 * - Daily energy: resting × activity factor (1.2 sedentary … 1.9 very hard training).
 * - Goal: about −20% to lose (never below resting energy), about +10% to gain.
 * - Protein: 1.6 g/kg (gains in lean mass plateau around there, Morton et al., BJSM 2018) and
 *   2.0 g/kg while losing weight, to protect muscle. With a high BMI it is based on a healthier
 *   reference weight instead of the current one, so the number stays realistic.
 *
 * Always a starting point: shown as a suggestion the person can change.
 */

export type Sex = 'male' | 'female' | 'unspecified';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete';

export const ACTIVITY_LEVELS: { key: ActivityLevel; label: string; description: string; factor: number }[] = [
  { key: 'sedentary', label: 'Poco movimiento', description: 'Trabajo sentado y casi nada de ejercicio', factor: 1.2 },
  { key: 'light', label: 'Algo activo', description: 'Ejercicio 1 a 3 días por semana', factor: 1.375 },
  { key: 'moderate', label: 'Activo', description: 'Ejercicio 3 a 5 días por semana', factor: 1.55 },
  { key: 'high', label: 'Muy activo', description: 'Ejercicio fuerte 6 o 7 días', factor: 1.725 },
  { key: 'athlete', label: 'Atleta', description: 'Doble turno o trabajo físico pesado', factor: 1.9 },
];

export const AGE_RANGE = { min: 14, max: 100 } as const;
export const HEIGHT_RANGE = { min: 120, max: 230 } as const;

export type Body = { weightKg: number; heightCm: number; age: number; sex: Sex; activity: ActivityLevel };

/** Resting energy (kcal/day). Without a sex, the midpoint of the two constants (−78). */
export function restingEnergy({ weightKg, heightCm, age, sex }: Omit<Body, 'activity'>): number {
  const constant = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + constant;
}

export function dailyTargets(body: Body, goal: Goal, targetWeightKg?: number): { calories: number; protein: number; resting: number; maintenance: number } {
  const resting = restingEnergy(body);
  const factor = ACTIVITY_LEVELS.find((a) => a.key === body.activity)?.factor ?? 1.375;
  const maintenance = resting * factor;
  const calories = goal === 'lose' ? Math.max(maintenance * 0.8, resting) : goal === 'gain' ? maintenance * 1.1 : maintenance;

  const m = body.heightCm / 100;
  const bmi = body.weightKg / (m * m);
  const healthy = 25 * m * m;
  const reference = bmi > 27 ? Math.min(body.weightKg, Math.max(healthy, targetWeightKg ?? 0)) : body.weightKg;
  const protein = reference * (goal === 'lose' ? 2 : 1.6);

  return {
    calories: Math.round(calories / 50) * 50,
    protein: Math.round(protein / 5) * 5,
    resting: Math.round(resting),
    maintenance: Math.round(maintenance),
  };
}

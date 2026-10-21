export type Goal = 'gain' | 'lose' | 'maintain';

/**
 * Starting point for daily targets during onboarding. Deliberately simple (kcal per kg of body
 * weight and grams of protein per kg); the person sees it as a suggestion and can change it.
 */
export function suggestTargets(weightKg: number, goal: Goal): { calories: number; protein: number } {
  const kcalPerKg = goal === 'gain' ? 36 : goal === 'lose' ? 26 : 31;
  const proteinPerKg = goal === 'maintain' ? 1.6 : 1.8;
  return {
    calories: Math.round((weightKg * kcalPerKg) / 50) * 50,
    protein: Math.round((weightKg * proteinPerKg) / 5) * 5,
  };
}

/** A reasonable first target: ±5 kg in the goal's direction, or the same weight to maintain. */
export function suggestTarget(weightKg: number, goal: Goal): number {
  return goal === 'gain' ? weightKg + 5 : goal === 'lose' ? Math.max(30, weightKg - 5) : weightKg;
}

/** True when the target agrees with the chosen goal (going up to gain, down to lose). */
export function targetMatchesGoal(current: number, target: number, goal: Goal): boolean {
  if (goal === 'gain') return target > current;
  if (goal === 'lose') return target < current;
  return true;
}

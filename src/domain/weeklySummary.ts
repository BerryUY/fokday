import type { DateKey } from '@/lib/dates';

/**
 * The numbers the Pro weekly summary is written from. Only aggregates leave the phone (no meal
 * names, notes or dates), and they are small enough for the server's 4 KB limit.
 */
export type WeekInput = {
  dias_con_comidas_registradas: number;
  kcal_promedio: number | null;
  meta_kcal: number;
  proteina_promedio_g: number | null;
  meta_proteina_g: number;
  dias_que_llego_a_la_proteina: number;
  dias_de_gym: number;
  dias_de_gym_planeados: number;
  peso_cambio_kg: number | null;
  objetivo: 'subir de peso' | 'bajar de peso' | 'mantener el peso';
};

export type WeekNumbers = {
  daysLogged: number;
  avgCalories: number | null;
  avgProtein: number | null;
  proteinGoalDays: number;
  calorieGoal: number;
  proteinGoal: number;
  gymDays: number;
  plannedGymDays: number;
  /** Weigh-ins in the last 7 days, oldest first. */
  weights: { date: DateKey; weight: number }[];
  startWeight: number;
  targetWeight: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildWeekInput(w: WeekNumbers): WeekInput {
  const first = w.weights[0];
  const last = w.weights[w.weights.length - 1];
  const goal = w.targetWeight > w.startWeight + 0.2 ? 'subir de peso' : w.targetWeight < w.startWeight - 0.2 ? 'bajar de peso' : 'mantener el peso';
  return {
    dias_con_comidas_registradas: w.daysLogged,
    kcal_promedio: w.avgCalories,
    meta_kcal: Math.round(w.calorieGoal),
    proteina_promedio_g: w.avgProtein,
    meta_proteina_g: Math.round(w.proteinGoal),
    dias_que_llego_a_la_proteina: w.proteinGoalDays,
    dias_de_gym: w.gymDays,
    dias_de_gym_planeados: w.plannedGymDays,
    peso_cambio_kg: first && last && first.date !== last.date ? round1(last.weight - first.weight) : null,
    objetivo: goal,
  };
}

/** Monday of the week a date falls in: summaries are kept once per week. */
export function weekKey(today: DateKey): DateKey {
  const d = new Date(`${today}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10) as DateKey;
}

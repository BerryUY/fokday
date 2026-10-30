import type { DateKey } from '@/lib/dates';

/**
 * The numbers the Pro weekly summary is written from: comida, gym (with each exercise's
 * progress), actividad, peso, hábitos, tareas and racha, this week against the one before.
 * Only aggregates and exercise names leave the phone (no meal names, notes or dates), and they
 * stay under the server's size limit.
 */
export type WeekInput = Record<string, unknown> & {
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
  // The rest is optional: each part only goes in when there is something to say.
  calorieGoalDays?: number;
  previous?: { avgCalories: number | null; avgProtein: number | null; gymDays: number; volumeKg: number };
  sessions?: number;
  volumeKg?: number;
  /** Exercises trained this week whose best set went up compared with the weeks before. */
  progressions?: { exercise: string; fromKg: number; toKg: number }[];
  activities?: { count: number; minutes: number };
  water?: { avgMl: number; goalMl: number } | null;
  creatineDays?: number | null;
  todos?: { done: number; total: number };
  streak?: { current: number; best: number };
  currentWeight?: number | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildWeekInput(w: WeekNumbers): WeekInput {
  const first = w.weights[0];
  const last = w.weights[w.weights.length - 1];
  const goal = w.targetWeight > w.startWeight + 0.2 ? 'subir de peso' : w.targetWeight < w.startWeight - 0.2 ? 'bajar de peso' : 'mantener el peso';
  const out: WeekInput = {
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
  if (w.calorieGoalDays !== undefined) out.dias_que_llego_a_las_kcal = w.calorieGoalDays;
  if (w.previous) {
    out.semana_anterior = {
      kcal_promedio: w.previous.avgCalories,
      proteina_promedio_g: w.previous.avgProtein,
      dias_de_gym: w.previous.gymDays,
      volumen_kg: Math.round(w.previous.volumeKg),
    };
  }
  if (w.sessions !== undefined) out.entrenamientos = w.sessions;
  if (w.volumeKg !== undefined) out.volumen_kg = Math.round(w.volumeKg);
  if (w.progressions?.length) {
    out.progresos = w.progressions.slice(0, 4).map((p) => ({ ejercicio: p.exercise.slice(0, 40), antes_kg: round1(p.fromKg), ahora_kg: round1(p.toKg) }));
  }
  if (w.activities && w.activities.count > 0) out.otras_actividades = { cantidad: w.activities.count, minutos: w.activities.minutes };
  if (w.water) out.agua = { promedio_ml: Math.round(w.water.avgMl), meta_ml: w.water.goalMl };
  if (w.creatineDays !== undefined && w.creatineDays !== null) out.dias_con_creatina = w.creatineDays;
  if (w.todos && w.todos.total > 0) out.tareas = { hechas: w.todos.done, total: w.todos.total };
  if (w.streak) out.racha_dias = { actual: w.streak.current, record: w.streak.best };
  if (w.currentWeight !== undefined && w.currentWeight !== null) {
    out.peso_actual_kg = round1(w.currentWeight);
    out.meta_peso_kg = round1(w.targetWeight);
  }
  return out;
}

/** What the AI writes back: a title, wins, what to improve, a 3-step plan, one tip and the focus for next week. */
export type WeekSummary = { title: string; wins: string[]; improve: string[]; plan: string[]; tip: string; focus: string };

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => str(x, 240)).filter(Boolean).slice(0, n) : []);

/** Reads a stored or received summary; null when it isn't one. */
export function parseWeekSummary(value: unknown): WeekSummary | null {
  const v = (typeof value === 'string' ? safeJson(value) : value) as Record<string, unknown> | null;
  if (!v || typeof v !== 'object') return null;
  const s = { title: str(v.title, 80), wins: list(v.wins, 3), improve: list(v.improve, 2), plan: list(v.plan, 3), tip: str(v.tip, 320), focus: str(v.focus, 120) };
  return s.title && (s.wins.length || s.tip) ? s : null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Monday of the week a date falls in: summaries are kept once per week. */
export function weekKey(today: DateKey): DateKey {
  const d = new Date(`${today}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10) as DateKey;
}

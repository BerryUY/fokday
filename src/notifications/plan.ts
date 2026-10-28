import type { FeatureKey } from '@/data/settings';

/**
 * Reminders are decided by the app, not configured: only what's useful, at sensible times,
 * and only while it's still pending. Each one is a one-off date over the next days; the plan
 * is rebuilt whenever data changes, so marking the creatine cancels today's creatine reminder.
 */

export type ReminderState = {
  now: Date;
  features: FeatureKey[];
  /** Weekdays (0 = domingo) the person trains. */
  trainingDays: number[];
  attendedToday: boolean;
  mealsLoggedToday: number;
  waterMlToday: number;
  waterGoalMl: number;
  creatineToday: boolean;
  pendingTodosToday: number;
  /** YYYY-MM-DD of the last weigh-in, or null. */
  lastWeightDate: string | null;
};

export type PlannedNotification = { id: string; title: string; body: string; at: Date };

export const PLAN_DAYS = 7;

const at = (base: Date, dayOffset: number, hour: number, minute = 0) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour, minute, 0, 0);
  return d;
};
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function planReminders(s: ReminderState): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const add = (id: string, title: string, body: string, when: Date) => {
    if (when.getTime() > s.now.getTime() + 60_000) out.push({ id, title, body, at: when });
  };
  const has = (f: FeatureKey) => s.features.includes(f);

  for (let d = 0; d < PLAN_DAYS; d++) {
    const today = d === 0;
    const day = at(s.now, d, 0);
    const k = key(day);

    if (has('creatine') && !(today && s.creatineToday)) {
      add(`creatine-${k}`, 'Creatina de hoy', '¿Ya la tomaste? Marcala con un toque.', at(s.now, d, 10));
    }
    if (has('water')) {
      const goal = s.waterGoalMl || 2500;
      if (!(today && s.waterMlToday >= goal * 0.4)) add(`water-am-${k}`, 'Un vaso de agua', 'Vas bien si llevás un par de vasos a esta hora.', at(s.now, d, 11));
      if (!(today && s.waterMlToday >= goal * 0.7)) add(`water-pm-${k}`, 'A tomar agua', 'Sumá lo que llevás hoy para llegar a tu meta.', at(s.now, d, 16));
    }
    if (s.trainingDays.includes(day.getDay()) && !(today && s.attendedToday)) {
      add(`gym-${k}`, 'Hoy toca entrenar', 'Tu rutina de hoy te espera en Entrenar.', at(s.now, d, 18));
    }
    if (today && s.pendingTodosToday > 0) {
      const n = s.pendingTodosToday;
      add(`todos-${k}`, 'Para hoy', `Te ${n === 1 ? 'queda 1 tarea' : `quedan ${n} tareas`} por terminar.`, at(s.now, d, 19));
    }
    if (!(today && s.mealsLoggedToday >= 2)) {
      add(`meals-${k}`, '¿Anotaste lo que comiste?', 'Registrarlo te lleva un minuto (o una foto).', at(s.now, d, 21));
    }
  }

  // Weigh-in: next Monday morning, only if the last one is a week old or missing.
  const lastWeight = s.lastWeightDate ? new Date(`${s.lastWeightDate}T12:00:00`) : null;
  const daysToMonday = (8 - s.now.getDay()) % 7 || 7;
  const monday = at(s.now, s.now.getDay() === 1 && s.now.getHours() < 8 ? 0 : daysToMonday, 8, 30);
  if (!lastWeight || monday.getTime() - lastWeight.getTime() >= 6 * 86_400_000) {
    add(`weight-${key(monday)}`, 'Día de pesarte', 'Una medición por semana alcanza para ver tu progreso.', monday);
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

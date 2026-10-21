import type { FeatureKey } from '@/data/settings';

/** Reminders the person can turn on. All are off by default and fire at a time they choose. */
export const REMINDER_DEFS = [
  { key: 'gym', label: 'Ir al gym', description: 'Los días de gym que marcaste', title: 'Hoy toca entrenar', body: 'Abrí Momentum y empezá tu entrenamiento.', defaultMinutes: 18 * 60 },
  { key: 'meals', label: 'Registrar comidas', description: 'Todos los días', title: '¿Registraste tus comidas?', body: 'Anotá lo de hoy en un minuto.', defaultMinutes: 21 * 60 },
  { key: 'water', label: 'Tomar agua', description: 'Todos los días', title: 'A tomar agua', body: 'Sumá lo que llevás hoy.', defaultMinutes: 15 * 60, needs: 'water' },
  { key: 'creatine', label: 'Creatina', description: 'Todos los días', title: 'Creatina de hoy', body: 'Marcá si ya la tomaste.', defaultMinutes: 9 * 60, needs: 'creatine' },
] as const satisfies readonly {
  key: string; label: string; description: string; title: string; body: string; defaultMinutes: number; needs?: FeatureKey;
}[];

export type ReminderKey = (typeof REMINDER_DEFS)[number]['key'];
export type ReminderSetting = { on: boolean; minutes: number };
export type RemindersConfig = Record<ReminderKey, ReminderSetting>;

export function defaultReminders(): RemindersConfig {
  const out = {} as RemindersConfig;
  for (const d of REMINDER_DEFS) out[d.key] = { on: false, minutes: d.defaultMinutes };
  return out;
}

export function parseReminders(raw: string | null | undefined): RemindersConfig {
  const out = defaultReminders();
  try {
    const parsed = JSON.parse(raw ?? '{}') as Record<string, Partial<ReminderSetting>>;
    for (const d of REMINDER_DEFS) {
      const s = parsed[d.key];
      if (!s) continue;
      if (typeof s.on === 'boolean') out[d.key].on = s.on;
      if (typeof s.minutes === 'number' && Number.isInteger(s.minutes) && s.minutes >= 0 && s.minutes < 1440) out[d.key].minutes = s.minutes;
    }
  } catch {
    // keep defaults
  }
  return out;
}

export type PlannedNotification = {
  /** Stable identifier: the same reminder always plans the same id. */
  id: string;
  title: string;
  body: string;
  trigger: { type: 'daily'; hour: number; minute: number } | { type: 'weekly'; weekday: number; hour: number; minute: number };
};

export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * What should be scheduled right now. A reminder is only planned when it is on and
 * (if it depends on an optional tracker) that tracker is on too. Gym reminders need
 * training days; they fire only on those days (our 0 = domingo is Expo's 1).
 */
export function planReminders(config: RemindersConfig, features: FeatureKey[], trainingDays: number[]): PlannedNotification[] {
  const planned: PlannedNotification[] = [];
  for (const def of REMINDER_DEFS) {
    const setting = config[def.key];
    if (!setting.on) continue;
    if ('needs' in def && !features.includes(def.needs)) continue;
    const hour = Math.floor(setting.minutes / 60);
    const minute = setting.minutes % 60;
    if (def.key === 'gym') {
      for (const day of [...new Set(trainingDays)].sort()) {
        planned.push({ id: `gym-${day}`, title: def.title, body: def.body, trigger: { type: 'weekly', weekday: day + 1, hour, minute } });
      }
    } else {
      planned.push({ id: def.key, title: def.title, body: def.body, trigger: { type: 'daily', hour, minute } });
    }
  }
  return planned;
}

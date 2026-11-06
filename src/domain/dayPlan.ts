import type { FokiMood } from './mood';

/**
 * The day's missions: a short list made from the person's own goals, so there's always a small,
 * concrete reason to open the app today. Finishing them all makes a perfect day.
 */

export type DayState = {
  name: string;
  hour: number;
  meals: number;
  protein: number;
  proteinTarget: number;
  /** Today's routine, when today is a training day. */
  routineName: string | null;
  trainingDay: boolean;
  trained: boolean;
  waterMl: number;
  waterGoalMl: number;
  tracksWater: boolean;
  creatine: boolean;
  tracksCreatine: boolean;
  streak: number;
  streakDoneToday: boolean;
};

export type MissionKey = 'meals' | 'protein' | 'train' | 'water' | 'creatine';
export type Mission = { key: MissionKey; title: string; detail: string; done: boolean };

export const MEALS_PER_DAY = 3;

export function buildMissions(s: DayState): Mission[] {
  const out: Mission[] = [
    { key: 'meals', title: 'Registrá 3 comidas', detail: `${Math.min(s.meals, MEALS_PER_DAY)} de ${MEALS_PER_DAY}`, done: s.meals >= MEALS_PER_DAY },
    { key: 'protein', title: 'Llegá a tu proteína', detail: `${Math.round(s.protein)} de ${Math.round(s.proteinTarget)} g`, done: s.proteinTarget > 0 && s.protein >= s.proteinTarget * 0.95 },
  ];
  if (s.trainingDay || s.trained) out.push({ key: 'train', title: s.routineName ? `Entrená ${s.routineName}` : 'Entrená', detail: s.trained ? 'Hecho' : 'Hoy toca', done: s.trained });
  if (s.tracksWater) {
    const liters = (ml: number) => (ml / 1000).toLocaleString('es-UY', { maximumFractionDigits: 2 });
    out.push({ key: 'water', title: `Tomá ${liters(s.waterGoalMl)} L de agua`, detail: `${liters(s.waterMl)} L`, done: s.waterMl >= s.waterGoalMl });
  }
  if (s.tracksCreatine) out.push({ key: 'creatine', title: 'Tomá la creatina', detail: s.creatine ? 'Hecho' : 'Pendiente', done: s.creatine });
  return out;
}

/** What Foki says on Inicio: changes with the hour and with how the day is going. */
export function fokiLine(s: DayState, missions: Mission[]): { mood: FokiMood; text: string } {
  const left = missions.filter((m) => !m.done).length;
  const hi = s.name ? `, ${s.name}` : '';
  if (left === 0) return { mood: 'cheer', text: `¡Día perfecto${hi}!` };
  const risk = !s.streakDoneToday && s.streak > 0;
  if (risk && s.hour >= 20) return { mood: 'worried', text: `Me estoy apagando${hi}. Un registro y salvás ${s.streak} ${s.streak === 1 ? 'día' : 'días'}.` };
  if (risk) return { mood: 'worried', text: `Tu racha de ${s.streak} ${s.streak === 1 ? 'día' : 'días'} espera un registro.` };
  if (!s.streakDoneToday) return { mood: 'happy', text: `¡Arranquemos${hi}! Con un registro prendés la llama.` };
  if (left === 1) return { mood: 'proud', text: 'Te falta una sola para el día perfecto.' };
  if (s.trainingDay && !s.trained && s.hour >= 15) return { mood: 'strong', text: 'Hoy toca entrenar. ¿Vamos?' };
  if (s.hour < 12) return { mood: 'happy', text: `Buen día${hi}. Vamos por el día perfecto.` };
  return { mood: 'proud', text: `Vas bien${hi}. Te faltan ${left} para el día perfecto.` };
}

/** The hour someone usually eats each meal, from their own logs, so reminders arrive when they're useful. */
export function usualHour(hours: number[], fallback: number, min: number, max: number): number {
  if (hours.length < 4) return fallback;
  const sorted = [...hours].sort((a, b) => a - b);
  return Math.min(max, Math.max(min, sorted[Math.floor(sorted.length / 2)]));
}

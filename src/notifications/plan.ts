import type { FeatureKey } from '@/data/settings';
import type { FokiMood } from '@/domain/mood';
import type { ChannelKey } from './channels';

/**
 * The reminders, in Foki's voice. Decided by the app: only what's still pending, at the hours this
 * person usually eats, and each message told a different way. Everything is scheduled on the phone,
 * so it arrives without internet and keeps arriving when the app isn't opened: the first days get the
 * full ladder, then come the "I miss you" messages, and after a month Foki stops insisting.
 * The plan is rebuilt whenever data changes, so logging a meal cancels what no longer applies.
 */

export type Intensity = 'suave' | 'normal' | 'insistente';

/** How many messages a day, at most. */
export const DAILY_LIMIT: Record<Intensity, number> = { suave: 2, normal: 5, insistente: 8 };

export const INTENSITIES: { key: Intensity; label: string; hint: string }[] = [
  { key: 'suave', label: 'Suave', hint: 'Hasta 2 por día: la racha y el entrenamiento' },
  { key: 'normal', label: 'Normal', hint: 'Hasta 5 por día' },
  { key: 'insistente', label: 'Insistente', hint: 'Hasta 8 por día, nada se te pasa' },
];

export type UsualHours = { breakfast: number; lunch: number; dinner: number };
export const DEFAULT_HOURS: UsualHours = { breakfast: 9, lunch: 13, dinner: 20.5 };

export type ReminderState = {
  now: Date;
  name: string;
  features: FeatureKey[];
  /** Weekdays (0 = domingo) the person trains. */
  trainingDays: number[];
  /** Routine name by weekday. */
  routines: Record<number, string>;
  attendedToday: boolean;
  mealsLoggedToday: number;
  proteinLeft: number;
  waterMlToday: number;
  waterGoalMl: number;
  creatineToday: boolean;
  pendingTodosToday: number;
  /** YYYY-MM-DD of the last weigh-in, or null. */
  lastWeightDate: string | null;
  /** Current app streak (days in a row with something logged) and whether today already counts. */
  streak: number;
  streakDoneToday: boolean;
  shields: number;
  usualHours: UsualHours;
  intensity: Intensity;
  /** Channels the person turned off in Ajustes. */
  off: ChannelKey[];
};

export type PlannedNotification = {
  id: string;
  title: string;
  body: string;
  at: Date;
  channel: ChannelKey;
  /** Foki's face in the notification. */
  mood: FokiMood;
  /** Where tapping it goes. */
  url: string;
  /** Buttons under the notification. */
  category?: 'meal' | 'water';
  /** Lower goes first when a day has more messages than its limit. */
  priority: number;
};

export const PLAN_DAYS = 7;
/** After the daily plan runs out, these days from now get one message each. */
export const COMEBACK_DAYS = [9, 12, 16, 22, 30];

const at = (base: Date, dayOffset: number, hours: number) => {
  const h = Math.floor(hours);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, h, Math.round((hours - h) * 60), 0, 0);
};
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

/** A stable pick: the same message for the same reminder, a different one from day to day. */
function pick<T>(options: T[], seed: string): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return options[h % options.length];
}

type Copy = { title: string; body: string };
const c = (title: string, body: string): Copy => ({ title, body });

const copy = {
  breakfast: (n: string): Copy[] => [
    c(`Buen día${n} ☀️`, '¿Qué desayunaste? Una foto y queda anotado.'),
    c('Yo ya tengo hambre 🍳', 'Contame qué desayunaste, tarda diez segundos.'),
    c(`Arrancó el día${n}`, 'El desayuno es el primer punto de tu día perfecto.'),
  ],
  lunch: (n: string): Copy[] => [
    c(`¿Almorzaste${n}? 🍽️`, 'Sacale una foto al plato antes de terminarlo.'),
    c('Hora del almuerzo', 'Una foto y yo calculo las calorías.'),
    c('Tengo hambre de datos 🤤', 'Pasame el almuerzo: con una foto alcanza.'),
  ],
  protein: (left: number): Copy[] => [
    c(`Te faltan ${left} g de proteína 💪`, 'Todavía estás a tiempo de llegar hoy.'),
    c(`A tu día le faltan ${left} g de proteína`, 'Un snack y llegás.'),
  ],
  water: (n: string): Copy[] => [
    c('Tengo sed 💧', `¿Y vos${n}? Sumá un vaso.`),
    c('Un vaso de agua', 'Tocá el botón y lo anoto.'),
    c('Glu, glu, glu 💧', 'Vas por la mitad del día. ¿Cómo viene el agua?'),
  ],
  creatine: (): Copy[] => [
    c('¿Y la creatina? 🥄', 'Tomala ahora y marcala con un toque.'),
    c('Creatina de hoy', 'Funciona si es todos los días. Ya sabés.'),
  ],
  gym: (routine: string | null, n: string): Copy[] => [
    c(routine ? `Hoy toca ${routine} 🏋️` : 'Hoy toca entrenar 🏋️', `Yo ya estoy levantando la barra${n}. ¿Venís?`),
    c(routine ? `${routine} te espera` : 'El gym te espera', 'Tus pesos de la última vez ya están cargados.'),
    c(`¿Vamos${n}? 💪`, routine ? `Hoy es día de ${routine}. Empezá y yo te llevo serie por serie.` : 'Hoy es día de entrenar.'),
  ],
  streakRisk: (s: number, n: string): Copy[] => [
    c(`🔥 Tu racha de ${days(s)} está en juego`, `Con un solo registro la salvás${n}.`),
    c('Me estoy apagando 🥺', `Son ${days(s)} de racha. Una comida y sigo prendido.`),
    c(`${days(s)} seguidos${n}`, 'Sería una pena perderlos. Solo digo.'),
    c('Todavía estás a tiempo 🔥', `Tu racha de ${days(s)} te necesita hoy.`),
  ],
  streakLast: (s: number, n: string): Copy[] => [
    c(`⏳ Últimas horas${n}`, `Tu racha de ${days(s)} se corta a medianoche.`),
    c('Esto se apaga 🕯️', `Quedan pocas horas para salvar ${days(s)}.`),
  ],
  streakStart: (n: string): Copy[] => [
    c(`Hola${n}, soy Foki 👋`, 'Registrá algo hoy y prendemos tu llama.'),
    c('🔥 Prendamos la llama', 'Con un registro arranca tu racha.'),
  ],
  shieldUsed: (s: number): Copy[] => [c('Te cubrí con un protector 🛡️', `Tu racha de ${days(s)} sigue viva, pero hoy no te olvides.`)],
  lost: (s: number, n: string): Copy[] => [
    c('Se apagó la llama 🥲', `Tu racha de ${days(s)} se cortó. Volvé${n} y prendemos otra.`),
    c(`Perdiste tu racha de ${days(s)}`, 'Pasa. Lo que cuenta es volver hoy.'),
  ],
  miss: (n: string): Copy[] => [
    c(`Te extraño${n} 🥺`, 'Hace rato no sé qué comés. ¿Me contás?'),
    c('Sigo acá 👀', 'Una foto de tu comida y volvemos a arrancar.'),
    c('¿Todo bien?', 'Tu progreso sigue guardado, te espera cuando quieras.'),
  ],
  goodbye: (n: string): Copy => c('Parece que estos avisos no funcionan 😔', `Voy a dejar de insistir${n}. Acá voy a estar cuando vuelvas.`),
  meals: (): Copy[] => [c('¿Anotaste lo que comiste?', 'Te lleva un minuto, o una foto.'), c('Falta la cena 🌙', 'Registrala y cerrás el día.')],
  weight: (): Copy[] => [c('Día de pesarte ⚖️', 'Una medición por semana alcanza para ver tu progreso.')],
};

export function planReminders(s: ReminderState): PlannedNotification[] {
  const hi = s.name ? `, ${s.name}` : '';
  const has = (f: FeatureKey) => s.features.includes(f);
  const out: PlannedNotification[] = [];
  const limit = DAILY_LIMIT[s.intensity];

  for (let d = 0; d < PLAN_DAYS; d++) {
    const today = d === 0;
    const day = at(s.now, d, 0);
    const k = key(day);
    const list: PlannedNotification[] = [];
    const add = (id: string, options: Copy[], when: Date, rest: Pick<PlannedNotification, 'channel' | 'mood' | 'url' | 'priority'> & { category?: 'meal' | 'water' }) => {
      if (when.getTime() > s.now.getTime() + 60_000) list.push({ id, ...pick(options, id), at: when, ...rest });
    };

    // How the streak stands on this day, if nothing else gets logged from now on.
    const missed = today ? 0 : s.streakDoneToday ? d - 1 : d;
    const alive = s.streak > 0 && missed <= s.shields;
    const justLost = s.streak >= 2 && missed === s.shields + 1;
    const usedShield = alive && missed > 0;
    const dayDone = today && s.streakDoneToday;
    const inactive = !today && !alive && !justLost;

    if (usedShield) add(`shield-${k}`, copy.shieldUsed(s.streak), at(s.now, d, 10), { channel: 'streak', mood: 'proud', url: '/racha', priority: 1 });
    if (justLost) add(`lost-${k}`, copy.lost(s.streak, hi), at(s.now, d, 10), { channel: 'streak', mood: 'sad', url: '/', priority: 1 });

    if (!dayDone) {
      if (s.streak > 0 && alive) {
        add(`streak-${k}`, copy.streakRisk(s.streak, hi), at(s.now, d, Math.max(s.usualHours.dinner, 20)), { channel: 'streak', mood: 'worried', url: '/', priority: 0 });
        if (s.streak >= 2) add(`streak-last-${k}`, copy.streakLast(s.streak, hi), at(s.now, d, 22.5), { channel: 'streak', mood: 'worried', url: '/', priority: 1 });
      } else if (today) {
        add(`streak-${k}`, copy.streakStart(hi), at(s.now, d, Math.max(s.usualHours.dinner, 20)), { channel: 'streak', mood: 'happy', url: '/', priority: 0 });
      } else if (inactive) {
        add(`miss-${k}`, copy.miss(hi), at(s.now, d, 19), { channel: 'streak', mood: 'sad', url: '/', priority: 0 });
      }
    }

    // Once someone stops coming, the rest of the ladder stops too: one honest message beats ten.
    if (!inactive) {
      if (!(today && s.mealsLoggedToday >= 1)) {
        add(`breakfast-${k}`, copy.breakfast(hi), at(s.now, d, s.usualHours.breakfast + 0.25), { channel: 'meals', mood: 'hungry', url: '/comida/foto', category: 'meal', priority: 3 });
      }
      if (!(today && s.mealsLoggedToday >= 2)) {
        add(`lunch-${k}`, copy.lunch(hi), at(s.now, d, s.usualHours.lunch + 0.25), { channel: 'meals', mood: 'hungry', url: '/comida/foto', category: 'meal', priority: 3 });
      }
      if (today && s.streakDoneToday && s.mealsLoggedToday < 3) {
        add(`meals-${k}`, copy.meals(), at(s.now, d, 21), { channel: 'meals', mood: 'happy', url: '/comida/foto', category: 'meal', priority: 4 });
      }
      if (today && s.proteinLeft >= 20 && s.mealsLoggedToday >= 1) {
        add(`protein-${k}`, copy.protein(Math.round(s.proteinLeft)), at(s.now, d, 17), { channel: 'meals', mood: 'strong', url: '/comida/foto', priority: 5 });
      }
      if (s.trainingDays.includes(day.getDay()) && !(today && s.attendedToday)) {
        add(`gym-${k}`, copy.gym(s.routines[day.getDay()] ?? null, hi), at(s.now, d, 18), { channel: 'workout', mood: 'strong', url: '/entrenar', priority: 2 });
      }
      if (has('water')) {
        const goal = s.waterGoalMl || 2500;
        if (!(today && s.waterMlToday >= goal * 0.4)) add(`water-am-${k}`, copy.water(hi), at(s.now, d, 11), { channel: 'water', mood: 'thirsty', url: '/', category: 'water', priority: 6 });
        if (!(today && s.waterMlToday >= goal * 0.7)) add(`water-pm-${k}`, copy.water(hi), at(s.now, d, 16), { channel: 'water', mood: 'thirsty', url: '/', category: 'water', priority: 6 });
      }
      if (has('creatine') && !(today && s.creatineToday)) {
        add(`creatine-${k}`, copy.creatine(), at(s.now, d, 10), { channel: 'other', mood: 'happy', url: '/', priority: 5 });
      }
      if (today && s.pendingTodosToday > 0) {
        const n = s.pendingTodosToday;
        add(`todos-${k}`, [c('Para hoy 📝', `Te ${n === 1 ? 'queda 1 tarea' : `quedan ${n} tareas`} por terminar.`)], at(s.now, d, 19), { channel: 'other', mood: 'happy', url: '/', priority: 7 });
      }
    }

    out.push(...list.filter((n) => !s.off.includes(n.channel)).sort((a, b) => a.priority - b.priority).slice(0, limit));
  }

  // Weigh-in: next Monday morning, only if the last one is a week old or missing.
  const lastWeight = s.lastWeightDate ? new Date(`${s.lastWeightDate}T12:00:00`) : null;
  const daysToMonday = (8 - s.now.getDay()) % 7 || 7;
  const monday = at(s.now, s.now.getDay() === 1 && s.now.getHours() < 8 ? 0 : daysToMonday, 8.5);
  if ((!lastWeight || monday.getTime() - lastWeight.getTime() >= 6 * 86_400_000) && !s.off.includes('other') && s.intensity !== 'suave') {
    const id = `weight-${key(monday)}`;
    out.push({ id, ...pick(copy.weight(), id), at: monday, channel: 'other', mood: 'happy', url: '/peso/registrar', priority: 8 });
  }

  // Far from the last visit: a few "I'm still here" messages and a goodbye.
  if (!s.off.includes('streak')) {
    for (const [i, d] of COMEBACK_DAYS.entries()) {
      const when = at(s.now, d, 19);
      const id = `back-${key(when)}`;
      const last = i === COMEBACK_DAYS.length - 1;
      out.push({ id, ...(last ? copy.goodbye(hi) : pick(copy.miss(hi), id)), at: when, channel: 'streak', mood: last ? 'sleepy' : 'sad', url: '/', priority: 0 });
    }
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

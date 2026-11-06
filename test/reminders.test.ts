import { COMEBACK_DAYS, DAILY_LIMIT, DEFAULT_HOURS, planReminders, type ReminderState } from '../src/notifications/plan';

// Tuesday 2026-10-27, 09:00 local.
const base: ReminderState = {
  now: new Date(2026, 9, 27, 9, 0),
  name: 'Sofi',
  features: [],
  trainingDays: [],
  routines: {},
  attendedToday: false,
  mealsLoggedToday: 0,
  proteinLeft: 0,
  waterMlToday: 0,
  waterGoalMl: 2500,
  creatineToday: false,
  pendingTodosToday: 0,
  lastWeightDate: '2026-10-31',
  streak: 4,
  streakDoneToday: true,
  shields: 0,
  usualHours: DEFAULT_HOURS,
  intensity: 'insistente',
  off: [],
};

const plan = (s: Partial<ReminderState> = {}) => planReminders({ ...base, ...s });
const ids = (s: Partial<ReminderState> = {}) => plan(s).map((n) => n.id);
const onDay = (s: Partial<ReminderState>, date: string) => plan(s).filter((n) => n.id.endsWith(date));

describe('planReminders', () => {
  it('warns about the streak twice while today does not count, and stops once it does', () => {
    expect(ids({ streakDoneToday: false })).toEqual(expect.arrayContaining(['streak-2026-10-27', 'streak-last-2026-10-27']));
    expect(ids()).not.toContain('streak-2026-10-27');
    expect(ids()).not.toContain('streak-last-2026-10-27');
  });

  it('talks about the real streak and the person by name', () => {
    const texts = plan({ streakDoneToday: false }).filter((n) => n.id === 'streak-2026-10-27').map((n) => `${n.title} ${n.body}`).join();
    expect(texts).toMatch(/4 días/);
  });

  it('asks a new person to start instead of warning about a streak', () => {
    const start = plan({ streak: 0, streakDoneToday: false }).find((n) => n.id === 'streak-2026-10-27');
    expect(start?.mood).toBe('happy');
    expect(start?.channel).toBe('streak');
  });

  it('names the routine of the day', () => {
    const gym = plan({ trainingDays: [2], routines: { 2: 'Piernas' } }).find((n) => n.id === 'gym-2026-10-27');
    expect(`${gym?.title} ${gym?.body}`).toContain('Piernas');
    expect(gym?.url).toBe('/entrenar');
  });

  it('drops what is already done today', () => {
    expect(ids({ trainingDays: [2], attendedToday: true })).not.toContain('gym-2026-10-27');
    expect(ids({ features: ['water'], waterMlToday: 2000 })).not.toContain('water-pm-2026-10-27');
    expect(ids({ features: ['creatine'], creatineToday: true })).not.toContain('creatine-2026-10-27');
    expect(ids({ mealsLoggedToday: 2 })).not.toContain('lunch-2026-10-27');
  });

  it('never schedules something in the past', () => {
    const late = plan({ now: new Date(2026, 9, 27, 22, 0), features: ['creatine', 'water'], trainingDays: [2] });
    expect(late.every((n) => n.at.getTime() > new Date(2026, 9, 27, 22, 0).getTime())).toBe(true);
  });

  it('uses the hours the person really eats', () => {
    const lunch = plan({ usualHours: { ...DEFAULT_HOURS, lunch: 14.5 } }).find((n) => n.id === 'lunch-2026-10-27');
    expect(lunch?.at.getHours()).toBe(14);
    expect(lunch?.at.getMinutes()).toBe(45);
  });

  it('keeps to the limit of each intensity, the streak first', () => {
    const busy: Partial<ReminderState> = { streakDoneToday: false, features: ['water', 'creatine'], trainingDays: [2], pendingTodosToday: 2, now: new Date(2026, 9, 27, 7, 0) };
    for (const intensity of ['suave', 'normal', 'insistente'] as const) {
      const today = onDay({ ...busy, intensity }, '2026-10-27');
      expect(today.length).toBeLessThanOrEqual(DAILY_LIMIT[intensity]);
      expect(today.map((n) => n.id)).toContain('streak-2026-10-27');
    }
    expect(onDay({ ...busy, intensity: 'suave' }, '2026-10-27').map((n) => n.id).sort()).toEqual(['streak-2026-10-27', 'streak-last-2026-10-27', 'streak-noon-2026-10-27']);
  });

  it('covers the whole day, not only the evening', () => {
    const partsOf = (list: { at: Date }[]) => new Set(list.map((n) => { const h = n.at.getHours(); return h < 12 ? 'mañana' : h < 16 ? 'mediodía' : h < 19 ? 'tarde' : 'noche'; }));
    const early = new Date(2026, 9, 27, 7, 0);
    // Someone with no extras, on a day that doesn't count yet and on one that already does.
    expect(partsOf(onDay({ now: early, intensity: 'normal', streakDoneToday: false }, '2026-10-27')).size).toBe(4);
    expect(partsOf(onDay({ now: early, intensity: 'normal', streakDoneToday: true }, '2026-10-27')).size).toBe(4);
    // And tomorrow, without having opened the app.
    expect(partsOf(onDay({ now: early, intensity: 'normal', streakDoneToday: true }, '2026-10-28')).size).toBe(4);
    expect(onDay({ now: early, intensity: 'normal', streakDoneToday: true }, '2026-10-28').length).toBeGreaterThanOrEqual(5);
  });

  it('leaves out the kinds turned off in Ajustes', () => {
    expect(plan({ trainingDays: [2], off: ['workout'] }).some((n) => n.channel === 'workout')).toBe(false);
  });

  it('says the streak was lost the first day it would be, then only misses you', () => {
    const away = plan({ streakDoneToday: false });
    expect(away.map((n) => n.id)).toContain('lost-2026-10-28');
    expect(away.find((n) => n.id === 'lost-2026-10-28')?.mood).toBe('sad');
    expect(away.map((n) => n.id)).toContain('miss-2026-10-29');
    // One message a day from then on, not the whole ladder.
    expect(onDay({ streakDoneToday: false }, '2026-10-30')).toHaveLength(1);
  });

  it('counts on the shields before giving the streak up', () => {
    const covered = plan({ streakDoneToday: false, shields: 1 });
    expect(covered.map((n) => n.id)).toContain('shield-2026-10-28');
    expect(covered.map((n) => n.id)).toContain('lost-2026-10-29');
  });

  it('keeps writing after the first week and says goodbye at the end', () => {
    const back = plan().filter((n) => n.id.startsWith('back-'));
    expect(back).toHaveLength(COMEBACK_DAYS.length);
    expect(back[back.length - 1].mood).toBe('sleepy');
  });

  it('gives every notification a unique id, a face and a destination', () => {
    const all = plan({ streakDoneToday: false, features: ['water', 'creatine'], trainingDays: [1, 2, 3, 4, 5], pendingTodosToday: 1, lastWeightDate: null });
    expect(new Set(all.map((n) => n.id)).size).toBe(all.length);
    expect(all.every((n) => n.mood && n.url && n.title && n.body)).toBe(true);
    // Far below Android's limit of scheduled alarms per app.
    expect(all.length).toBeLessThan(100);
  });
});

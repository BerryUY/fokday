import { planReminders, type ReminderState } from '../src/notifications/plan';

// Tuesday 2026-10-27, 09:00 local.
const base: ReminderState = {
  now: new Date(2026, 9, 27, 9, 0),
  features: [],
  trainingDays: [],
  attendedToday: false,
  mealsLoggedToday: 0,
  waterMlToday: 0,
  waterGoalMl: 2500,
  creatineToday: false,
  pendingTodosToday: 0,
  lastWeightDate: '2026-10-31',
  streak: 4,
  streakDoneToday: true,
};
const ids = (s: Partial<ReminderState>) => planReminders({ ...base, ...s }).map((n) => n.id);

describe('automatic reminders', () => {
  it('by default: the meals reminder today, then a streak nudge each coming day', () => {
    expect(ids({})).toEqual([
      'meals-2026-10-27', 'streak-2026-10-28', 'streak-2026-10-29', 'streak-2026-10-30', 'streak-2026-10-31', 'streak-2026-11-01', 'streak-2026-11-02',
    ]);
  });

  it('protects the streak while today does not count yet', () => {
    const plan = planReminders({ ...base, streakDoneToday: false });
    const today = plan.filter((n) => n.id.endsWith('2026-10-27'));
    expect(today.map((n) => n.id)).toEqual(['streak-2026-10-27', 'streak-last-2026-10-27']);
    expect(today[0]).toMatchObject({ title: '🔥 Tu racha de 4 días está en juego', channel: 'racha' });
    expect(today[0].at.getHours()).toBe(20);
    expect(planReminders({ ...base, streak: 0, streakDoneToday: false })[0].title).toBe('🔥 Arrancá tu racha hoy');
  });

  it('skips today\'s reminder once the thing is done', () => {
    expect(ids({ mealsLoggedToday: 3 })).not.toContain('meals-2026-10-27');
    const withCreatine = ids({ features: ['creatine'] });
    expect(withCreatine).toContain('creatine-2026-10-27');
    expect(ids({ features: ['creatine'], creatineToday: true })).not.toContain('creatine-2026-10-27');
    expect(ids({ features: ['creatine'], creatineToday: true })).toContain('creatine-2026-10-28');
  });

  it('reminds the gym only on training days, unless you already went', () => {
    const gym = ids({ trainingDays: [2, 4] }).filter((i) => i.startsWith('gym'));
    expect(gym).toEqual(['gym-2026-10-27', 'gym-2026-10-29']);
    expect(ids({ trainingDays: [2, 4], attendedToday: true })).not.toContain('gym-2026-10-27');
  });

  it('nudges water only while behind, and only if water is on', () => {
    expect(ids({ waterMlToday: 0 }).some((i) => i.startsWith('water'))).toBe(false);
    expect(ids({ features: ['water'] })).toEqual(expect.arrayContaining(['water-am-2026-10-27', 'water-pm-2026-10-27']));
    expect(ids({ features: ['water'], waterMlToday: 1200 })).not.toContain('water-am-2026-10-27');
    expect(ids({ features: ['water'], waterMlToday: 1200 })).toContain('water-pm-2026-10-27');
  });

  it('never plans anything in the past', () => {
    const late = planReminders({ ...base, now: new Date(2026, 9, 27, 22, 0), features: ['creatine', 'water'], trainingDays: [2] });
    expect(late.every((n) => n.at.getTime() > new Date(2026, 9, 27, 22, 0).getTime())).toBe(true);
    expect(late.map((n) => n.id)).not.toContain('gym-2026-10-27');
  });

  it('reminds pending to-dos today and a weekly weigh-in when it is due', () => {
    expect(ids({ pendingTodosToday: 2 })).toContain('todos-2026-10-27');
    expect(ids({ lastWeightDate: '2026-10-30' }).some((i) => i.startsWith('weight'))).toBe(false);
    expect(ids({ lastWeightDate: '2026-10-19' })).toContain('weight-2026-11-02');
    expect(ids({ lastWeightDate: null })).toContain('weight-2026-11-02');
  });
});

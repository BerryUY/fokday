import { defaultReminders, formatMinutes, parseReminders, planReminders } from '../src/notifications/plan';

describe('reminders plan', () => {
  it('plans nothing by default', () => {
    expect(planReminders(defaultReminders(), ['water', 'creatine'], [1, 3])).toEqual([]);
  });

  it('plans daily reminders at the chosen time', () => {
    const config = defaultReminders();
    config.meals = { on: true, minutes: 20 * 60 + 30 };
    expect(planReminders(config, [], [])).toEqual([
      { id: 'meals', title: expect.any(String), body: expect.any(String), trigger: { type: 'daily', hour: 20, minute: 30 } },
    ]);
  });

  it('plans one weekly reminder per training day, using Expo weekdays (domingo = 1)', () => {
    const config = defaultReminders();
    config.gym = { on: true, minutes: 18 * 60 };
    const planned = planReminders(config, [], [1, 3, 0, 1]);
    expect(planned.map((p) => [p.id, p.trigger])).toEqual([
      ['gym-0', { type: 'weekly', weekday: 1, hour: 18, minute: 0 }],
      ['gym-1', { type: 'weekly', weekday: 2, hour: 18, minute: 0 }],
      ['gym-3', { type: 'weekly', weekday: 4, hour: 18, minute: 0 }],
    ]);
    expect(planReminders(config, [], [])).toEqual([]);
  });

  it('skips water and creatine reminders when those trackers are off', () => {
    const config = defaultReminders();
    config.water = { on: true, minutes: 15 * 60 };
    config.creatine = { on: true, minutes: 9 * 60 };
    expect(planReminders(config, [], []).map((p) => p.id)).toEqual([]);
    expect(planReminders(config, ['water'], []).map((p) => p.id)).toEqual(['water']);
    expect(planReminders(config, ['water', 'creatine'], []).map((p) => p.id)).toEqual(['water', 'creatine']);
  });

  it('parses stored settings defensively', () => {
    expect(parseReminders(null)).toEqual(defaultReminders());
    expect(parseReminders('no es json')).toEqual(defaultReminders());
    const parsed = parseReminders(JSON.stringify({ gym: { on: true, minutes: 7 * 60 }, meals: { on: 'si', minutes: 99999 }, bogus: { on: true } }));
    expect(parsed.gym).toEqual({ on: true, minutes: 420 });
    expect(parsed.meals).toEqual(defaultReminders().meals);
  });

  it('formats times', () => {
    expect(formatMinutes(9 * 60 + 5)).toBe('09:05');
    expect(formatMinutes(21 * 60)).toBe('21:00');
  });
});

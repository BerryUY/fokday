import { buildWeekInput, weekKey } from '@/domain/weeklySummary';

describe('weekly summary input', () => {
  const base = {
    daysLogged: 6,
    avgCalories: 2610,
    avgProtein: 118.4,
    proteinGoalDays: 4,
    calorieGoal: 2750.4,
    proteinGoal: 115,
    gymDays: 3,
    plannedGymDays: 4,
    weights: [
      { date: '2026-10-20', weight: 60.1 },
      { date: '2026-10-26', weight: 60.7 },
    ],
    startWeight: 57,
    targetWeight: 65,
  };

  it('sends only aggregates, with the goal in words', () => {
    expect(buildWeekInput(base)).toEqual({
      dias_con_comidas_registradas: 6,
      kcal_promedio: 2610,
      meta_kcal: 2750,
      proteina_promedio_g: 118.4,
      meta_proteina_g: 115,
      dias_que_llego_a_la_proteina: 4,
      dias_de_gym: 3,
      dias_de_gym_planeados: 4,
      peso_cambio_kg: 0.6,
      objetivo: 'subir de peso',
    });
    expect(JSON.stringify(buildWeekInput(base)).length).toBeLessThan(4000);
  });

  it('has no weight change with fewer than two weigh-ins, and reads the goal direction', () => {
    expect(buildWeekInput({ ...base, weights: [{ date: '2026-10-26', weight: 60 }] }).peso_cambio_kg).toBeNull();
    expect(buildWeekInput({ ...base, startWeight: 80, targetWeight: 72 }).objetivo).toBe('bajar de peso');
    expect(buildWeekInput({ ...base, startWeight: 70, targetWeight: 70 }).objetivo).toBe('mantener el peso');
  });

  it('keys summaries by the Monday of the week', () => {
    expect(weekKey('2026-10-28')).toBe('2026-10-26'); // Wednesday
    expect(weekKey('2026-10-26')).toBe('2026-10-26'); // Monday
    expect(weekKey('2026-11-01')).toBe('2026-10-26'); // Sunday
  });
});

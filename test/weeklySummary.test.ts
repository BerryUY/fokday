import { completeOnboarding } from '@/data/settings';
import { logMeal } from '@/data/meals';
import { addRoutineExercise, saveExercise, saveRoutine } from '@/data/routines';
import { addTodo, setTodoDone } from '@/data/todos';
import { gatherWeekNumbers } from '@/data/weekReport';
import { saveWeight } from '@/data/weight';
import { finishSession, getSession, startSession, updateSet } from '@/data/workouts';
import { buildWeekInput, parseWeekSummary, weekKey } from '@/domain/weeklySummary';
import { createTestDb } from './helpers/db';

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

describe('week report from the database', () => {
  it('gathers food, gym progress, todos and weight for the AI, under the size limit', async () => {
    const db = await createTestDb();
    await completeOnboarding(db, { name: 'Ana', currentWeight: 70, targetWeight: 65, calories: 1900, protein: 90, trainingDays: [1, 3] }, '2026-10-01');
    const bench = await saveExercise(db, { name: 'Press de banca', muscleGroup: 'Pecho' });
    const routine = await saveRoutine(db, { name: 'Empuje' });
    await addRoutineExercise(db, routine, bench, { sets: 1, repsMin: 8, repsMax: 12, restSeconds: 90, notes: null });
    for (const [date, kg] of [['2026-10-20', 40], ['2026-10-26', 45]] as const) {
      const id = await startSession(db, date, routine);
      const s = (await getSession(db, id))!;
      for (const set of s.exercises[0].sets) await updateSet(db, set.id, { reps: 8, weight: kg, isCompleted: true });
      await finishSession(db, id, new Date(new Date(s.startedAt).getTime() + 3600_000));
    }
    await logMeal(db, { date: '2026-10-27', category: 'almuerzo', manual: { name: 'Pollo', calories: 800, protein: 60 } });
    const todo = await addTodo(db, '2026-10-27', 'Comprar avena');
    await setTodoDone(db, todo.id, true);
    await addTodo(db, '2026-10-28', 'Llamar');
    await saveWeight(db, '2026-10-24', 69.6);
    await saveWeight(db, '2026-10-28', 69.1);

    const numbers = await gatherWeekNumbers(db, '2026-10-28');
    expect(numbers.progressions).toEqual([{ exercise: 'Press de banca', fromKg: 40, toKg: 45 }]);
    expect(numbers.todos).toEqual({ done: 1, total: 2 });
    expect(numbers.sessions).toBe(1);
    expect(numbers.previous?.gymDays).toBe(1);
    const input = buildWeekInput(numbers);
    expect(input).toMatchObject({
      dias_con_comidas_registradas: 1,
      progresos: [{ ejercicio: 'Press de banca', antes_kg: 40, ahora_kg: 45 }],
      tareas: { hechas: 1, total: 2 },
      peso_cambio_kg: -0.5,
      objetivo: 'bajar de peso',
    });
    expect(JSON.stringify(input).length).toBeLessThan(6000);
  });

  it('reads stored summaries and rejects empty ones', () => {
    expect(parseWeekSummary('{"title":"Buena semana","wins":["a"],"improve":[],"tip":"b","focus":"c"}')?.title).toBe('Buena semana');
    expect(parseWeekSummary('{"title":""}')).toBeNull();
    expect(parseWeekSummary('no json')).toBeNull();
    expect(parseWeekSummary(null)).toBeNull();
  });
});

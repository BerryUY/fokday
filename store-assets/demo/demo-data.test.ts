/**
 * Builds a believable demo backup (two months of meals, workouts, weight and habits) with the
 * app's own data functions, for the Play Store screenshots. It is imported into the web build
 * from Ajustes → Datos y respaldo, so every screenshot is the real app, not a mock.
 *
 *   npx jest -c store-assets/jest.demo.config.cjs    (writes store-assets/demo/fokday-demo.json)
 */
import fs from 'node:fs';
import path from 'node:path';
import { addTodo, setTodoDone } from '@/data/todos';
import { saveActivity } from '@/data/activities';
import { addWater, setCreatine } from '@/data/habits';
import { logMeal } from '@/data/meals';
import { addRoutineExercise, saveExercise, saveRoutine, setRoutineWeekdays } from '@/data/routines';
import { completeOnboarding, updateProfile } from '@/data/settings';
import { addMilestone, saveWeight } from '@/data/weight';
import { finishSession, getSession, startSession, updateSessionMeta, updateSet } from '@/data/workouts';
import { createSnapshot, wrapSnapshot } from '@/backup/snapshot';
import { addDays, todayKey, weekday, type DateKey } from '@/lib/dates';
import type { MealCategory } from '@/domain/nutrition';
import { createTestDb } from '../../test/helpers/db';

type M = { name: string; calories: number; protein: number; carbs: number; fat: number; fiber: number };
const MEALS: Record<Exclude<MealCategory, 'extra'>, M[]> = {
  desayuno: [
    { name: 'Avena con banana y mantequilla de maní', calories: 480, protein: 18, carbs: 66, fat: 16, fiber: 8 },
    { name: 'Tostadas con huevo revuelto y palta', calories: 420, protein: 22, carbs: 34, fat: 21, fiber: 7 },
    { name: 'Yogur griego con granola y frutillas', calories: 390, protein: 24, carbs: 48, fat: 11, fiber: 5 },
  ],
  almuerzo: [
    { name: 'Pollo a la plancha con arroz y ensalada', calories: 640, protein: 48, carbs: 70, fat: 16, fiber: 6 },
    { name: 'Milanesa de carne al horno con puré', calories: 720, protein: 44, carbs: 62, fat: 30, fiber: 5 },
    { name: 'Wrap de atún con vegetales', calories: 560, protein: 38, carbs: 52, fat: 20, fiber: 7 },
    { name: 'Tarta de jamón y queso con ensalada', calories: 610, protein: 29, carbs: 48, fat: 32, fiber: 4 },
  ],
  merienda: [
    { name: 'Licuado de proteína con banana', calories: 310, protein: 30, carbs: 38, fat: 4, fiber: 3 },
    { name: 'Tostadas integrales con queso y tomate', calories: 280, protein: 15, carbs: 30, fat: 11, fiber: 5 },
    { name: 'Manzana con un puñado de almendras', calories: 240, protein: 6, carbs: 28, fat: 13, fiber: 6 },
  ],
  cena: [
    { name: 'Salmón con boniato al horno', calories: 610, protein: 40, carbs: 46, fat: 27, fiber: 6 },
    { name: 'Fideos integrales con boloñesa', calories: 680, protein: 36, carbs: 84, fat: 20, fiber: 9 },
    { name: 'Omelette de espinaca y queso', calories: 430, protein: 30, carbs: 8, fat: 30, fiber: 3 },
    { name: 'Hamburguesa casera con ensalada', calories: 590, protein: 42, carbs: 22, fat: 36, fiber: 5 },
  ],
};

const ROUTINES = [
  { name: 'Empuje', weekdays: [1], exercises: [['Press de banca', 'Pecho', 50], ['Press militar con mancuernas', 'Hombros', 16], ['Aperturas en polea', 'Pecho', 15], ['Fondos en paralelas', 'Tríceps', 0]] },
  { name: 'Piernas', weekdays: [4], exercises: [['Sentadilla', 'Cuádriceps', 70], ['Peso muerto rumano', 'Isquiotibiales', 60], ['Prensa de piernas', 'Cuádriceps', 140], ['Elevación de talones', 'Pantorrillas', 40]] },
  { name: 'Tirón', weekdays: [2], exercises: [['Dominadas asistidas', 'Espalda', 20], ['Remo con barra', 'Espalda', 45], ['Jalón al pecho', 'Espalda', 50], ['Curl de bíceps con mancuernas', 'Bíceps', 12]] },
] as const;

const OUT = path.join(__dirname, 'fokday-demo.json');

test('build demo backup', async () => {
  const db = await createTestDb();
  const today = todayKey();
  const day = (n: number): DateKey => addDays(today, -n);
  const rand = (() => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];

  await completeOnboarding(db, { name: 'Sofía', currentWeight: 76.2, targetWeight: 70, calories: 2100, protein: 130, trainingDays: [1, 2, 4] }, day(63));
  await updateProfile(db, { features: ['water', 'creatine', 'carbs', 'fat', 'fiber'] });
  await addMilestone(db, 74, 'Primer objetivo');
  await addMilestone(db, 72, 'Casi ahí');

  // Weight: about -0.4 kg a week with day-to-day noise, weighed most mornings.
  for (let n = 63; n >= 0; n--) {
    if (n % 7 === 2 || n % 11 === 0) continue;
    const trend = 76.2 - (63 - n) * 0.058;
    await saveWeight(db, day(n), Math.round((trend + (rand() - 0.5) * 0.5) * 10) / 10);
  }

  // Meals: three or four a day for a month; today has breakfast, lunch and the afternoon snack.
  for (let n = 30; n >= 0; n--) {
    const cats: Exclude<MealCategory, 'extra'>[] = n === 0 ? ['desayuno', 'almuerzo', 'merienda'] : ['desayuno', 'almuerzo', 'merienda', 'cena'];
    for (const category of cats) {
      if (n > 0 && category === 'merienda' && rand() < 0.25) continue;
      const m = n === 0 ? MEALS[category][0] : pick(MEALS[category]);
      await logMeal(db, { date: day(n), category, manual: { name: m.name, calories: m.calories, protein: m.protein, extras: { carbs: m.carbs, fat: m.fat, fiber: m.fiber } } });
    }
    await addWater(db, day(n), n === 0 ? 1500 : 2000 + Math.round(rand() * 4) * 250);
    if (n < 14) await setCreatine(db, day(n), true);
  }

  // Routines and two months of sessions with steady progression.
  const routineIds: { id: string; weekday: number; base: number[] }[] = [];
  for (const r of ROUTINES) {
    const id = await saveRoutine(db, { name: r.name });
    await setRoutineWeekdays(db, id, [...r.weekdays]);
    for (const [name, group] of r.exercises) {
      const exId = await saveExercise(db, { name, muscleGroup: group });
      await addRoutineExercise(db, id, exId, { sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90, notes: null, days: [] });
    }
    routineIds.push({ id, weekday: r.weekdays[0], base: r.exercises.map((e) => e[2]) });
  }
  for (let n = 60; n >= 1; n--) {
    const date = day(n);
    const r = routineIds.find((x) => x.weekday === weekday(date));
    if (!r || n === 19 || n === 33) continue;
    const sessionId = await startSession(db, date, r.id);
    const detail = (await getSession(db, sessionId))!;
    const weeks = (60 - n) / 7;
    for (const [i, ex] of detail.exercises.entries()) {
      const base = r.base[i];
      const kg = base === 0 ? null : Math.round((base * (1 + weeks * 0.025)) / 2.5) * 2.5;
      for (const set of ex.sets) await updateSet(db, set.id, { reps: 10 - (set.position ?? 0), weight: kg, isCompleted: true });
    }
    await finishSession(db, sessionId, new Date(Date.now() + 3_300_000));
    await updateSessionMeta(db, sessionId, { durationSeconds: 3000 + Math.round(rand() * 900) });
  }

  // A walk most Saturdays, and today's list.
  for (let n = 60; n >= 1; n--) if (weekday(day(n)) === 6 && rand() < 0.8) await saveActivity(db, { date: day(n), type: 'caminata', minutes: 40 + Math.round(rand() * 30), distanceKm: 4 + Math.round(rand() * 20) / 10 });
  const t1 = await addTodo(db, today, 'Comprar pechuga, huevos y avena');
  await setTodoDone(db, t1.id, true);
  await addTodo(db, today, 'Preparar las viandas de mañana');
  await addTodo(db, today, 'Estirar 10 minutos antes de dormir');

  fs.writeFileSync(OUT, JSON.stringify(await wrapSnapshot(await createSnapshot(db, 'demo-device'))));
  db.close();
});

import {
  deleteMealLog,
  duplicateDay,
  getDailyTotals,
  getDailyTotalsRange,
  getLogsForDate,
  listMeals,
  logMeal,
  saveMeal,
  updateMealLog,
} from '@/data/meals';
import { getGoalForDate, setGoalsFrom } from '@/data/settings';
import { goalProgress, scaleNutrition, sumDailyTotals } from '@/domain/nutrition';
import { toDateKey } from '@/lib/dates';
import { createTestDb } from './helpers/db';

const DAY = '2026-03-10';

async function catalogMeal(db: Awaited<ReturnType<typeof createTestDb>>, seedKey: string) {
  return (await listMeals(db)).find((m) => m.seedKey === seedKey)!;
}

describe('daily nutrition totals', () => {
  it('adds up calories and protein per day and per category', async () => {
    const db = await createTestDb();
    await logMeal(db, { date: DAY, category: 'desayuno', meal: await catalogMeal(db, 'desayuno-a') }); // 420 / 16
    await logMeal(db, { date: DAY, category: 'almuerzo', meal: await catalogMeal(db, 'almuerzo-1') }); // 600 / 40
    await logMeal(db, { date: DAY, category: 'merienda', meal: await catalogMeal(db, 'merienda-m3') }); // 220 / 15
    await logMeal(db, { date: '2026-03-11', category: 'cena', meal: await catalogMeal(db, 'cena-c1') });

    const totals = await getDailyTotals(db, DAY);
    expect(totals.calories).toBe(1240);
    expect(totals.protein).toBe(71);
    expect(totals.entries).toBe(3);
    expect(totals.byCategory.desayuno).toEqual({ calories: 420, protein: 16, entries: 1 });
    expect(totals.byCategory.cena.entries).toBe(0);
  });

  it('supports several meals in one category and repeating the same meal', async () => {
    const db = await createTestDb();
    const m4 = await catalogMeal(db, 'merienda-m2');
    await logMeal(db, { date: DAY, category: 'merienda', meal: m4 });
    await logMeal(db, { date: DAY, category: 'merienda', meal: m4 });
    await logMeal(db, { date: DAY, category: 'extra', manual: { name: 'Banana', calories: 105, protein: 1.3 } });
    const totals = await getDailyTotals(db, DAY);
    expect(totals.byCategory.merienda).toEqual({ calories: 700, protein: 36, entries: 2 });
    expect(totals.calories).toBe(805);
    expect(totals.protein).toBe(37.3);
  });

  it('reports remaining and excess against the target without clamping', () => {
    expect(goalProgress(2150, 2750)).toMatchObject({ remaining: 600, over: 0 });
    expect(goalProgress(3000, 2750)).toMatchObject({ remaining: 0, over: 250 });
    expect(goalProgress(90, 115).ratio).toBeCloseTo(0.7826, 3);
  });

  it('ignores unknown categories safely', () => {
    const t = sumDailyTotals([{ calories: 100, protein: 5, category: 'raro' }]);
    expect(t.byCategory.extra.calories).toBe(100);
  });
});

describe('portions', () => {
  it('scales nutrition for 0.5x, 1.5x and 2x', () => {
    const base = { calories: 720, protein: 22 };
    expect(scaleNutrition(base, 0.5)).toEqual({ calories: 360, protein: 11 });
    expect(scaleNutrition(base, 1.5)).toEqual({ calories: 1080, protein: 33 });
    expect(scaleNutrition(base, 2)).toEqual({ calories: 1440, protein: 44 });
    expect(scaleNutrition({ calories: 333, protein: 12.3 }, 1.5)).toEqual({ calories: 500, protein: 18.5 });
  });

  it('logs portions and rescales when the portion is corrected', async () => {
    const db = await createTestDb();
    const log = await logMeal(db, { date: DAY, category: 'desayuno', meal: await catalogMeal(db, 'desayuno-a'), portion: 1.5 });
    expect(log).toMatchObject({ calories: 630, protein: 24, baseCalories: 420 });
    const corrected = await updateMealLog(db, log.id, { portion: 0.5 });
    expect(corrected).toMatchObject({ portion: 0.5, calories: 210, protein: 8 });
  });

  it('lets calories and protein of a single entry be edited by hand', async () => {
    const db = await createTestDb();
    const log = await logMeal(db, { date: DAY, category: 'cena', meal: await catalogMeal(db, 'cena-c2') });
    await updateMealLog(db, log.id, { calories: 820, protein: 45.5 });
    const totals = await getDailyTotals(db, DAY);
    expect(totals).toMatchObject({ calories: 820, protein: 45.5 });
  });

  it('rejects invalid portions and negative values', async () => {
    const db = await createTestDb();
    const meal = await catalogMeal(db, 'desayuno-a');
    await expect(logMeal(db, { date: DAY, category: 'desayuno', meal, portion: 0 })).rejects.toThrow();
    await expect(logMeal(db, { date: DAY, category: 'extra', manual: { name: 'x', calories: -1, protein: 0 } })).rejects.toThrow();
  });
});

describe('historical meal snapshots', () => {
  it('editing a template never changes what was already logged', async () => {
    const db = await createTestDb();
    const batido = await catalogMeal(db, 'desayuno-a');
    await logMeal(db, { date: DAY, category: 'desayuno', meal: batido });
    await saveMeal(db, { ...batido, name: 'Batido XL', calories: 1000, protein: 40 }, batido.id);

    const [logged] = await getLogsForDate(db, DAY);
    expect(logged).toMatchObject({ name: 'Avena con leche y banana', calories: 420, protein: 16 });

    const later = await logMeal(db, { date: '2026-03-12', category: 'desayuno', meal: await catalogMeal(db, 'desayuno-a') });
    expect(later).toMatchObject({ name: 'Batido XL', calories: 1000 });
  });

  it('deleting a log only removes that entry', async () => {
    const db = await createTestDb();
    const meal = await catalogMeal(db, 'almuerzo-2');
    const a = await logMeal(db, { date: DAY, category: 'almuerzo', meal });
    await logMeal(db, { date: DAY, category: 'almuerzo', meal });
    await deleteMealLog(db, a.id);
    expect((await getDailyTotals(db, DAY)).calories).toBe(650);
  });

  it('duplicates yesterday into today as independent entries', async () => {
    const db = await createTestDb();
    await logMeal(db, { date: '2026-03-09', category: 'desayuno', meal: await catalogMeal(db, 'desayuno-b'), portion: 2 });
    await logMeal(db, { date: '2026-03-09', category: 'cena', manual: { name: 'Sopa', calories: 300, protein: 12 } });
    expect(await duplicateDay(db, '2026-03-09', DAY)).toBe(2);
    const copies = await getLogsForDate(db, DAY);
    expect(copies.map((c) => c.calories).sort()).toEqual([800, 300].sort());
    await deleteMealLog(db, copies[0].id);
    expect(await getLogsForDate(db, '2026-03-09')).toHaveLength(2);
  });

  it('returns only days with records, so missing days are not zeros', async () => {
    const db = await createTestDb();
    await logMeal(db, { date: '2026-03-01', category: 'extra', manual: { name: 'Nada', calories: 0, protein: 0 } });
    await logMeal(db, { date: '2026-03-03', category: 'extra', manual: { name: 'Algo', calories: 500, protein: 20 } });
    const days = await getDailyTotalsRange(db, '2026-03-01', '2026-03-05');
    expect(days.map((d) => d.date)).toEqual(['2026-03-01', '2026-03-03']);
    expect(days[0]).toMatchObject({ calories: 0, entries: 1 });
  });
});

describe('nutrition goals', () => {
  it('starts at 2000 kcal / 100 g and keeps old targets for past days', async () => {
    const db = await createTestDb();
    expect(await getGoalForDate(db, '2026-01-01')).toMatchObject({ calories: 2000, protein: 100 });
    await setGoalsFrom(db, '2026-04-01', 3000, 130);
    expect(await getGoalForDate(db, '2026-03-31')).toMatchObject({ calories: 2000, protein: 100 });
    expect(await getGoalForDate(db, '2026-04-02')).toMatchObject({ calories: 3000, protein: 130 });
  });
});

describe('America/Montevideo day boundaries', () => {
  it('assigns late-night UTC instants to the Uruguayan calendar day', () => {
    // 01:30 UTC on the 11th is 22:30 on the 10th in Montevideo (UTC−3).
    expect(toDateKey(new Date('2026-03-11T01:30:00Z'))).toBe('2026-03-10');
    expect(toDateKey(new Date('2026-03-11T03:00:00Z'))).toBe('2026-03-11');
  });
});

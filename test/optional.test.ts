import { addWater, getHabits, setCreatine } from '@/data/habits';
import { getLogsForDate, getDailyTotals, logMeal, repeatMealLog, saveMeal, getMeal, duplicateDay } from '@/data/meals';
import { completeOnboarding, getProfile, isOnboarded, updateProfile } from '@/data/settings';
import { parseExtras, serializeExtras } from '@/domain/nutrition';
import { createSnapshot, restoreSnapshot, validateEnvelope, wrapSnapshot } from '@/backup/snapshot';
import type { Db } from '@/db/types';
import { createTestDb } from './helpers/db';

describe('optional tracking', () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('starts with every optional tracker off', async () => {
    const profile = await getProfile(db);
    expect(profile.features).toEqual([]);
    expect(profile.waterGoalMl).toBe(2500);
    expect(await getHabits(db, '2026-10-21')).toEqual({ creatine: false, waterMl: 0 });
  });

  it('turns trackers on and ignores unknown keys', async () => {
    await updateProfile(db, { features: ['water', 'carbs', 'bogus' as never] });
    expect((await getProfile(db)).features).toEqual(['water', 'carbs']);
  });

  it('tracks creatine and water per day without going below zero', async () => {
    await setCreatine(db, '2026-10-21', true);
    expect(await addWater(db, '2026-10-21', 250)).toBe(250);
    expect(await addWater(db, '2026-10-21', 500)).toBe(750);
    expect(await addWater(db, '2026-10-21', -2000)).toBe(0);
    expect(await getHabits(db, '2026-10-21')).toEqual({ creatine: true, waterMl: 0 });
    await setCreatine(db, '2026-10-21', false);
    expect((await getHabits(db, '2026-10-21')).creatine).toBe(false);
    expect(await getHabits(db, '2026-10-22')).toEqual({ creatine: false, waterMl: 0 });
  });

  it('keeps extras clean when serializing', () => {
    expect(serializeExtras({ carbs: 40, fat: 0 })).toBe('{"carbs":40}');
    expect(serializeExtras({})).toBeNull();
    expect(parseExtras('{"carbs":12,"zinc":3,"fat":-1}')).toEqual({ carbs: 12 });
    expect(parseExtras('not json')).toEqual({});
  });

  it('sums extras scaled by portion and leaves people without extras unaffected', async () => {
    const id = await saveMeal(db, { name: 'Pasta', category: 'almuerzo', calories: 600, protein: 20, ingredients: [], extras: { carbs: 80, dairy: 1 } });
    const meal = (await getMeal(db, id))!;
    expect(meal.extras).toEqual({ carbs: 80, dairy: 1 });
    await logMeal(db, { date: '2026-10-21', category: 'almuerzo', meal, portion: 1.5 });
    await logMeal(db, { date: '2026-10-21', category: 'cena', manual: { name: 'Tostadas', calories: 200, protein: 6 } });
    const totals = await getDailyTotals(db, '2026-10-21');
    expect(totals.extras).toEqual({ carbs: 120, dairy: 1.5 });
    expect(totals.calories).toBe(1100);
    const [pasta] = await getLogsForDate(db, '2026-10-21');
    expect(pasta.extras).toEqual({ carbs: 80, dairy: 1 });

    await repeatMealLog(db, pasta.id);
    await duplicateDay(db, '2026-10-21', '2026-10-22');
    expect((await getDailyTotals(db, '2026-10-21')).extras.carbs).toBe(240);
    expect((await getDailyTotals(db, '2026-10-22')).extras.carbs).toBe(240);
  });

  it('completes onboarding with the person\'s own data', async () => {
    await db.runAsync(`UPDATE settings SET value = '0' WHERE key = 'onboarding.done'`, []).catch(() => {});
    await db.runAsync(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('onboarding.done', '0', 'x')`, []);
    expect(await isOnboarded(db)).toBe(false);
    await completeOnboarding(db, { name: 'Ana', currentWeight: 70, targetWeight: 65, calories: 1900, protein: 90, trainingDays: [1, 3] }, '2026-10-21');
    expect(await isOnboarded(db)).toBe(true);
    const profile = await getProfile(db);
    expect(profile).toMatchObject({ name: 'Ana', startWeight: 70, targetWeight: 65, trainingDays: [1, 3] });
    await expect(completeOnboarding(db, { name: 'x', currentWeight: 5, targetWeight: 65, calories: 1, protein: 1, trainingDays: [] }, '2026-10-21')).rejects.toThrow();
  });

  it('backs up and restores habits and extras, and accepts backups from before they existed', async () => {
    await setCreatine(db, '2026-10-21', true);
    await addWater(db, '2026-10-21', 500);
    const meal = { id: 'm', name: 'Pasta', calories: 500, protein: 10, isEstimate: true, extras: { carbs: 60 } };
    await db.runAsync(
      `INSERT INTO meals (id, name, category, calories, protein, created_at, updated_at) VALUES ('m','Pasta','almuerzo',500,10,'x','x')`,
      [],
    );
    await logMeal(db, { date: '2026-10-21', category: 'almuerzo', meal });
    const env = await wrapSnapshot(await createSnapshot(db, 'dev'));
    const other = await createTestDb();
    await restoreSnapshot(other, (await validateEnvelope(env)).snapshot);
    expect(await getHabits(other, '2026-10-21')).toEqual({ creatine: true, waterMl: 500 });
    expect((await getDailyTotals(other, '2026-10-21')).extras).toEqual({ carbs: 60 });

    // A schema-1 backup has no daily_habits table at all.
    const old = await createSnapshot(db, 'dev');
    old.schemaVersion = 1;
    delete (old.tables as Record<string, unknown>).daily_habits;
    delete (old.counts as Record<string, unknown>).daily_habits;
    const legacy = await validateEnvelope(await wrapSnapshot(old));
    const third = await createTestDb();
    await restoreSnapshot(third, legacy.snapshot);
    expect(await getHabits(third, '2026-10-21')).toEqual({ creatine: false, waterMl: 0 });
  });
});

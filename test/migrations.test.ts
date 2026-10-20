import { CATALOG } from '@/data/catalog';
import { archiveMeal, listMeals, saveMeal } from '@/data/meals';
import { getProfile } from '@/data/settings';
import { getSchemaVersion, migrate } from '@/db/migrate';
import { DATA_TABLES, MIGRATIONS, SCHEMA_VERSION } from '@/db/schema';
import { seedDatabase } from '@/db/seed';
import { createRawDb, createTestDb } from './helpers/db';

describe('SQLite migrations', () => {
  it('creates the full schema on a fresh database', async () => {
    const db = createRawDb();
    const result = await migrate(db);
    expect(result).toEqual({ from: 0, to: SCHEMA_VERSION });
    expect(await getSchemaVersion(db)).toBe(SCHEMA_VERSION);
    const tables = (await db.getAllAsync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`, [])).map((t) => t.name);
    for (const t of [...DATA_TABLES, 'sync_metadata']) expect(tables).toContain(t);
  });

  it('is idempotent when the app starts again', async () => {
    const db = createRawDb();
    await migrate(db);
    const again = await migrate(db);
    expect(again).toEqual({ from: SCHEMA_VERSION, to: SCHEMA_VERSION });
  });

  it('refuses a database written by a newer app version', async () => {
    const db = createRawDb();
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 5}`);
    await expect(migrate(db)).rejects.toThrow(/versión más nueva/);
  });

  it('rolls back a failing migration and keeps the previous version', async () => {
    const db = createRawDb();
    await migrate(db);
    const broken = [...MIGRATIONS, { version: SCHEMA_VERSION + 1, name: 'broken', sql: 'CREATE TABLE extra (id TEXT); INSERT INTO nope VALUES (1);' }];
    await expect(migrate(db, broken)).rejects.toThrow();
    expect(await getSchemaVersion(db)).toBe(SCHEMA_VERSION);
    const extra = await db.getFirstAsync(`SELECT name FROM sqlite_master WHERE name = 'extra'`, []);
    expect(extra).toBeNull();
  });

  it('enforces foreign keys', async () => {
    const db = await createTestDb();
    await expect(
      db.runAsync(`INSERT INTO meal_ingredients (id, meal_id, position, text) VALUES ('x', 'missing', 0, 'algo')`, []),
    ).rejects.toThrow();
  });
});

describe('catalog seed', () => {
  it('seeds the plan once with real defaults and empty personal history', async () => {
    const db = await createTestDb();
    const meals = await listMeals(db);
    expect(meals).toHaveLength(CATALOG.length);
    const batido = meals.find((m) => m.name === 'Batido de avena')!;
    expect(batido).toMatchObject({ calories: 720, protein: 22, category: 'desayuno', prepMinutes: 5 });
    expect(batido.ingredients).toContain('250 ml leche entera');

    const profile = await getProfile(db);
    expect(profile).toMatchObject({ startWeight: 57, targetWeight: 65, trainingDays: [] });
    for (const t of ['meal_logs', 'weight_entries', 'workout_sessions', 'gym_attendance', 'exercises', 'workout_routines']) {
      const row = await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${t}`, []);
      expect(row?.n).toBe(0);
    }

    expect(await seedDatabase(db)).toBe(0);
    expect(await listMeals(db)).toHaveLength(CATALOG.length);
  });

  it('never overwrites edited meals or resurrects deleted ones on app updates', async () => {
    const db = await createTestDb();
    const meals = await listMeals(db);
    const batido = meals.find((m) => m.seedKey === 'desayuno-a')!;
    await saveMeal(db, { ...batido, name: 'Batido de avena grande', calories: 900, ingredients: ['5 cdas avena'] }, batido.id);
    const tostadas = meals.find((m) => m.seedKey === 'desayuno-b')!;
    await archiveMeal(db, tostadas.id);

    // Simulate an app update that ships catalog v2 with one new meal.
    const newMeal = { ...CATALOG[0], seedKey: 'desayuno-f', since: 2, name: 'Nuevo desayuno' };
    const inserted = await seedDatabase(db, [...CATALOG, newMeal], 2);
    expect(inserted).toBe(1);

    const after = await listMeals(db);
    const edited = after.find((m) => m.seedKey === 'desayuno-a')!;
    expect(edited).toMatchObject({ name: 'Batido de avena grande', calories: 900 });
    expect(edited.ingredients).toEqual(['5 cdas avena']);
    expect(after.find((m) => m.seedKey === 'desayuno-b')).toBeUndefined();
    expect(after.find((m) => m.seedKey === 'desayuno-f')?.name).toBe('Nuevo desayuno');
  });
});

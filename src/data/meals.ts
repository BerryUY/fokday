import type { Db, SqlValue } from '@/db/types';
import { scaleNutrition, sumDailyTotals, type DailyTotals, type MealCategory } from '@/domain/nutrition';
import { nowIso, type DateKey } from '@/lib/dates';
import { newId } from '@/lib/ids';

// ---------- Templates ----------

export type Meal = {
  id: string;
  seedKey: string | null;
  code: string | null;
  name: string;
  category: MealCategory;
  calories: number;
  protein: number;
  isEstimate: boolean;
  prepMinutes: number | null;
  prepLabel: string | null;
  notes: string | null;
  tag: string | null;
  isFavorite: boolean;
  isCustom: boolean;
  sortOrder: number;
  ingredients: string[];
};

type MealRow = Omit<Meal, 'isEstimate' | 'isFavorite' | 'isCustom' | 'ingredients'> & {
  isEstimate: number;
  isFavorite: number;
  isCustom: number;
};

const MEAL_COLUMNS = `id, seed_key AS seedKey, code, name, category, calories, protein, is_estimate AS isEstimate,
  prep_minutes AS prepMinutes, prep_label AS prepLabel, notes, tag, is_favorite AS isFavorite,
  is_custom AS isCustom, sort_order AS sortOrder`;

async function attachIngredients(db: Db, rows: MealRow[]): Promise<Meal[]> {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => '?').join(',');
  const ingredients = await db.getAllAsync<{ mealId: string; text: string }>(
    `SELECT meal_id AS mealId, text FROM meal_ingredients WHERE meal_id IN (${placeholders}) ORDER BY position`,
    rows.map((r) => r.id),
  );
  const byMeal = new Map<string, string[]>();
  for (const i of ingredients) byMeal.set(i.mealId, [...(byMeal.get(i.mealId) ?? []), i.text]);
  return rows.map((r) => ({
    ...r,
    isEstimate: !!r.isEstimate,
    isFavorite: !!r.isFavorite,
    isCustom: !!r.isCustom,
    ingredients: byMeal.get(r.id) ?? [],
  }));
}

export async function listMeals(db: Db, opts: { category?: MealCategory; search?: string; favoritesOnly?: boolean } = {}): Promise<Meal[]> {
  const where = ['is_archived = 0'];
  const params: SqlValue[] = [];
  if (opts.category) {
    where.push('category = ?');
    params.push(opts.category);
  }
  if (opts.favoritesOnly) where.push('is_favorite = 1');
  const rows = await db.getAllAsync<MealRow>(
    `SELECT ${MEAL_COLUMNS} FROM meals WHERE ${where.join(' AND ')}
     ORDER BY CASE category WHEN 'desayuno' THEN 0 WHEN 'almuerzo' THEN 1 WHEN 'merienda' THEN 2 WHEN 'cena' THEN 3 ELSE 4 END,
       is_custom, sort_order, name`,
    params,
  );
  const meals = await attachIngredients(db, rows);
  // The catalog is small, so search runs in JS where it can ignore accents ("sandwich" finds "Sándwich").
  const q = fold(opts.search?.trim() ?? '');
  if (!q) return meals;
  return meals.filter((m) => fold(m.name).includes(q) || fold(m.code ?? '').includes(q) || m.ingredients.some((i) => fold(i).includes(q)));
}

function fold(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export async function getMeal(db: Db, id: string): Promise<Meal | null> {
  const row = await db.getFirstAsync<MealRow>(`SELECT ${MEAL_COLUMNS} FROM meals WHERE id = ?`, [id]);
  if (!row) return null;
  return (await attachIngredients(db, [row]))[0];
}

export type MealInput = {
  name: string;
  category: MealCategory;
  calories: number;
  protein: number;
  isEstimate?: boolean;
  prepMinutes?: number | null;
  notes?: string | null;
  ingredients: string[];
};

function validateMeal(input: MealInput) {
  if (!input.name.trim()) throw new Error('La comida necesita un nombre.');
  if (!(input.calories >= 0) || !(input.protein >= 0)) throw new Error('Calorías y proteína no pueden ser negativas.');
}

/** Creates a custom meal, or updates any meal (predefined ones included). Returns the meal id. */
export async function saveMeal(db: Db, input: MealInput, id?: string): Promise<string> {
  validateMeal(input);
  const now = nowIso();
  const mealId = id ?? newId();
  await db.withTransactionAsync(async () => {
    if (id) {
      await db.runAsync(
        `UPDATE meals SET name = ?, category = ?, calories = ?, protein = ?, is_estimate = ?, prep_minutes = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        [input.name.trim(), input.category, input.calories, input.protein, input.isEstimate ? 1 : 0, input.prepMinutes ?? null,
          input.notes?.trim() || null, now, id],
      );
      await db.runAsync('DELETE FROM meal_ingredients WHERE meal_id = ?', [id]);
    } else {
      const order = await db.getFirstAsync<{ n: number }>('SELECT coalesce(max(sort_order), 0) + 1 AS n FROM meals WHERE category = ?', [input.category]);
      await db.runAsync(
        `INSERT INTO meals (id, seed_key, code, name, category, calories, protein, is_estimate, prep_minutes, prep_label, notes, tag,
           is_favorite, is_custom, is_archived, sort_order, created_at, updated_at)
         VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 0, 1, 0, ?, ?, ?)`,
        [mealId, input.name.trim(), input.category, input.calories, input.protein, input.isEstimate ? 1 : 0, input.prepMinutes ?? null,
          input.notes?.trim() || null, order?.n ?? 0, now, now],
      );
    }
    const lines = input.ingredients.map((l) => l.trim()).filter(Boolean);
    for (const [position, text] of lines.entries()) {
      await db.runAsync('INSERT INTO meal_ingredients (id, meal_id, position, text) VALUES (?, ?, ?, ?)', [newId(), mealId, position, text]);
    }
  });
  return mealId;
}

/** Meals are archived, never hard-deleted: logs keep pointing at them and the seeder won't re-add them. */
export async function archiveMeal(db: Db, id: string): Promise<void> {
  await db.runAsync('UPDATE meals SET is_archived = 1, is_favorite = 0, updated_at = ? WHERE id = ?', [nowIso(), id]);
}

export async function setFavorite(db: Db, id: string, favorite: boolean): Promise<void> {
  await db.runAsync('UPDATE meals SET is_favorite = ?, updated_at = ? WHERE id = ?', [favorite ? 1 : 0, nowIso(), id]);
}

// ---------- Logs ----------

export type MealLog = {
  id: string;
  logDate: DateKey;
  category: MealCategory;
  mealId: string | null;
  name: string;
  portion: number;
  baseCalories: number;
  baseProtein: number;
  calories: number;
  protein: number;
  isEstimate: boolean;
  notes: string | null;
  loggedAt: string;
};

const LOG_COLUMNS = `id, log_date AS logDate, category, meal_id AS mealId, name, portion, base_calories AS baseCalories,
  base_protein AS baseProtein, calories, protein, is_estimate AS isEstimate, notes, logged_at AS loggedAt`;

type LogRow = Omit<MealLog, 'isEstimate'> & { isEstimate: number };
const toLog = (r: LogRow): MealLog => ({ ...r, isEstimate: !!r.isEstimate });

export type LogMealInput = {
  date: DateKey;
  category: MealCategory;
  portion?: number;
  notes?: string | null;
} & (
  | { meal: Pick<Meal, 'id' | 'name' | 'calories' | 'protein' | 'isEstimate'> }
  | { manual: { name: string; calories: number; protein: number } }
);

/** Stores a snapshot of the meal's name and nutrition at logging time. */
export async function logMeal(db: Db, input: LogMealInput): Promise<MealLog> {
  const portion = input.portion ?? 1;
  if (!(portion > 0)) throw new Error('La porción tiene que ser mayor a cero.');
  const source = 'meal' in input
    ? { mealId: input.meal.id, name: input.meal.name, calories: input.meal.calories, protein: input.meal.protein, isEstimate: input.meal.isEstimate }
    : { mealId: null, name: input.manual.name.trim(), calories: input.manual.calories, protein: input.manual.protein, isEstimate: true };
  if (!source.name) throw new Error('Poné un nombre para la comida.');
  if (!(source.calories >= 0) || !(source.protein >= 0)) throw new Error('Calorías y proteína no pueden ser negativas.');

  const scaled = scaleNutrition(source, portion);
  const now = nowIso();
  const log: MealLog = {
    id: newId(),
    logDate: input.date,
    category: input.category,
    mealId: source.mealId,
    name: source.name,
    portion,
    baseCalories: source.calories,
    baseProtein: source.protein,
    calories: scaled.calories,
    protein: scaled.protein,
    isEstimate: source.isEstimate,
    notes: input.notes?.trim() || null,
    loggedAt: now,
  };
  await db.runAsync(
    `INSERT INTO meal_logs (id, log_date, category, meal_id, name, portion, base_calories, base_protein, calories, protein,
       is_estimate, notes, logged_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [log.id, log.logDate, log.category, log.mealId, log.name, log.portion, log.baseCalories, log.baseProtein, log.calories, log.protein,
      log.isEstimate ? 1 : 0, log.notes, now, now, now],
  );
  return log;
}

export async function getMealLog(db: Db, id: string): Promise<MealLog | null> {
  const row = await db.getFirstAsync<LogRow>(`SELECT ${LOG_COLUMNS} FROM meal_logs WHERE id = ?`, [id]);
  return row ? toLog(row) : null;
}

export type MealLogPatch = Partial<Pick<MealLog, 'name' | 'category' | 'logDate' | 'portion' | 'calories' | 'protein' | 'notes'>>;

/**
 * Changing the portion rescales from the logged base values, unless explicit
 * calories/protein are given in the same patch (manual correction wins).
 */
export async function updateMealLog(db: Db, id: string, patch: MealLogPatch): Promise<MealLog> {
  const current = await getMealLog(db, id);
  if (!current) throw new Error('Ese registro ya no existe.');
  const next: MealLog = { ...current, ...patch, notes: patch.notes !== undefined ? patch.notes?.trim() || null : current.notes };
  if (patch.portion !== undefined) {
    if (!(patch.portion > 0)) throw new Error('La porción tiene que ser mayor a cero.');
    const scaled = scaleNutrition({ calories: current.baseCalories, protein: current.baseProtein }, patch.portion);
    next.calories = patch.calories ?? scaled.calories;
    next.protein = patch.protein ?? scaled.protein;
  }
  if (!next.name.trim()) throw new Error('Poné un nombre para la comida.');
  if (!(next.calories >= 0) || !(next.protein >= 0)) throw new Error('Calorías y proteína no pueden ser negativas.');
  await db.runAsync(
    `UPDATE meal_logs SET name = ?, category = ?, log_date = ?, portion = ?, calories = ?, protein = ?, notes = ?, updated_at = ? WHERE id = ?`,
    [next.name.trim(), next.category, next.logDate, next.portion, next.calories, next.protein, next.notes, nowIso(), id],
  );
  return next;
}

/** Logs the same entry again (same snapshot, portion and values) on the same day. */
export async function repeatMealLog(db: Db, id: string): Promise<MealLog> {
  const log = await getMealLog(db, id);
  if (!log) throw new Error('Ese registro ya no existe.');
  const now = nowIso();
  const copy: MealLog = { ...log, id: newId(), loggedAt: now };
  await db.runAsync(
    `INSERT INTO meal_logs (id, log_date, category, meal_id, name, portion, base_calories, base_protein, calories, protein,
       is_estimate, notes, logged_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [copy.id, copy.logDate, copy.category, copy.mealId, copy.name, copy.portion, copy.baseCalories, copy.baseProtein, copy.calories,
      copy.protein, copy.isEstimate ? 1 : 0, copy.notes, now, now, now],
  );
  return copy;
}

export async function deleteMealLog(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM meal_logs WHERE id = ?', [id]);
}

export async function getLogsForDate(db: Db, date: DateKey): Promise<MealLog[]> {
  const rows = await db.getAllAsync<LogRow>(`SELECT ${LOG_COLUMNS} FROM meal_logs WHERE log_date = ? ORDER BY logged_at`, [date]);
  return rows.map(toLog);
}

export async function getDailyTotals(db: Db, date: DateKey): Promise<DailyTotals> {
  return sumDailyTotals(await getLogsForDate(db, date));
}

export type DayNutrition = { date: DateKey; calories: number; protein: number; entries: number };

/** Only days with at least one log are returned: a missing day means "no data", not zero. */
export async function getDailyTotalsRange(db: Db, from: DateKey | null, to: DateKey): Promise<DayNutrition[]> {
  return db.getAllAsync<DayNutrition>(
    `SELECT log_date AS date, round(sum(calories)) AS calories, round(sum(protein), 1) AS protein, count(*) AS entries
     FROM meal_logs WHERE log_date <= ? AND (? IS NULL OR log_date >= ?) GROUP BY log_date ORDER BY log_date`,
    [to, from, from],
  );
}

/** Copies every entry from one day to another as new logs (fresh ids, same snapshots). */
export async function duplicateDay(db: Db, from: DateKey, to: DateKey): Promise<number> {
  const logs = await getLogsForDate(db, from);
  if (logs.length === 0) return 0;
  await db.withTransactionAsync(async () => {
    const now = nowIso();
    for (const l of logs) {
      await db.runAsync(
        `INSERT INTO meal_logs (id, log_date, category, meal_id, name, portion, base_calories, base_protein, calories, protein,
           is_estimate, notes, logged_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId(), to, l.category, l.mealId, l.name, l.portion, l.baseCalories, l.baseProtein, l.calories, l.protein,
          l.isEstimate ? 1 : 0, l.notes, now, now, now],
      );
    }
  });
  return logs.length;
}

export type MealFrequency = { name: string; mealId: string | null; count: number; calories: number; protein: number };

export async function getMealFrequency(db: Db, from: DateKey | null, to: DateKey, limit = 5): Promise<MealFrequency[]> {
  return db.getAllAsync<MealFrequency>(
    `SELECT name, max(meal_id) AS mealId, count(*) AS count, round(sum(calories)) AS calories, round(sum(protein), 1) AS protein
     FROM meal_logs WHERE log_date <= ? AND (? IS NULL OR log_date >= ?)
     GROUP BY coalesce(meal_id, name) ORDER BY count DESC, name LIMIT ?`,
    [to, from, from, limit],
  );
}

/** Recently logged meals for quick re-logging. */
export async function getRecentMealIds(db: Db, limit = 6): Promise<string[]> {
  const rows = await db.getAllAsync<{ mealId: string }>(
    `SELECT meal_id AS mealId FROM meal_logs WHERE meal_id IS NOT NULL
     GROUP BY meal_id ORDER BY max(logged_at) DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => r.mealId);
}

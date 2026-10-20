import {
  CATALOG,
  CATALOG_VERSION,
  DEFAULT_NAME,
  DEFAULT_START_WEIGHT,
  DEFAULT_TARGET_WEIGHT,
  DEFAULT_TARGETS,
  type CatalogMeal,
} from '@/data/catalog';
import { nowIso } from '@/lib/dates';
import { newId } from '@/lib/ids';
import type { Db } from './types';

export const SETTING_DEFAULTS: Record<string, string> = {
  'profile.name': DEFAULT_NAME,
  'weight.start': String(DEFAULT_START_WEIGHT),
  'weight.target': String(DEFAULT_TARGET_WEIGHT),
  'training.days': '[]',
  'appearance.theme': 'dark',
  'workout.default_rest': '90',
  'catalog.version': '0',
};

/** Goals that apply to every day before the first edit. */
export const INITIAL_GOAL_DATE = '2000-01-01';

/**
 * Idempotent: inserts defaults that are missing and catalog meals newer than the
 * applied catalog version. Existing rows (edited or archived meals, changed
 * settings) are never overwritten.
 */
export async function seedDatabase(db: Db, catalog: CatalogMeal[] = CATALOG, catalogVersion = CATALOG_VERSION): Promise<number> {
  let inserted = 0;
  const firstRun = (await db.getFirstAsync<{ value: string }>(`SELECT value FROM sync_metadata WHERE key = 'baseline_revision'`, [])) === null;

  await db.withTransactionAsync(async () => {
    const now = nowIso();
    for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
      await db.runAsync('INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [key, value, now]);
    }
    const goals = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM nutrition_goals', []);
    if (!goals?.n) {
      await db.runAsync(
        'INSERT INTO nutrition_goals (id, effective_from, calories, protein, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [newId(), INITIAL_GOAL_DATE, DEFAULT_TARGETS.calories, DEFAULT_TARGETS.protein, now, now],
      );
    }

    const applied = Number(
      (await db.getFirstAsync<{ value: string }>(`SELECT value FROM settings WHERE key = 'catalog.version'`, []))?.value ?? 0,
    );
    if (applied < catalogVersion) {
      for (const [index, meal] of catalog.entries()) {
        if (meal.since <= applied) continue;
        const exists = await db.getFirstAsync<{ id: string }>('SELECT id FROM meals WHERE seed_key = ?', [meal.seedKey]);
        if (exists) continue;
        const id = newId();
        await db.runAsync(
          `INSERT INTO meals (id, seed_key, code, name, category, calories, protein, is_estimate, prep_minutes, prep_label,
             notes, tag, is_favorite, is_custom, is_archived, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`,
          [id, meal.seedKey, meal.code, meal.name, meal.category, meal.calories, meal.protein, meal.isEstimate ? 1 : 0,
            meal.prepMinutes, meal.prepLabel, meal.notes, meal.tag, index, now, now],
        );
        for (const [position, text] of meal.ingredients.entries()) {
          await db.runAsync('INSERT INTO meal_ingredients (id, meal_id, position, text) VALUES (?, ?, ?, ?)', [newId(), id, position, text]);
        }
        inserted++;
      }
      await db.runAsync(`UPDATE settings SET value = ?, updated_at = ? WHERE key = 'catalog.version'`, [String(catalogVersion), now]);
    }

    // Everything written so far is factory data; only changes after this point need a backup.
    if (firstRun) {
      await db.runAsync(
        `INSERT INTO sync_metadata (key, value) SELECT 'baseline_revision', value FROM sync_metadata WHERE key = 'local_revision'`,
        [],
      );
    }
  });
  return inserted;
}

import type { Db } from '@/db/types';
import { isValidWeight, WEIGHT_RANGE_MESSAGE } from '@/domain/weight';
import { nowIso, type DateKey } from '@/lib/dates';
import { newId } from '@/lib/ids';

export type WeightEntry = { id: string; date: DateKey; weight: number; notes: string | null };

export async function listWeights(db: Db): Promise<WeightEntry[]> {
  return db.getAllAsync<WeightEntry>('SELECT id, date, weight_kg AS weight, notes FROM weight_entries ORDER BY date', []);
}

export async function getWeightForDate(db: Db, date: DateKey): Promise<WeightEntry | null> {
  return db.getFirstAsync<WeightEntry>('SELECT id, date, weight_kg AS weight, notes FROM weight_entries WHERE date = ?', [date]);
}

export async function getWeight(db: Db, id: string): Promise<WeightEntry | null> {
  return db.getFirstAsync<WeightEntry>('SELECT id, date, weight_kg AS weight, notes FROM weight_entries WHERE id = ?', [id]);
}

function validate(weight: number) {
  if (!isValidWeight(weight)) throw new Error(WEIGHT_RANGE_MESSAGE);
}

/** One measurement per day: logging a date that already has one replaces it. */
export async function saveWeight(db: Db, date: DateKey, weight: number, notes?: string | null): Promise<{ replaced: boolean }> {
  validate(weight);
  const now = nowIso();
  const existing = await getWeightForDate(db, date);
  await db.runAsync(
    `INSERT INTO weight_entries (id, date, weight_kg, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (date) DO UPDATE SET weight_kg = excluded.weight_kg, notes = excluded.notes, updated_at = excluded.updated_at`,
    [newId(), date, weight, notes?.trim() || null, now, now],
  );
  return { replaced: !!existing };
}

/** Edits an entry, including moving it to another date (fails if that date already has a measurement). */
export async function updateWeight(db: Db, id: string, date: DateKey, weight: number, notes?: string | null): Promise<void> {
  validate(weight);
  const clash = await getWeightForDate(db, date);
  if (clash && clash.id !== id) throw new Error('Ya hay un peso registrado ese día. Editá ese registro o elegí otra fecha.');
  await db.runAsync('UPDATE weight_entries SET date = ?, weight_kg = ?, notes = ?, updated_at = ? WHERE id = ?', [
    date, weight, notes?.trim() || null, nowIso(), id,
  ]);
}

export async function deleteWeight(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM weight_entries WHERE id = ?', [id]);
}

// ---- Milestones ----

export type Milestone = { id: string; weight: number; label: string | null };

export async function listMilestones(db: Db): Promise<Milestone[]> {
  return db.getAllAsync<Milestone>('SELECT id, weight_kg AS weight, label FROM milestones ORDER BY weight_kg', []);
}

export async function addMilestone(db: Db, weight: number, label?: string | null): Promise<void> {
  validate(weight);
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO milestones (id, weight_kg, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (weight_kg) DO UPDATE SET label = excluded.label, updated_at = excluded.updated_at`,
    [newId(), weight, label?.trim() || null, now, now],
  );
}

export async function deleteMilestone(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM milestones WHERE id = ?', [id]);
}

import type { Db } from '@/db/types';
import { nowIso, type DateKey } from '@/lib/dates';
import { newId } from '@/lib/ids';
import { markAttendance } from './attendance';

export const ACTIVITY_TYPES = [
  { key: 'caminata', label: 'Caminata', icon: 'walk' },
  { key: 'bicicleta', label: 'Bicicleta', icon: 'bike' },
  { key: 'correr', label: 'Correr', icon: 'run' },
  { key: 'natacion', label: 'Natación', icon: 'swim' },
  { key: 'futbol', label: 'Fútbol', icon: 'soccer' },
  { key: 'otra', label: 'Otra', icon: 'heart-pulse' },
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number]['key'];

export function activityLabel(type: string): string {
  return ACTIVITY_TYPES.find((t) => t.key === type)?.label ?? type;
}

export type Activity = { id: string; date: DateKey; type: ActivityType | string; minutes: number; distanceKm: number | null; notes: string | null };

const COLUMNS = 'id, date, type, minutes, distance_km AS distanceKm, notes';

export type ActivityInput = { date: DateKey; type: string; minutes: number; distanceKm?: number | null; notes?: string | null };

function validate(input: ActivityInput) {
  if (!(input.minutes >= 1 && input.minutes <= 1440)) throw new Error('Poné cuántos minutos duró (entre 1 y 1440).');
  if (input.distanceKm != null && !(input.distanceKm >= 0)) throw new Error('La distancia no puede ser negativa.');
}

/** Saves a free activity and counts that day as exercise (it does not create a gym session). */
export async function saveActivity(db: Db, input: ActivityInput, id?: string): Promise<string> {
  validate(input);
  const now = nowIso();
  const activityId = id ?? newId();
  await db.withTransactionAsync(async () => {
    if (id) {
      await db.runAsync(
        'UPDATE activities SET date = ?, type = ?, minutes = ?, distance_km = ?, notes = ?, updated_at = ? WHERE id = ?',
        [input.date, input.type, Math.round(input.minutes), input.distanceKm || null, input.notes?.trim() || null, now, id],
      );
    } else {
      await db.runAsync(
        `INSERT INTO activities (id, date, type, minutes, distance_km, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [activityId, input.date, input.type, Math.round(input.minutes), input.distanceKm || null, input.notes?.trim() || null, now, now],
      );
    }
    await markAttendance(db, input.date, 'manual');
  });
  return activityId;
}

export async function getActivity(db: Db, id: string): Promise<Activity | null> {
  return db.getFirstAsync<Activity>(`SELECT ${COLUMNS} FROM activities WHERE id = ?`, [id]);
}

export async function listActivities(db: Db, from?: DateKey, to?: DateKey, limit?: number): Promise<Activity[]> {
  return db.getAllAsync<Activity>(
    `SELECT ${COLUMNS} FROM activities WHERE (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?) ORDER BY date DESC, created_at DESC LIMIT ?`,
    [from ?? null, from ?? null, to ?? null, to ?? null, limit ?? -1],
  );
}

/** Removes the activity; the day stops counting as exercise only if nothing else happened that day. */
export async function deleteActivity(db: Db, id: string): Promise<void> {
  const activity = await getActivity(db, id);
  if (!activity) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM activities WHERE id = ?', [id]);
    const others = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM activities WHERE date = ?', [activity.date]);
    await db.runAsync(`DELETE FROM gym_attendance WHERE date = ? AND source = 'manual' AND ? = 0`, [activity.date, others?.n ?? 0]);
  });
}

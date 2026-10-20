import type { Db } from '@/db/types';
import type { DateKey } from '@/lib/dates';

export type CsvKind = 'comidas' | 'peso' | 'entrenamientos' | 'asistencia';

export const CSV_KINDS: { key: CsvKind; label: string }[] = [
  { key: 'comidas', label: 'Comidas' },
  { key: 'peso', label: 'Peso' },
  { key: 'entrenamientos', label: 'Entrenamientos (series)' },
  { key: 'asistencia', label: 'Asistencia' },
];

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

/** Builds a CSV of one kind of record within [from, to] (inclusive). */
export async function buildCsv(db: Db, kind: CsvKind, from: DateKey | null, to: DateKey): Promise<{ csv: string; rows: number }> {
  const p = [to, from, from];
  const range = (col: string) => `${col} <= ? AND (? IS NULL OR ${col} >= ?)`;
  if (kind === 'comidas') {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT log_date, category, name, portion, calories, protein, notes FROM meal_logs WHERE ${range('log_date')} ORDER BY log_date, logged_at`,
      p,
    );
    return { rows: rows.length, csv: toCsv(['fecha', 'categoria', 'comida', 'porcion', 'kcal', 'proteina_g', 'notas'], rows.map((r) => Object.values(r))) };
  }
  if (kind === 'peso') {
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT date, weight_kg, notes FROM weight_entries WHERE ${range('date')} ORDER BY date`, p);
    return { rows: rows.length, csv: toCsv(['fecha', 'peso_kg', 'notas'], rows.map((r) => Object.values(r))) };
  }
  if (kind === 'asistencia') {
    const rows = await db.getAllAsync<Record<string, unknown>>(`SELECT date, source FROM gym_attendance WHERE ${range('date')} ORDER BY date`, p);
    return { rows: rows.length, csv: toCsv(['fecha', 'origen'], rows.map((r) => [r.date, r.source === 'workout' ? 'entrenamiento' : 'manual'])) };
  }
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT ws.session_date, ws.routine_name, we.exercise_name, we.muscle_group, s.position + 1, s.reps, s.weight_kg
     FROM workout_sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id JOIN workout_sessions ws ON ws.id = we.session_id
     WHERE ws.status = 'completed' AND s.is_completed = 1 AND ${range('ws.session_date')}
     ORDER BY ws.session_date, ws.started_at, we.position, s.position`,
    p,
  );
  return {
    rows: rows.length,
    csv: toCsv(['fecha', 'rutina', 'ejercicio', 'grupo', 'serie', 'reps', 'peso_kg'], rows.map((r) => Object.values(r))),
  };
}

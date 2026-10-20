import { DATA_TABLES, SCHEMA_VERSION, type DataTable } from '@/db/schema';
import type { Db, SqlValue } from '@/db/types';
import { nowIso } from '@/lib/dates';
import { sha256 } from '@/lib/ids';

/**
 * A backup is a full, self-describing copy of every data table.
 * The same envelope is used for local JSON files and for cloud backups:
 *
 *   { format, checksum, snapshot }   where checksum = sha256(JSON.stringify(snapshot))
 */
export const BACKUP_FORMAT = 'momentum-backup';
export const BACKUP_FORMAT_VERSION = 1;

type Row = Record<string, SqlValue>;

export type Snapshot = {
  formatVersion: number;
  schemaVersion: number;
  createdAt: string;
  deviceId: string;
  localRevision: number;
  counts: Record<DataTable, number>;
  tables: Record<DataTable, Row[]>;
};

export type BackupEnvelope = { format: typeof BACKUP_FORMAT; checksum: string; snapshot: Snapshot };

export class BackupValidationError extends Error {}

// ---- sync_metadata helpers (local bookkeeping, never backed up) ----

export async function getMeta(db: Db, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_metadata WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setMeta(db: Db, key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db.runAsync('DELETE FROM sync_metadata WHERE key = ?', [key]);
    return;
  }
  await db.runAsync(
    'INSERT INTO sync_metadata (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export async function getRevision(db: Db, key: 'local_revision' | 'backed_up_revision' | 'baseline_revision'): Promise<number> {
  return Number((await getMeta(db, key)) ?? 0);
}

/** True once the user changed anything after the factory catalog was seeded. */
export async function hasUserChanges(db: Db): Promise<boolean> {
  return (await getRevision(db, 'local_revision')) > (await getRevision(db, 'baseline_revision'));
}

export async function getDeviceId(db: Db, makeId: () => string): Promise<string> {
  const existing = await getMeta(db, 'device_id');
  if (existing) return existing;
  const id = makeId();
  await setMeta(db, 'device_id', id);
  return id;
}

// ---- Export ----

const ORDER_BY: Partial<Record<DataTable, string>> = {
  settings: 'key',
  routine_schedule: 'weekday',
  gym_attendance: 'date',
  daily_notes: 'date',
};

export async function createSnapshot(db: Db, deviceId: string): Promise<Snapshot> {
  const tables = {} as Snapshot['tables'];
  const counts = {} as Snapshot['counts'];
  let localRevision = 0;
  // A transaction gives a consistent read across all tables.
  await db.withTransactionAsync(async () => {
    for (const table of DATA_TABLES) {
      const rows = await db.getAllAsync<Row>(`SELECT * FROM ${table} ORDER BY ${ORDER_BY[table] ?? 'id'}`, []);
      tables[table] = rows;
      counts[table] = rows.length;
    }
    localRevision = await getRevision(db, 'local_revision');
  });
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso(),
    deviceId,
    localRevision,
    counts,
    tables,
  };
}

export async function wrapSnapshot(snapshot: Snapshot): Promise<BackupEnvelope> {
  return { format: BACKUP_FORMAT, checksum: await sha256(JSON.stringify(snapshot)), snapshot };
}

// ---- Validation ----

/** Throws a BackupValidationError (with a message in Spanish) unless the envelope is intact and compatible. */
export async function validateEnvelope(input: unknown): Promise<BackupEnvelope> {
  if (!input || typeof input !== 'object') throw new BackupValidationError('El archivo no es un respaldo de Momentum.');
  const env = input as Partial<BackupEnvelope>;
  if (env.format !== BACKUP_FORMAT || !env.snapshot || typeof env.checksum !== 'string') {
    throw new BackupValidationError('El archivo no es un respaldo de Momentum.');
  }
  const actual = await sha256(JSON.stringify(env.snapshot));
  if (actual !== env.checksum) {
    throw new BackupValidationError('El respaldo está dañado o fue modificado (la verificación de integridad no coincide).');
  }
  const s = env.snapshot;
  if (s.formatVersion > BACKUP_FORMAT_VERSION || s.schemaVersion > SCHEMA_VERSION) {
    throw new BackupValidationError('Este respaldo es de una versión más nueva de la app. Actualizá Momentum antes de restaurarlo.');
  }
  if (!s.tables || typeof s.tables !== 'object') throw new BackupValidationError('El respaldo no tiene datos.');
  for (const table of DATA_TABLES) {
    const rows = s.tables[table];
    if (!Array.isArray(rows)) throw new BackupValidationError(`Al respaldo le falta la tabla "${table}".`);
    if (s.counts && s.counts[table] !== rows.length) {
      throw new BackupValidationError(`El respaldo está incompleto (tabla "${table}").`);
    }
  }
  return env as BackupEnvelope;
}

export function parseEnvelopeText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new BackupValidationError('El archivo no es un JSON válido.');
  }
}

// ---- Restore ----

/**
 * Replaces all local data with the snapshot in a single transaction: if any row
 * fails, nothing changes. Columns are matched by name, so a backup from an older
 * schema restores into a newer one (new columns take their defaults).
 */
export async function restoreSnapshot(db: Db, snapshot: Snapshot): Promise<void> {
  const columnsByTable = new Map<DataTable, Set<string>>();
  for (const table of DATA_TABLES) {
    const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`, []);
    columnsByTable.set(table, new Set(cols.map((c) => c.name)));
  }

  await db.withTransactionAsync(async () => {
    for (const table of [...DATA_TABLES].reverse()) {
      await db.runAsync(`DELETE FROM ${table}`, []);
    }
    for (const table of DATA_TABLES) {
      const allowed = columnsByTable.get(table)!;
      for (const row of snapshot.tables[table]) {
        const cols = Object.keys(row).filter((c) => allowed.has(c));
        if (cols.length === 0) continue;
        await db.runAsync(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => row[c] ?? null),
        );
      }
    }
    const violations = await db.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check', []);
    if (violations.length > 0) throw new BackupValidationError('El respaldo tiene referencias rotas y no se restauró.');
    // The restored data is exactly what the backup holds, so there is nothing new to upload.
    const rev = String(await getRevision(db, 'local_revision'));
    await setMeta(db, 'backed_up_revision', rev);
    await setMeta(db, 'baseline_revision', String(Number(rev) - 1));
  });
}

export function countUserRecords(snapshot: Snapshot): number {
  const t = snapshot.counts;
  return (
    t.meal_logs + t.weight_entries + t.workout_sessions + t.gym_attendance + t.workout_routines + t.exercises + t.milestones + t.daily_notes
  );
}

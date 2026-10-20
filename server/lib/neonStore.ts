import { neon } from '@neondatabase/serverless';
import type { BackupMeta, BackupStore, NewBackup } from './handlers';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS momentum_backups (
  id uuid PRIMARY KEY,
  device_id text NOT NULL,
  schema_version integer NOT NULL,
  local_revision bigint NOT NULL,
  checksum text NOT NULL,
  size_bytes integer NOT NULL,
  counts jsonb NOT NULL,
  payload text NOT NULL,
  created_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS momentum_backups_received_idx ON momentum_backups (received_at DESC);
`;

const META = `id, device_id AS "deviceId", schema_version AS "schemaVersion", local_revision::int AS "localRevision",
  checksum, size_bytes AS "sizeBytes", counts, created_at AS "createdAt", received_at AS "receivedAt"`;

type Row = Omit<BackupMeta, 'createdAt' | 'receivedAt'> & { createdAt: string | Date; receivedAt: string | Date };
const toMeta = (r: Row): BackupMeta => ({ ...r, createdAt: new Date(r.createdAt).toISOString(), receivedAt: new Date(r.receivedAt).toISOString() });

let schemaReady = false;

/** Postgres-backed store over Neon's HTTP driver (no connection pool needed for serverless). */
export function createNeonStore(databaseUrl: string | undefined): BackupStore {
  if (!databaseUrl) throw new Error('Falta DATABASE_URL en las variables de entorno.');
  const sql = neon(databaseUrl);
  return {
    async ensureSchema() {
      if (schemaReady) return;
      for (const statement of SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean)) await sql.query(statement);
      schemaReady = true;
    },
    async count() {
      const rows = (await sql.query('SELECT count(*)::int AS n FROM momentum_backups')) as { n: number }[];
      return rows[0]?.n ?? 0;
    },
    async list(limit) {
      const rows = (await sql.query(`SELECT ${META} FROM momentum_backups ORDER BY received_at DESC LIMIT $1`, [limit])) as Row[];
      return rows.map(toMeta);
    },
    async get(id) {
      const rows = (await (id === 'latest'
        ? sql.query(`SELECT ${META}, payload FROM momentum_backups ORDER BY received_at DESC LIMIT 1`)
        : sql.query(`SELECT ${META}, payload FROM momentum_backups WHERE id = $1`, [id]))) as (Row & { payload: string })[];
      const r = rows[0];
      return r ? { ...toMeta(r), payload: r.payload } : null;
    },
    async insert(b: NewBackup) {
      const inserted = (await sql.query(
        `INSERT INTO momentum_backups (id, device_id, schema_version, local_revision, checksum, size_bytes, counts, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) ON CONFLICT (id) DO NOTHING RETURNING received_at AS "receivedAt"`,
        [b.id, b.deviceId, b.schemaVersion, b.localRevision, b.checksum, b.sizeBytes, JSON.stringify(b.counts), b.payload, b.createdAt],
      )) as { receivedAt: string }[];
      if (inserted[0]) return { inserted: true, receivedAt: new Date(inserted[0].receivedAt).toISOString() };
      const existing = (await sql.query('SELECT received_at AS "receivedAt" FROM momentum_backups WHERE id = $1', [b.id])) as { receivedAt: string }[];
      return { inserted: false, receivedAt: new Date(existing[0]?.receivedAt ?? Date.now()).toISOString() };
    },
    async prune(keep) {
      const rows = (await sql.query(
        `DELETE FROM momentum_backups WHERE id IN (SELECT id FROM momentum_backups ORDER BY received_at DESC OFFSET $1) RETURNING id`,
        [keep],
      )) as unknown[];
      return rows.length;
    },
  };
}

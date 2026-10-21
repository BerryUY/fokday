import { neon } from '@neondatabase/serverless';
import type { BackupMeta, BackupStore, NewBackup, Profile } from './handlers';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS momentum_profiles (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS momentum_backups (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES momentum_profiles (id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS momentum_backups_profile_idx ON momentum_backups (profile_id, received_at DESC)
`;

const META = `id, device_id AS "deviceId", schema_version AS "schemaVersion", local_revision::int AS "localRevision",
  checksum, size_bytes AS "sizeBytes", counts, created_at AS "createdAt", received_at AS "receivedAt"`;

type Row = Omit<BackupMeta, 'createdAt' | 'receivedAt'> & { createdAt: string | Date; receivedAt: string | Date };
const toMeta = (r: Row): BackupMeta => ({ ...r, createdAt: new Date(r.createdAt).toISOString(), receivedAt: new Date(r.receivedAt).toISOString() });

type ProfileRow = Omit<Profile, 'createdAt'> & { createdAt: string | Date };
const PROFILE = `id, name, plan, created_at AS "createdAt"`;
const toProfile = (r: ProfileRow): Profile => ({ ...r, createdAt: new Date(r.createdAt).toISOString() });

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
    async countProfiles() {
      const rows = (await sql.query('SELECT count(*)::int AS n FROM momentum_profiles')) as { n: number }[];
      return rows[0]?.n ?? 0;
    },
    async createProfile(p) {
      const rows = (await sql.query(
        `INSERT INTO momentum_profiles (id, name, token_hash) VALUES ($1, $2, $3) RETURNING ${PROFILE}`,
        [p.id, p.name, p.tokenHash],
      )) as ProfileRow[];
      return toProfile(rows[0]);
    },
    async findProfileByTokenHash(tokenHash) {
      const rows = (await sql.query(`SELECT ${PROFILE} FROM momentum_profiles WHERE token_hash = $1`, [tokenHash])) as ProfileRow[];
      return rows[0] ? toProfile(rows[0]) : null;
    },
    async count(profileId) {
      const rows = (await sql.query('SELECT count(*)::int AS n FROM momentum_backups WHERE profile_id = $1', [profileId])) as { n: number }[];
      return rows[0]?.n ?? 0;
    },
    async list(profileId, limit) {
      const rows = (await sql.query(
        `SELECT ${META} FROM momentum_backups WHERE profile_id = $1 ORDER BY received_at DESC LIMIT $2`,
        [profileId, limit],
      )) as Row[];
      return rows.map(toMeta);
    },
    async get(profileId, id) {
      const rows = (await (id === 'latest'
        ? sql.query(`SELECT ${META}, payload FROM momentum_backups WHERE profile_id = $1 ORDER BY received_at DESC LIMIT 1`, [profileId])
        : sql.query(`SELECT ${META}, payload FROM momentum_backups WHERE profile_id = $1 AND id = $2`, [profileId, id]))) as (Row & { payload: string })[];
      const r = rows[0];
      return r ? { ...toMeta(r), payload: r.payload } : null;
    },
    async insert(profileId, b: NewBackup) {
      const inserted = (await sql.query(
        `INSERT INTO momentum_backups (id, profile_id, device_id, schema_version, local_revision, checksum, size_bytes, counts, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10) ON CONFLICT (id) DO NOTHING RETURNING received_at AS "receivedAt"`,
        [b.id, profileId, b.deviceId, b.schemaVersion, b.localRevision, b.checksum, b.sizeBytes, JSON.stringify(b.counts), b.payload, b.createdAt],
      )) as { receivedAt: string }[];
      if (inserted[0]) return { inserted: true, receivedAt: new Date(inserted[0].receivedAt).toISOString() };
      const existing = (await sql.query('SELECT received_at AS "receivedAt" FROM momentum_backups WHERE id = $1 AND profile_id = $2', [b.id, profileId])) as { receivedAt: string }[];
      return { inserted: false, receivedAt: new Date(existing[0]?.receivedAt ?? Date.now()).toISOString() };
    },
    async prune(profileId, keep) {
      const rows = (await sql.query(
        `DELETE FROM momentum_backups WHERE id IN (
           SELECT id FROM momentum_backups WHERE profile_id = $1 ORDER BY received_at DESC OFFSET $2) RETURNING id`,
        [profileId, keep],
      )) as unknown[];
      return rows.length;
    },
  };
}

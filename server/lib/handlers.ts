import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Backup API logic, independent of Vercel and Postgres so it can be unit-tested.
 * One user, one token, versioned full snapshots. Nothing here ever deletes the
 * newest backups: pruning only removes the oldest beyond the retention limit.
 */

export type BackupMeta = {
  id: string;
  deviceId: string;
  schemaVersion: number;
  localRevision: number;
  checksum: string;
  sizeBytes: number;
  counts: Record<string, number>;
  createdAt: string;
  receivedAt: string;
};

export type NewBackup = Omit<BackupMeta, 'receivedAt'> & { payload: string };

export interface BackupStore {
  ensureSchema(): Promise<void>;
  count(): Promise<number>;
  list(limit: number): Promise<BackupMeta[]>;
  get(id: string | 'latest'): Promise<(BackupMeta & { payload: string }) | null>;
  /** Inserts unless the id exists. Returns the stored receivedAt either way. */
  insert(backup: NewBackup): Promise<{ inserted: boolean; receivedAt: string }>;
  /** Deletes all but the newest `keep` backups. */
  prune(keep: number): Promise<number>;
}

export type ApiRequest = { method: string; headers: Record<string, string | string[] | undefined>; body: unknown; id?: string };
export type ApiResponse = { status: number; json?: unknown; raw?: string };

export type Env = { token: string | undefined; maxBackups: number };

/** Vercel rejects request bodies over 4.5 MB; stay a little under. */
export const MAX_PAYLOAD_BYTES = 4_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();

export function checkAuth(header: string | string[] | undefined, token: string | undefined): ApiResponse | null {
  if (!token || token.length < 32) {
    return { status: 500, json: { error: 'El servidor no tiene configurado MOMENTUM_API_TOKEN (mínimo 32 caracteres).' } };
  }
  const value = Array.isArray(header) ? header[0] : header;
  const given = value?.startsWith('Bearer ') ? value.slice(7) : '';
  // Compare fixed-length digests so the check takes the same time for any input.
  if (!given || !timingSafeEqual(sha256(given), sha256(token))) {
    return { status: 401, json: { error: 'Token inválido.' } };
  }
  return null;
}

export async function handleStatus(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const denied = checkAuth(req.headers.authorization, env.token);
  if (denied) return denied;
  if (req.method !== 'GET') return { status: 405, json: { error: 'Método no permitido.' } };
  await store.ensureSchema();
  const [count, latest] = await Promise.all([store.count(), store.list(1)]);
  return { status: 200, json: { ok: true, count, latest: latest[0] ?? null } };
}

export async function handleBackups(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const denied = checkAuth(req.headers.authorization, env.token);
  if (denied) return denied;
  await store.ensureSchema();

  if (req.method === 'GET') {
    return { status: 200, json: { backups: await store.list(50) } };
  }
  if (req.method !== 'POST') return { status: 405, json: { error: 'Método no permitido.' } };

  const body = req.body as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return { status: 400, json: { error: 'Cuerpo inválido.' } };
  const { id, deviceId, schemaVersion, localRevision, createdAt, counts, checksum, snapshot } = body;
  if (typeof id !== 'string' || !UUID.test(id)) return { status: 400, json: { error: 'id inválido.' } };
  if (typeof checksum !== 'string' || !HEX64.test(checksum)) return { status: 400, json: { error: 'checksum inválido.' } };
  if (!snapshot || typeof snapshot !== 'object') return { status: 400, json: { error: 'Falta el snapshot.' } };
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) return { status: 400, json: { error: 'createdAt inválido.' } };

  const payload = JSON.stringify(snapshot);
  const sizeBytes = Buffer.byteLength(payload, 'utf8');
  if (sizeBytes > MAX_PAYLOAD_BYTES) return { status: 413, json: { error: 'El respaldo supera el tamaño máximo aceptado.' } };
  if (sha256(payload).toString('hex') !== checksum) {
    return { status: 400, json: { error: 'El respaldo llegó dañado (checksum no coincide). Se reintentará.' } };
  }

  const result = await store.insert({
    id,
    deviceId: String(deviceId ?? ''),
    schemaVersion: Number(schemaVersion) || 0,
    localRevision: Number(localRevision) || 0,
    checksum,
    sizeBytes,
    counts: counts && typeof counts === 'object' ? (counts as Record<string, number>) : {},
    createdAt,
    payload,
  });
  if (result.inserted) await store.prune(env.maxBackups);
  return { status: result.inserted ? 201 : 200, json: { id, duplicate: !result.inserted, receivedAt: result.receivedAt } };
}

export async function handleBackupById(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const denied = checkAuth(req.headers.authorization, env.token);
  if (denied) return denied;
  if (req.method !== 'GET') return { status: 405, json: { error: 'Método no permitido.' } };
  const id = req.id ?? '';
  if (id !== 'latest' && !UUID.test(id)) return { status: 400, json: { error: 'id inválido.' } };
  await store.ensureSchema();
  const backup = await store.get(id);
  if (!backup) return { status: 404, json: { error: 'No hay ningún respaldo con ese id.' } };
  const { payload, ...meta } = backup;
  // The snapshot is sent byte-for-byte as stored, so the app's checksum check is exact.
  return { status: 200, raw: `${JSON.stringify(meta).slice(0, -1)},"snapshot":${payload}}` };
}

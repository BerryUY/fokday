import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Backup API logic, independent of Vercel and Postgres so it can be unit-tested.
 * Each person has a profile with its own secret token (only its hash is stored) and
 * versioned full snapshots that nobody else can read. Profiles are created with an
 * invite code. Nothing here ever deletes the newest backups: pruning only removes the
 * oldest beyond the retention limit.
 */

export type Profile = { id: string; name: string; plan: string; createdAt: string };

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
  countProfiles(): Promise<number>;
  createProfile(profile: { id: string; name: string; tokenHash: string }): Promise<Profile>;
  findProfileByTokenHash(tokenHash: string): Promise<Profile | null>;
  count(profileId: string): Promise<number>;
  list(profileId: string, limit: number): Promise<BackupMeta[]>;
  get(profileId: string, id: string | 'latest'): Promise<(BackupMeta & { payload: string }) | null>;
  /** Inserts unless the id exists. Returns the stored receivedAt either way. */
  insert(profileId: string, backup: NewBackup): Promise<{ inserted: boolean; receivedAt: string }>;
  /** Deletes all but the profile's newest `keep` backups. */
  prune(profileId: string, keep: number): Promise<number>;
}

export type ApiRequest = { method: string; headers: Record<string, string | string[] | undefined>; body: unknown; id?: string };
export type ApiResponse = { status: number; json?: unknown; raw?: string };

export type Env = { inviteCode: string | undefined; maxBackups: number; maxProfiles: number };

/** Vercel rejects request bodies over 4.5 MB; stay a little under. */
export const MAX_PAYLOAD_BYTES = 4_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();

const tokenHash = (token: string) => sha256(token).toString('hex');

// Compare fixed-length digests so the check takes the same time for any input.
const sameSecret = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b));

/** Finds the profile that owns the Bearer token, or the 401 to answer with. */
export async function authenticate(header: string | string[] | undefined, store: BackupStore): Promise<{ profile: Profile } | { denied: ApiResponse }> {
  const value = Array.isArray(header) ? header[0] : header;
  const given = value?.startsWith('Bearer ') ? value.slice(7).trim() : '';
  if (given.length < 32) return { denied: { status: 401, json: { error: 'Token inválido.' } } };
  await store.ensureSchema();
  const profile = await store.findProfileByTokenHash(tokenHash(given));
  return profile ? { profile } : { denied: { status: 401, json: { error: 'Token inválido.' } } };
}

/** Creates a profile (and its secret token, shown to the person only once). Needs the owner's invite code. */
export async function handleProfiles(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  if (req.method !== 'POST') return { status: 405, json: { error: 'Método no permitido.' } };
  if (!env.inviteCode || env.inviteCode.length < 8) {
    return { status: 500, json: { error: 'El servidor no tiene configurado INVITE_CODE (mínimo 8 caracteres).' } };
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.inviteCode !== 'string' || !sameSecret(body.inviteCode.trim(), env.inviteCode)) {
    return { status: 403, json: { error: 'El código de invitación no es válido.' } };
  }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  await store.ensureSchema();
  if ((await store.countProfiles()) >= env.maxProfiles) {
    return { status: 403, json: { error: 'Se alcanzó el máximo de perfiles de este servidor.' } };
  }
  const token = `mom_${randomBytes(32).toString('hex')}`;
  const profile = await store.createProfile({ id: randomUUID(), name: name || 'Sin nombre', tokenHash: tokenHash(token) });
  return { status: 201, json: { profile, token } };
}

export async function handleStatus(req: ApiRequest, store: BackupStore, _env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store);
  if ('denied' in auth) return auth.denied;
  if (req.method !== 'GET') return { status: 405, json: { error: 'Método no permitido.' } };
  const [count, latest] = await Promise.all([store.count(auth.profile.id), store.list(auth.profile.id, 1)]);
  return { status: 200, json: { ok: true, profile: auth.profile, count, latest: latest[0] ?? null } };
}

export async function handleBackups(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store);
  if ('denied' in auth) return auth.denied;
  const profileId = auth.profile.id;

  if (req.method === 'GET') {
    return { status: 200, json: { backups: await store.list(profileId, 50) } };
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

  const result = await store.insert(profileId, {
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
  if (result.inserted) await store.prune(profileId, env.maxBackups);
  return { status: result.inserted ? 201 : 200, json: { id, duplicate: !result.inserted, receivedAt: result.receivedAt } };
}

export async function handleBackupById(req: ApiRequest, store: BackupStore, _env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store);
  if ('denied' in auth) return auth.denied;
  if (req.method !== 'GET') return { status: 405, json: { error: 'Método no permitido.' } };
  const id = req.id ?? '';
  if (id !== 'latest' && !UUID.test(id)) return { status: 400, json: { error: 'id inválido.' } };
  const backup = await store.get(auth.profile.id, id);
  if (!backup) return { status: 404, json: { error: 'No hay ningún respaldo con ese id.' } };
  const { payload, ...meta } = backup;
  // The snapshot is sent byte-for-byte as stored, so the app's checksum check is exact.
  return { status: 200, raw: `${JSON.stringify(meta).slice(0, -1)},"snapshot":${payload}}` };
}

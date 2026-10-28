import { Buffer } from 'node:buffer';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Backup API logic, independent of the runtime (Supabase Edge Functions) and of the
 * storage so it can be unit-tested. Each person has a profile with its own secret token
 * (only its hash is stored) and versioned full snapshots that nobody else can read.
 * Profiles are created with the owner's invite code.
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
  countProfiles(): Promise<number>;
  createProfile(profile: { id: string; name: string; tokenHash: string }): Promise<Profile>;
  findProfileByTokenHash(tokenHash: string): Promise<Profile | null>;
  setTokenHash(profileId: string, tokenHash: string): Promise<void>;
  /** Removes the profile and every backup it owns. */
  deleteProfile(profileId: string): Promise<void>;
  count(profileId: string): Promise<number>;
  /** Newest first. */
  list(profileId: string, limit: number): Promise<BackupMeta[]>;
  get(profileId: string, id: string | 'latest'): Promise<(BackupMeta & { payload: string }) | null>;
  /** Inserts unless the id exists. Returns the stored receivedAt either way. */
  insert(profileId: string, backup: NewBackup): Promise<{ inserted: boolean; receivedAt: string }>;
  remove(profileId: string, ids: string[]): Promise<void>;
  /** AI photo analyses used by a profile on a UTC day (YYYY-MM-DD). */
  aiUsage(profileId: string, day: string): Promise<number>;
  addAiUsage(profileId: string, day: string): Promise<void>;
  /** Newest first; empty query lists the latest. */
  searchPublicFoods(query: string, limit: number): Promise<(PublicFood & { profileId: string })[]>;
  countPublicFoods(profileId: string): Promise<number>;
  createPublicFood(profileId: string, food: PublicFoodInput): Promise<PublicFood>;
  /** Only the author can delete; false when nothing was deleted. */
  deletePublicFood(profileId: string, id: string): Promise<boolean>;
}

/** What the AI reads from a food photo (all values for the whole visible portion). */
export type FoodAnalysis = {
  name: string;
  items: { name: string; grams: number }[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  confidence: 'alta' | 'media' | 'baja';
};

export const FOOD_CATEGORIES = ['desayuno', 'almuerzo', 'merienda', 'cena', 'extra'] as const;
export const EXTRA_KEYS = ['carbs', 'fat', 'fiber', 'dairy'] as const;

export type PublicFoodInput = {
  name: string;
  category: (typeof FOOD_CATEGORIES)[number];
  calories: number;
  protein: number;
  extras: Partial<Record<(typeof EXTRA_KEYS)[number], number>>;
  ingredients: string[];
};
export type PublicFood = PublicFoodInput & { id: string; createdAt: string; mine?: boolean };

export type ApiRequest = { method: string; headers: Record<string, string | string[] | undefined>; body: unknown; id?: string; query?: Record<string, string> };
export type ApiResponse = { status: number; json?: unknown; raw?: string };

export type Env = {
  /** sha256 (hex) of the owner's invite code. Without it nobody can create profiles. */
  inviteCodeHash: string | undefined;
  maxProfiles: number;
  /** Automatic uploads closer together than this are refused (the app retries later). */
  minUploadIntervalSeconds: number;
  /** AI photo analyses allowed per profile per day (keeps the AI bill bounded). */
  aiDailyLimit?: number;
  /** Reads a JPEG (base64) and estimates its nutrition. Missing when the server has no AI key. */
  analyzeFood?: (jpegBase64: string) => Promise<FoodAnalysis>;
  now?: () => Date;
};

/** A ~1 MB JPEG is plenty for a food photo; the app sends ~100 KB. */
export const MAX_IMAGE_BASE64 = 1_500_000;
export const MAX_PUBLIC_FOODS_PER_PROFILE = 200;

/** Request bodies are kept under a few MB; the app's snapshots are far smaller. */
export const MAX_PAYLOAD_BYTES = 4_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();
export const sha256Hex = (s: string) => sha256(s).toString('hex');
const newToken = () => `mom_${randomBytes(32).toString('hex')}`;
const denied401: ApiResponse = { status: 401, json: { error: 'Token inválido.' } };

/** Finds the profile that owns the Bearer token, or the 401 to answer with. */
export async function authenticate(header: string | string[] | undefined, store: BackupStore): Promise<{ profile: Profile } | { denied: ApiResponse }> {
  const value = Array.isArray(header) ? header[0] : header;
  const given = value?.startsWith('Bearer ') ? value.slice(7).trim() : '';
  if (given.length < 32) return { denied: denied401 };
  const profile = await store.findProfileByTokenHash(sha256Hex(given));
  return profile ? { profile } : { denied: denied401 };
}

/**
 * Which backups to keep: the 3 newest plus the newest of each of the last 7 days.
 * That covers "undo today's mistake" and "go back a few days" with ~10 copies, not 60.
 */
export function backupsToKeep(backups: Pick<BackupMeta, 'id' | 'receivedAt'>[], now: Date): Set<string> {
  const sorted = [...backups].sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
  const keep = new Set(sorted.slice(0, 3).map((b) => b.id));
  const since = now.getTime() - 7 * 86_400_000;
  const seenDays = new Set<string>();
  for (const b of sorted) {
    if (Date.parse(b.receivedAt) < since) break;
    const day = b.receivedAt.slice(0, 10);
    if (!seenDays.has(day)) {
      seenDays.add(day);
      keep.add(b.id);
    }
  }
  return keep;
}

/** POST profiles: creates a profile and its secret token (shown to the person only once). */
export async function handleCreateProfile(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  if (req.method !== 'POST') return { status: 405, json: { error: 'Método no permitido.' } };
  if (!env.inviteCodeHash || !HEX64.test(env.inviteCodeHash)) {
    return { status: 500, json: { error: 'El servidor no tiene configurado el código de invitación.' } };
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const given = typeof body.inviteCode === 'string' ? body.inviteCode.trim() : '';
  // Compare fixed-length digests so the check takes the same time for any input.
  if (!given || !timingSafeEqual(sha256(given), Buffer.from(env.inviteCodeHash, 'hex'))) {
    return { status: 403, json: { error: 'El código de invitación no es válido.' } };
  }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  if ((await store.countProfiles()) >= env.maxProfiles) {
    return { status: 403, json: { error: 'Se alcanzó el máximo de perfiles de este servidor.' } };
  }
  const token = newToken();
  const profile = await store.createProfile({ id: randomUUID(), name: name || 'Sin nombre', tokenHash: sha256Hex(token) });
  return { status: 201, json: { profile, token } };
}

/** DELETE profiles/me removes the profile and all its backups; POST profiles/me/token issues a new token. */
export async function handleMe(req: ApiRequest, store: BackupStore, _env: Env, action: 'delete' | 'rotate'): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store);
  if ('denied' in auth) return auth.denied;
  if (action === 'delete') {
    if (req.method !== 'DELETE') return { status: 405, json: { error: 'Método no permitido.' } };
    await store.deleteProfile(auth.profile.id);
    return { status: 200, json: { deleted: true } };
  }
  if (req.method !== 'POST') return { status: 405, json: { error: 'Método no permitido.' } };
  const token = newToken();
  await store.setTokenHash(auth.profile.id, sha256Hex(token));
  return { status: 200, json: { token } };
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
  const { id, deviceId, schemaVersion, localRevision, createdAt, counts, checksum, snapshot, manual } = body;
  if (typeof id !== 'string' || !UUID.test(id)) return { status: 400, json: { error: 'id inválido.' } };
  if (typeof checksum !== 'string' || !HEX64.test(checksum)) return { status: 400, json: { error: 'checksum inválido.' } };
  if (!snapshot || typeof snapshot !== 'object') return { status: 400, json: { error: 'Falta el snapshot.' } };
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) return { status: 400, json: { error: 'createdAt inválido.' } };

  const payload = JSON.stringify(snapshot);
  const sizeBytes = Buffer.byteLength(payload, 'utf8');
  if (sizeBytes > MAX_PAYLOAD_BYTES) return { status: 413, json: { error: 'El respaldo supera el tamaño máximo aceptado.' } };
  if (sha256Hex(payload) !== checksum) {
    return { status: 400, json: { error: 'El respaldo llegó dañado (checksum no coincide). Se reintentará.' } };
  }

  const now = (env.now ?? (() => new Date()))();
  const recent = await store.list(profileId, 20);
  const duplicate = recent.find((b) => b.id === id);
  if (duplicate) return { status: 200, json: { id, duplicate: true, receivedAt: duplicate.receivedAt } };
  // Guard against a client stuck in a loop; normal use uploads far less often.
  const last = recent[0];
  if (manual !== true && last && now.getTime() - Date.parse(last.receivedAt) < env.minUploadIntervalSeconds * 1000) {
    return { status: 429, json: { error: 'Hay un respaldo de hace un momento. Se vuelve a intentar más tarde.' } };
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
  if (result.inserted) {
    const all = [...recent, { id, receivedAt: result.receivedAt }];
    const keep = backupsToKeep(all, now);
    const drop = all.filter((b) => !keep.has(b.id)).map((b) => b.id);
    if (drop.length) await store.remove(profileId, drop);
  }
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

/** Routes `/api/<path>` to its handler. Shared by the Edge Function and the tests. */
export async function handleRequest(path: string, req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const clean = path.replace(/^\/+|\/+$/g, '');
  if (clean === 'profiles') return handleCreateProfile(req, store, env);
  if (clean === 'profiles/me') return handleMe(req, store, env, 'delete');
  if (clean === 'profiles/me/token') return handleMe(req, store, env, 'rotate');
  if (clean === 'status') return handleStatus(req, store, env);
  if (clean === 'backups') return handleBackups(req, store, env);
  if (clean.startsWith('backups/')) return handleBackupById({ ...req, id: decodeURIComponent(clean.slice('backups/'.length)) }, store, env);
  if (clean === 'food/analyze') return handleAnalyzeFood(req, store, env);
  if (clean === 'food/library') return handlePublicFoods(req, store, env);
  if (clean.startsWith('food/library/')) return handleDeletePublicFood({ ...req, id: decodeURIComponent(clean.slice('food/library/'.length)) }, store, env);
  return { status: 404, json: { error: 'Ruta desconocida.' } };
}

// ---------- Food: AI photo analysis and the public library ----------

const num = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);

/** POST food/analyze { image: base64 JPEG } → { food: FoodAnalysis, remaining } */
export async function handleAnalyzeFood(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store);
  if ('denied' in auth) return auth.denied;
  if (req.method !== 'POST') return { status: 405, json: { error: 'Método no permitido.' } };
  if (!env.analyzeFood) return { status: 503, json: { error: 'El análisis con IA todavía no está activado en el servidor.' } };
  const image = (req.body as { image?: unknown } | null)?.image;
  if (typeof image !== 'string' || image.length < 100 || image.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return { status: 400, json: { error: 'La foto no es válida o es demasiado grande.' } };
  }
  const day = (env.now ?? (() => new Date()))().toISOString().slice(0, 10);
  const limit = env.aiDailyLimit ?? 30;
  const used = await store.aiUsage(auth.profile.id, day);
  if (used >= limit) {
    return { status: 429, json: { error: 'Llegaste a las ' + limit + ' fotos con IA de hoy. Mañana se renueva; mientras tanto podés cargarla a mano.' } };
  }
  let food: FoodAnalysis;
  try {
    food = await env.analyzeFood(image);
  } catch (e) {
    const message = e instanceof Error && e.message.startsWith('IA:') ? e.message.slice(3).trim() : 'No pudimos analizar la foto. Probá de nuevo.';
    return { status: 502, json: { error: message } };
  }
  await store.addAiUsage(auth.profile.id, day);
  return { status: 200, json: { food, remaining: Math.max(0, limit - used - 1) } };
}

function validatePublicFood(body: unknown): PublicFoodInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
  if (!name) return 'La comida necesita un nombre.';
  const category = FOOD_CATEGORIES.find((c) => c === b.category);
  if (!category) return 'Categoría inválida.';
  const calories = num(b.calories, 20000);
  const protein = num(b.protein, 1500);
  if (calories === null || protein === null) return 'Calorías o proteína inválidas.';
  const extras: PublicFoodInput['extras'] = {};
  const rawExtras = (b.extras ?? {}) as Record<string, unknown>;
  for (const k of EXTRA_KEYS) {
    const v = num(rawExtras[k], 3000);
    if (v) extras[k] = Math.round(v * 10) / 10;
  }
  const ingredients = Array.isArray(b.ingredients)
    ? b.ingredients.filter((i): i is string => typeof i === 'string').map((i) => i.trim().slice(0, 120)).filter(Boolean).slice(0, 30)
    : [];
  return { name, category, calories: Math.round(calories), protein: Math.round(protein * 10) / 10, extras, ingredients };
}

/** GET food/library?q= searches; POST shares one of your foods. */
export async function handlePublicFoods(req: ApiRequest, store: BackupStore, _env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store);
  if ('denied' in auth) return auth.denied;
  if (req.method === 'GET') {
    const q = (req.query?.q ?? '').trim().slice(0, 60);
    const found = await store.searchPublicFoods(q, 40);
    // Who shared a food is never exposed, only whether it was you (so you can remove it).
    return { status: 200, json: { foods: found.map(({ profileId, ...f }) => ({ ...f, mine: profileId === auth.profile.id })) } };
  }
  if (req.method !== 'POST') return { status: 405, json: { error: 'Método no permitido.' } };
  const input = validatePublicFood(req.body);
  if (typeof input === 'string') return { status: 400, json: { error: input } };
  if ((await store.countPublicFoods(auth.profile.id)) >= MAX_PUBLIC_FOODS_PER_PROFILE) {
    return { status: 403, json: { error: 'Ya compartiste el máximo de comidas permitido.' } };
  }
  const food = await store.createPublicFood(auth.profile.id, input);
  return { status: 201, json: { food: { ...food, mine: true } } };
}

export async function handleDeletePublicFood(req: ApiRequest, store: BackupStore, _env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store);
  if ('denied' in auth) return auth.denied;
  if (req.method !== 'DELETE') return { status: 405, json: { error: 'Método no permitido.' } };
  if (!UUID.test(req.id ?? '')) return { status: 400, json: { error: 'id inválido.' } };
  const deleted = await store.deletePublicFood(auth.profile.id, req.id!);
  return deleted ? { status: 200, json: { deleted: true } } : { status: 404, json: { error: 'No encontramos esa comida entre las que compartiste.' } };
}

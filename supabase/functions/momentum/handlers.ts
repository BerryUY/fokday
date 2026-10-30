import { Buffer } from 'node:buffer';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Backup API logic, independent of the runtime (Supabase Edge Functions) and of the
 * storage so it can be unit-tested. Each person has a profile and versioned full snapshots
 * that nobody else can read. People sign in with a Supabase account (Google or email); the
 * profile is created on first use. Older installs still use their own secret token (only its
 * hash is stored) until they link it to an account.
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
  createProfile(profile: { id: string; name: string; tokenHash: string; authUserId?: string }): Promise<Profile>;
  findProfileByTokenHash(tokenHash: string): Promise<Profile | null>;
  findProfileByAuthUser(authUserId: string): Promise<Profile | null>;
  /** Attaches a Supabase account to an existing profile. */
  setAuthUser(profileId: string, authUserId: string): Promise<void>;
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
  /** Uses of a limited feature on one of the person's days (YYYY-MM-DD), and rewarded videos watched for it. */
  usage(profileId: string, day: string, kind: QuotaKind): Promise<{ count: number; videos: number }>;
  /** Reserves one use only while count < limit (atomic, so parallel requests cannot pass the limit). */
  tryUse(profileId: string, day: string, kind: QuotaKind, limit: number): Promise<boolean>;
  /** Gives a reserved use back when the work behind it failed. */
  refundUse(profileId: string, day: string, kind: QuotaKind): Promise<void>;
  /** Counts one rewarded video; false when that transaction was already counted. */
  addVideo(profileId: string, day: string, kind: QuotaKind, transactionId: string): Promise<boolean>;
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

export type ApiRequest = { method: string; headers: Record<string, string | string[] | undefined>; body: unknown; id?: string; query?: Record<string, string>; rawQuery?: string };
export type ApiResponse = { status: number; json?: unknown; raw?: string };

/** A signed-in Supabase account, as verified from its access token. */
export type AuthUser = { id: string; email: string | null; name: string | null };

/** Compact numbers of one week, built on the phone, for the Pro weekly summary. */
export type WeekInput = Record<string, unknown>;
/** The Pro weekly summary: a title, wins, what to improve, a 3-step plan, one tip and next week's focus. */
export type WeekSummary = { title: string; wins: string[]; improve: string[]; plan: string[]; tip: string; focus: string };

export type Env = {
  /** sha256 (hex) of the owner's invite code (legacy sign-up without an account). */
  inviteCodeHash: string | undefined;
  maxProfiles: number;
  /** Automatic uploads closer together than this are refused (the app retries later). */
  minUploadIntervalSeconds: number;
  /** Daily limits per feature (AI photo, barcode); anything missing uses QUOTA_DEFAULTS. */
  limits?: { [K in QuotaKind]?: Partial<LimitSet> };
  /** Looks a barcode up in Open Food Facts; null when the product is unknown. */
  lookupBarcode?: (code: string) => Promise<BarcodeProduct | null>;
  /** Reads a JPEG (base64) and estimates its nutrition; Pro goes through the paid key. Missing when the server has no AI key. */
  analyzeFood?: (jpegBase64: string, opts?: { pro: boolean }) => Promise<FoodAnalysis>;
  /** Writes the Pro weekly summary from the week's numbers. */
  summarizeWeek?: (week: WeekInput) => Promise<WeekSummary>;
  /** Checks a Supabase access token; null when it is invalid or expired. */
  verifyAuthToken?: (jwt: string) => Promise<AuthUser | null>;
  /** Removes the Supabase account itself (account deletion). */
  deleteAuthUser?: (authUserId: string) => Promise<void>;
  /** Whether this account has an active Pro subscription (RevenueCat). */
  checkPro?: (authUserId: string) => Promise<boolean>;
  /** Verifies a rewarded-video callback from AdMob (signature over the query string). */
  verifyAdReward?: (rawQuery: string) => Promise<boolean>;
  now?: () => Date;
};

/**
 * The limited features. Free: a few per day, plus extras earned with rewarded videos
 * (videosPerExtra videos = 1 more, up to bonusMax extras). Pro: a high daily cap.
 */
export type QuotaKind = 'photo' | 'barcode' | 'summary';
export type LimitSet = { free: number; bonusMax: number; videosPerExtra: number; pro: number };
export const QUOTA_DEFAULTS: Record<QuotaKind, LimitSet> = {
  photo: { free: 1, bonusMax: 1, videosPerExtra: 1, pro: 20 },
  // A Pro feature with a free taste. No AI behind it (Open Food Facts is free), so the
  // limits are a product choice, not a cost one; Pro's cap only stops abuse.
  barcode: { free: 1, bonusMax: 5, videosPerExtra: 1, pro: 200 },
  // The weekly summary is Pro only; a small cap keeps the shared AI quota safe from loops.
  summary: { free: 0, bonusMax: 0, videosPerExtra: 1, pro: 3 },
};

/** A packaged food from Open Food Facts, values per 100 g. */
export type BarcodeProduct = {
  code: string;
  name: string;
  brand: string | null;
  per100g: { calories: number; protein: number; carbs: number | null; fat: number | null; fiber: number | null };
  servingGrams: number | null;
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

export type Authed = { profile: Profile; authUser: AuthUser | null };

const bearer = (header: string | string[] | undefined) => {
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith('Bearer ') ? value.slice(7).trim() : '';
};
const isJwt = (token: string) => token.split('.').length === 3 && !token.startsWith('mom_');

/**
 * Finds the profile behind the Bearer credential, or the 401 to answer with. A Supabase
 * access token finds (or creates, on first use) the account's profile; an older install's
 * mom_ token finds its profile by hash.
 */
export async function authenticate(header: string | string[] | undefined, store: BackupStore, env?: Env): Promise<Authed | { denied: ApiResponse }> {
  const given = bearer(header);
  if (given.length < 32) return { denied: denied401 };
  if (isJwt(given)) {
    const user = env?.verifyAuthToken ? await env.verifyAuthToken(given) : null;
    if (!user) return { denied: { status: 401, json: { error: 'Tu sesión venció. Volvé a entrar.' } } };
    const existing = await store.findProfileByAuthUser(user.id);
    if (existing) return { profile: existing, authUser: user };
    if (env && (await store.countProfiles()) >= env.maxProfiles) {
      return { denied: { status: 403, json: { error: 'Se alcanzó el máximo de perfiles de este servidor.' } } };
    }
    const name = (user.name ?? user.email?.split('@')[0] ?? 'Sin nombre').slice(0, 60);
    try {
      const profile = await store.createProfile({ id: randomUUID(), name, tokenHash: sha256Hex(newToken()), authUserId: user.id });
      return { profile, authUser: user };
    } catch (e) {
      // Two first requests at once: the other one created it (auth_user_id is unique).
      const created = await store.findProfileByAuthUser(user.id);
      if (created) return { profile: created, authUser: user };
      throw e;
    }
  }
  const profile = await store.findProfileByTokenHash(sha256Hex(given));
  return profile ? { profile, authUser: null } : { denied: denied401 };
}

/** Pro comes from the subscription (RevenueCat) or a manual grant (profiles.plan = 'pro'). */
async function isPro(auth: Authed, env: Env): Promise<boolean> {
  if (auth.profile.plan === 'pro') return true;
  if (!auth.authUser || !env.checkPro) return false;
  try {
    return await env.checkPro(auth.authUser.id);
  } catch {
    return false;
  }
}

/**
 * Daily limits renew at the person's own midnight: the app sends its time zone (X-Timezone,
 * an IANA name like "America/Montevideo") and the day is counted there, the same "today" the app
 * shows. Unknown or missing zones count in Uruguay. Switching zones gains little: a zone further
 * ahead spends tomorrow's allowance, and one further back only reaches yesterday's if unused.
 */
export const DEFAULT_TIME_ZONE = 'America/Montevideo';
const dayFormats = new Map<string, Intl.DateTimeFormat>();
function dayFormat(zone: string | undefined): Intl.DateTimeFormat {
  const name = zone && zone.length <= 64 && /^[A-Za-z0-9_+\-/]+$/.test(zone) ? zone : DEFAULT_TIME_ZONE;
  let f = dayFormats.get(name);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: name, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      return dayFormat(DEFAULT_TIME_ZONE);
    }
    if (dayFormats.size < 500) dayFormats.set(name, f);
  }
  return f;
}
const today = (env: Env, zone?: string) => dayFormat(zone).format((env.now ?? (() => new Date()))());
const zoneOf = (req: ApiRequest) => {
  const v = req.headers['x-timezone'];
  return Array.isArray(v) ? v[0] : v;
};

/** Today's allowance of one feature. bonus: extras earned; bonusLeft: extras still earnable; videos: watched today. */
export type Quota = { pro: boolean; used: number; limit: number; bonus: number; bonusLeft: number; videos: number; videosPerExtra: number };

const limitsFor = (env: Env, kind: QuotaKind): LimitSet => ({ ...QUOTA_DEFAULTS[kind], ...env.limits?.[kind] });

async function quota(auth: Authed, store: BackupStore, env: Env, kind: QuotaKind, day: string, pro?: boolean): Promise<Quota> {
  const { count, videos } = await store.usage(auth.profile.id, day, kind);
  const isProNow = pro ?? (await isPro(auth, env));
  const l = limitsFor(env, kind);
  const videosPerExtra = Math.max(1, l.videosPerExtra);
  const earned = Math.min(Math.floor(videos / videosPerExtra), l.bonusMax);
  const limit = isProNow ? l.pro : l.free + earned;
  // Videos need an account, so the reward can be credited to it.
  const bonusLeft = isProNow || !auth.authUser ? 0 : Math.max(0, l.bonusMax - earned);
  return { pro: isProNow, used: count, limit, bonus: earned, bonusLeft, videos, videosPerExtra };
}

/** The 429 message when a free allowance runs out. */
function limitMessage(q: Quota, kind: QuotaKind, env: Env): string {
  const what = kind === 'photo' ? { many: 'fotos con IA', one: 'una foto más' } : { many: 'escaneos de código de barras', one: 'un escaneo más' };
  if (q.pro) return 'Llegaste al máximo de ' + what.many + ' de hoy. Mañana se renueva.';
  if (q.bonusLeft > 0) {
    const n = q.videosPerExtra - (q.videos % q.videosPerExtra);
    return 'Ya usaste tus ' + what.many + ' gratis de hoy. Mirá ' + (n === 1 ? 'un video corto' : n + ' videos cortos') + ' y ganá ' + what.one + ', o pasate a Pro.';
  }
  return 'Ya usaste tus ' + what.many + ' de hoy. Mañana se renuevan; con Pro tenés ' + (kind === 'barcode' ? 'ilimitados' : limitsFor(env, kind).pro + ' por día') + '.';
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
export async function handleMe(req: ApiRequest, store: BackupStore, env: Env, action: 'delete' | 'rotate'): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store, env);
  if ('denied' in auth) return auth.denied;
  if (action === 'delete') {
    if (req.method !== 'DELETE') return { status: 405, json: { error: 'Método no permitido.' } };
    await store.deleteProfile(auth.profile.id);
    // Deleting the account also removes the sign-in itself (Google Play asks for full deletion).
    if (auth.authUser && env.deleteAuthUser) await env.deleteAuthUser(auth.authUser.id);
    return { status: 200, json: { deleted: true } };
  }
  if (req.method !== 'POST') return { status: 405, json: { error: 'Método no permitido.' } };
  const token = newToken();
  await store.setTokenHash(auth.profile.id, sha256Hex(token));
  return { status: 200, json: { token } };
}

export async function handleStatus(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store, env);
  if ('denied' in auth) return auth.denied;
  if (req.method !== 'GET') return { status: 405, json: { error: 'Método no permitido.' } };
  const pro = await isPro(auth, env);
  const day = today(env, zoneOf(req));
  const [count, latest, ai, barcode] = await Promise.all([
    store.count(auth.profile.id),
    store.list(auth.profile.id, 1),
    quota(auth, store, env, 'photo', day, pro),
    quota(auth, store, env, 'barcode', day, pro),
  ]);
  return { status: 200, json: { ok: true, profile: auth.profile, count, latest: latest[0] ?? null, pro, ai, barcode } };
}

export async function handleBackups(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store, env);
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

export async function handleBackupById(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store, env);
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
  if (clean === 'profiles/link') return handleLink(req, store, env);
  if (clean === 'ads/reward') return handleAdReward(req, store, env);
  if (clean === 'ai/weekly-summary') return handleWeeklySummary(req, store, env);
  if (clean === 'status') return handleStatus(req, store, env);
  if (clean === 'backups') return handleBackups(req, store, env);
  if (clean.startsWith('backups/')) return handleBackupById({ ...req, id: decodeURIComponent(clean.slice('backups/'.length)) }, store, env);
  if (clean === 'food/analyze') return handleAnalyzeFood(req, store, env);
  if (clean === 'food/library') return handlePublicFoods(req, store, env);
  if (clean.startsWith('food/barcode/')) return handleBarcode({ ...req, id: decodeURIComponent(clean.slice('food/barcode/'.length)) }, store, env);
  if (clean.startsWith('food/library/')) return handleDeletePublicFood({ ...req, id: decodeURIComponent(clean.slice('food/library/'.length)) }, store, env);
  return { status: 404, json: { error: 'Ruta desconocida.' } };
}

// ---------- Food: AI photo analysis and the public library ----------

const num = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);

/** POST food/analyze { image: base64 JPEG } → { food: FoodAnalysis, remaining } */
export async function handleAnalyzeFood(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store, env);
  if ('denied' in auth) return auth.denied;
  if (req.method !== 'POST') return { status: 405, json: { error: 'Método no permitido.' } };
  if (!env.analyzeFood) return { status: 503, json: { error: 'El análisis con IA todavía no está activado en el servidor.' } };
  const image = (req.body as { image?: unknown } | null)?.image;
  if (typeof image !== 'string' || image.length < 100 || image.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return { status: 400, json: { error: 'La foto no es válida o es demasiado grande.' } };
  }
  const day = today(env, zoneOf(req));
  const q = await quota(auth, store, env, 'photo', day);
  if (q.used >= q.limit || !(await store.tryUse(auth.profile.id, day, 'photo', q.limit))) {
    return { status: 429, json: { error: limitMessage(q, 'photo', env), ai: { ...q, used: Math.max(q.used, q.limit) } } };
  }
  let food: FoodAnalysis;
  try {
    food = await env.analyzeFood(image, { pro: q.pro });
  } catch (e) {
    await store.refundUse(auth.profile.id, day, 'photo');
    const message = e instanceof Error && e.message.startsWith('IA:') ? e.message.slice(3).trim() : 'No pudimos analizar la foto. Probá de nuevo.';
    // 503 + busy: every provider was overloaded, so the app keeps trying instead of showing an error.
    const busy = !!e && typeof e === 'object' && (e as { busy?: unknown }).busy === true;
    return { status: busy ? 503 : 502, json: { error: message, busy } };
  }
  const ai = { ...q, used: q.used + 1 };
  return { status: 200, json: { food, remaining: Math.max(0, ai.limit - ai.used), ai } };
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
export async function handlePublicFoods(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store, env);
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

export async function handleDeletePublicFood(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store, env);
  if ('denied' in auth) return auth.denied;
  if (req.method !== 'DELETE') return { status: 405, json: { error: 'Método no permitido.' } };
  if (!UUID.test(req.id ?? '')) return { status: 400, json: { error: 'id inválido.' } };
  const deleted = await store.deletePublicFood(auth.profile.id, req.id!);
  return deleted ? { status: 200, json: { deleted: true } } : { status: 404, json: { error: 'No encontramos esa comida entre las que compartiste.' } };
}

// ---------- Accounts, rewarded videos and the Pro weekly summary ----------

/**
 * POST profiles/link { token }: with a Supabase session, adopts the profile of an older install
 * (its mom_ token) so its backups follow the account. An empty profile the account made on
 * first use is dropped; one that already has backups is never overwritten.
 */
export async function handleLink(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  if (req.method !== 'POST') return { status: 405, json: { error: 'Método no permitido.' } };
  const jwt = bearer(req.headers.authorization);
  const user = isJwt(jwt) && env.verifyAuthToken ? await env.verifyAuthToken(jwt) : null;
  if (!user) return { status: 401, json: { error: 'Tu sesión venció. Volvé a entrar.' } };
  const token = (req.body as { token?: unknown } | null)?.token;
  const legacy = typeof token === 'string' && token.length >= 32 ? await store.findProfileByTokenHash(sha256Hex(token)) : null;
  if (!legacy) return { status: 404, json: { error: 'No encontramos el perfil anterior de este teléfono.' } };
  const current = await store.findProfileByAuthUser(user.id);
  if (current && current.id === legacy.id) return { status: 200, json: { profile: legacy, linked: true } };
  if (current) {
    if ((await store.count(current.id)) > 0) {
      return { status: 409, json: { error: 'Esta cuenta ya tiene respaldos. Entrá con otra cuenta para conservar los de este teléfono.' } };
    }
    await store.deleteProfile(current.id);
  }
  await store.setAuthUser(legacy.id, user.id);
  return { status: 200, json: { profile: legacy, linked: true } };
}

/**
 * GET ads/reward: AdMob's server-side verification callback for a rewarded video. The signed
 * query carries the account id (user_id) and a transaction id; each transaction counts once.
 * AdMob's own test request (no signature) gets a 200 so the console accepts the URL.
 */
export async function handleAdReward(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  if (req.method !== 'GET') return { status: 405, json: { error: 'Método no permitido.' } };
  const q = req.query ?? {};
  if (!q.signature) return { status: 200, json: { ok: true } };
  if (!env.verifyAdReward || !req.rawQuery || !(await env.verifyAdReward(req.rawQuery))) {
    return { status: 403, json: { error: 'Firma inválida.' } };
  }
  if (!q.user_id || !UUID.test(q.user_id) || !q.transaction_id || q.transaction_id.length > 200) return { status: 400, json: { error: 'Faltan datos.' } };
  const profile = await store.findProfileByAuthUser(q.user_id);
  if (!profile) return { status: 404, json: { error: 'Cuenta desconocida.' } };
  // custom_data is "<feature>|<time zone>", set by the app when it loads the ad (AdMob's callback
  // carries no time zone of its own); the video counts on that day.
  const [feature, zone] = (q.custom_data ?? '').split('|');
  const kind: QuotaKind = feature === 'barcode' ? 'barcode' : 'photo';
  const credited = await store.addVideo(profile.id, today(env, zone), kind, q.transaction_id);
  return { status: 200, json: { ok: true, credited, kind } };
}

/**
 * GET food/barcode/<code>: looks a packaged food up (Open Food Facts) within the daily allowance.
 * An unknown product does not use a scan.
 */
export async function handleBarcode(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store, env);
  if ('denied' in auth) return auth.denied;
  if (req.method !== 'GET') return { status: 405, json: { error: 'Método no permitido.' } };
  const code = req.id ?? '';
  if (!/^\d{8,14}$/.test(code)) return { status: 400, json: { error: 'Ese código de barras no es válido.' } };
  if (!env.lookupBarcode) return { status: 503, json: { error: 'El escáner todavía no está activado en el servidor.' } };
  const day = today(env, zoneOf(req));
  const q = await quota(auth, store, env, 'barcode', day);
  if (q.used >= q.limit || !(await store.tryUse(auth.profile.id, day, 'barcode', q.limit))) {
    return { status: 429, json: { error: limitMessage(q, 'barcode', env), barcode: { ...q, used: Math.max(q.used, q.limit) } } };
  }
  let product: BarcodeProduct | null;
  try {
    product = await env.lookupBarcode(code);
  } catch {
    await store.refundUse(auth.profile.id, day, 'barcode');
    return { status: 502, json: { error: 'No pudimos consultar la base de productos. Probá en un rato.' } };
  }
  if (!product) {
    await store.refundUse(auth.profile.id, day, 'barcode');
    return { status: 404, json: { error: 'No encontramos ese producto. Cargalo a mano.', barcode: q } };
  }
  return { status: 200, json: { product, barcode: { ...q, used: q.used + 1 } } };
}

/** POST ai/weekly-summary { week }: Pro only. The phone sends the week's numbers, never raw data. */
export async function handleWeeklySummary(req: ApiRequest, store: BackupStore, env: Env): Promise<ApiResponse> {
  const auth = await authenticate(req.headers.authorization, store, env);
  if ('denied' in auth) return auth.denied;
  if (req.method !== 'POST') return { status: 405, json: { error: 'Método no permitido.' } };
  const day = today(env, zoneOf(req));
  const q = await quota(auth, store, env, 'summary', day);
  if (!q.pro) return { status: 402, json: { error: 'El resumen semanal es parte de Pro.' } };
  if (!env.summarizeWeek) return { status: 503, json: { error: 'El análisis con IA todavía no está activado en el servidor.' } };
  const week = (req.body as { week?: unknown } | null)?.week;
  if (!week || typeof week !== 'object' || Array.isArray(week) || JSON.stringify(week).length > 6000) return { status: 400, json: { error: 'Datos de la semana inválidos.' } };
  if (q.used >= q.limit || !(await store.tryUse(auth.profile.id, day, 'summary', q.limit))) {
    return { status: 429, json: { error: 'Ya armaste los resúmenes de hoy. Probá mañana.' } };
  }
  try {
    const summary = await env.summarizeWeek(week as WeekInput);
    // text is for app versions that only show plain text.
    return { status: 200, json: { summary, text: [summary.title + '.', ...summary.wins, ...summary.improve, summary.tip].join(' ').slice(0, 900) } };
  } catch (e) {
    await store.refundUse(auth.profile.id, day, 'summary');
    const message = e instanceof Error && e.message.startsWith('IA:') ? e.message.slice(3).trim() : 'No pudimos armar el resumen. Probá más tarde.';
    return { status: 502, json: { error: message } };
  }
}

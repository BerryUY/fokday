import type { DataTable } from '@/db/schema';
import { deviceTimeZone } from '@/lib/dates';
import { BACKUP_FORMAT, type BackupEnvelope, type Snapshot } from './snapshot';

/** Where the backup API lives and the personal token that unlocks this person's backups. Stored in SecureStore. */
export type CloudConfig = { url: string; token: string };

export type CloudProfile = { id: string; name: string; plan: string; createdAt: string };

/**
 * Today's allowance of a limited feature (AI photo, barcode). limit includes extras earned with
 * videos; bonusLeft is how many more can be earned; videosPerExtra videos give one extra.
 */
export type Quota = { pro: boolean; used: number; limit: number; bonus: number; bonusLeft: number; videos: number; videosPerExtra: number };

/** A packaged food found by barcode (Open Food Facts), values per 100 g. */
export type BarcodeProduct = {
  code: string;
  name: string;
  brand: string | null;
  per100g: { calories: number; protein: number; carbs: number | null; fat: number | null; fiber: number | null };
  servingGrams: number | null;
};

/** The AI's reading of a food photo (whole visible portion). */
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

export type PublicFoodInput = {
  name: string;
  category: 'desayuno' | 'almuerzo' | 'merienda' | 'cena' | 'extra';
  calories: number;
  protein: number;
  extras: Record<string, number>;
  ingredients: string[];
};
export type PublicFood = PublicFoodInput & { id: string; createdAt: string; mine?: boolean };

export type CloudBackupMeta = {
  id: string;
  deviceId: string;
  schemaVersion: number;
  localRevision: number;
  checksum: string;
  sizeBytes: number;
  counts: Record<DataTable, number>;
  createdAt: string;
  receivedAt: string;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 45_000;
/** The AI calls wait longer: the server tries every model for up to 60 s before giving up. */
const AI_TIMEOUT_MS = 75_000;

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

async function request<T>(config: { url: string; token?: string }, path: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch, timeoutMs = TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(`${normalizeBaseUrl(config.url)}/api/${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}), 'Content-Type': 'application/json', 'X-Timezone': deviceTimeZone(), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(controller.signal.aborted ? 'El servidor tardó demasiado en responder.' : 'No se pudo conectar con el servidor de respaldo.', null);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const serverMsg = (body as { error?: string } | null)?.error;
    const msg =
      res.status === 401 ? serverMsg ?? 'Tu sesión venció. Volvé a entrar con tu cuenta.'
      : res.status === 413 ? 'El respaldo es más grande de lo que acepta el servidor.'
      : serverMsg ?? `El servidor respondió con un error (${res.status}).`;
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

export const cloudApi = {
  /** Creates this person's profile. The returned token is shown only once: the app stores it right away. */
  createProfile(url: string, inviteCode: string, name: string, fetchImpl?: FetchLike) {
    return request<{ profile: CloudProfile; token: string }>(
      { url },
      'profiles',
      { method: 'POST', body: JSON.stringify({ inviteCode, name }) },
      fetchImpl,
    );
  },

  status(config: CloudConfig, fetchImpl?: FetchLike) {
    return request<{ ok: true; profile: CloudProfile; count: number; latest: CloudBackupMeta | null; pro: boolean; ai: Quota; barcode: Quota }>(config, 'status', {}, fetchImpl);
  },

  list(config: CloudConfig, fetchImpl?: FetchLike) {
    return request<{ backups: CloudBackupMeta[] }>(config, 'backups', {}, fetchImpl);
  },

  /** Sends a food photo (JPEG, base64) for the AI to estimate; needs a cloud profile. */
  analyzeFood(config: CloudConfig, jpegBase64: string, fetchImpl?: FetchLike) {
    return request<{ food: FoodAnalysis; remaining: number; ai: Quota }>(config, 'food/analyze', { method: 'POST', body: JSON.stringify({ image: jpegBase64 }) }, fetchImpl, AI_TIMEOUT_MS);
  },

  /** Looks a barcode up within today's allowance; 404 when the product is unknown (not counted). */
  lookupBarcode(config: CloudConfig, code: string, fetchImpl?: FetchLike) {
    return request<{ product: BarcodeProduct; barcode: Quota }>(config, `food/barcode/${encodeURIComponent(code)}`, {}, fetchImpl);
  },

  /** With an account session: adopts this phone's older profile (and its backups) into the account. */
  linkProfile(config: CloudConfig, legacyToken: string, fetchImpl?: FetchLike) {
    return request<{ profile: CloudProfile; linked: true }>(config, 'profiles/link', { method: 'POST', body: JSON.stringify({ token: legacyToken }) }, fetchImpl);
  },

  /** Pro: a short AI summary of the week from its numbers. */
  weeklySummary(config: CloudConfig, week: Record<string, unknown>, fetchImpl?: FetchLike) {
    return request<{ summary?: unknown; text: string }>(config, 'ai/weekly-summary', { method: 'POST', body: JSON.stringify({ week }) }, fetchImpl, AI_TIMEOUT_MS);
  },

  searchPublicFoods(config: CloudConfig, query: string, fetchImpl?: FetchLike) {
    return request<{ foods: PublicFood[] }>(config, `food/library?q=${encodeURIComponent(query)}`, {}, fetchImpl);
  },

  sharePublicFood(config: CloudConfig, food: PublicFoodInput, fetchImpl?: FetchLike) {
    return request<{ food: PublicFood }>(config, 'food/library', { method: 'POST', body: JSON.stringify(food) }, fetchImpl);
  },

  deletePublicFood(config: CloudConfig, id: string, fetchImpl?: FetchLike) {
    return request<{ deleted: true }>(config, `food/library/${encodeURIComponent(id)}`, { method: 'DELETE' }, fetchImpl);
  },

  /** Removes this person's profile and every backup from the server. */
  deleteProfile(config: CloudConfig, fetchImpl?: FetchLike) {
    return request<{ deleted: true }>(config, 'profiles/me', { method: 'DELETE' }, fetchImpl);
  },

  /** Issues a new recovery code; the old one stops working right away. */
  rotateToken(config: CloudConfig, fetchImpl?: FetchLike) {
    return request<{ token: string }>(config, 'profiles/me/token', { method: 'POST' }, fetchImpl);
  },

  upload(config: CloudConfig, id: string, envelope: BackupEnvelope, fetchImpl?: FetchLike, manual = false) {
    const s = envelope.snapshot;
    return request<{ id: string; duplicate: boolean; receivedAt: string }>(
      config,
      'backups',
      {
        method: 'POST',
        body: JSON.stringify({
          id,
          deviceId: s.deviceId,
          schemaVersion: s.schemaVersion,
          localRevision: s.localRevision,
          createdAt: s.createdAt,
          counts: s.counts,
          checksum: envelope.checksum,
          snapshot: s,
          manual,
        }),
      },
      fetchImpl,
    );
  },

  async download(config: CloudConfig, id: string | 'latest', fetchImpl?: FetchLike): Promise<{ meta: CloudBackupMeta; envelope: BackupEnvelope }> {
    const body = await request<CloudBackupMeta & { snapshot: Snapshot }>(config, `backups/${encodeURIComponent(id)}`, {}, fetchImpl);
    const { snapshot, ...meta } = body;
    return { meta, envelope: { format: BACKUP_FORMAT, checksum: meta.checksum, snapshot } };
  },
};

/** Waits between tries while every AI provider is overloaded (each try takes up to ~70 s on the server). */
export const AI_RETRY_WAITS_MS = [3_000, 10_000, 20_000];

/**
 * The food photo, without giving up on a busy AI: when the server says every provider is
 * overloaded (503) or the connection drops, it waits and tries again, telling the screen once
 * so it can say so. Real problems (no food in the photo, out of photos) come back right away.
 */
export async function analyzeFoodPatiently(config: CloudConfig, jpegBase64: string, onBusy: () => void, waits = AI_RETRY_WAITS_MS, fetchImpl?: FetchLike) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await cloudApi.analyzeFood(config, jpegBase64, fetchImpl);
    } catch (e) {
      const busy = e instanceof ApiError && (e.status === 503 || e.status === null);
      if (!busy || attempt >= waits.length) throw e;
      onBusy();
      await new Promise((r) => setTimeout(r, waits[attempt]));
    }
  }
}

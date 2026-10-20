import type { DataTable } from '@/db/schema';
import { BACKUP_FORMAT, type BackupEnvelope, type Snapshot } from './snapshot';

/** Where the personal backup API lives and the token that unlocks it. Stored in SecureStore. */
export type CloudConfig = { url: string; token: string };

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

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

async function request<T>(config: CloudConfig, path: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(`${normalizeBaseUrl(config.url)}/api/${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch (e) {
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
      res.status === 401 ? 'El token no es válido. Revisalo en Ajustes → Respaldo.'
      : res.status === 413 ? 'El respaldo es más grande de lo que acepta el servidor.'
      : serverMsg ?? `El servidor respondió con un error (${res.status}).`;
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

export const cloudApi = {
  status(config: CloudConfig, fetchImpl?: FetchLike) {
    return request<{ ok: true; count: number; latest: CloudBackupMeta | null }>(config, 'status', {}, fetchImpl);
  },

  list(config: CloudConfig, fetchImpl?: FetchLike) {
    return request<{ backups: CloudBackupMeta[] }>(config, 'backups', {}, fetchImpl);
  },

  upload(config: CloudConfig, id: string, envelope: BackupEnvelope, fetchImpl?: FetchLike) {
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

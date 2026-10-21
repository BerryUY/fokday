import type { Db } from '@/db/types';
import { cloudApi, type CloudBackupMeta, type CloudConfig, type FetchLike } from './api';
import {
  countUserRecords,
  createSnapshot,
  getDeviceId,
  getMeta,
  getRevision,
  hasUserChanges,
  restoreSnapshot,
  setMeta,
  validateEnvelope,
  wrapSnapshot,
  type BackupEnvelope,
} from './snapshot';

/**
 * Backup logic, free of React Native APIs so it is unit-tested in Node.
 *
 * Model: local-first, single device. Each backup is a full versioned snapshot.
 * - Every write bumps local_revision (SQLite triggers). A backup is needed when
 *   local_revision > backed_up_revision.
 * - A retry after a lost response reuses the same backup id, and the server
 *   ignores ids it already has, so retries never create duplicates.
 * - Local data is never modified by a backup, successful or not.
 * - Restoring is always an explicit user action.
 */
export type SyncDeps = {
  db: Db;
  getConfig: () => Promise<CloudConfig | null>;
  isOnline: () => Promise<boolean>;
  makeId: () => string;
  fetchImpl?: FetchLike;
};

export type BackupOutcome =
  | { status: 'not_configured' }
  | { status: 'offline' }
  | { status: 'needs_link' }
  | { status: 'nothing_new' }
  | { status: 'uploaded'; id: string; duplicate: boolean; at: string }
  | { status: 'error'; message: string };

export type SyncInfo = {
  localRevision: number;
  backedUpRevision: number;
  pendingChanges: boolean;
  lastBackupAt: string | null;
  lastBackupId: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  linked: boolean;
};

export async function getSyncInfo(db: Db): Promise<SyncInfo> {
  const [localRevision, backedUpRevision, lastBackupAt, lastBackupId, lastAttemptAt, lastError, linked, userChanges] = await Promise.all([
    getRevision(db, 'local_revision'),
    getRevision(db, 'backed_up_revision'),
    getMeta(db, 'last_backup_at'),
    getMeta(db, 'last_backup_id'),
    getMeta(db, 'last_attempt_at'),
    getMeta(db, 'last_error'),
    getMeta(db, 'cloud_linked'),
    hasUserChanges(db),
  ]);
  return {
    localRevision,
    backedUpRevision,
    pendingChanges: userChanges && localRevision > backedUpRevision,
    lastBackupAt,
    lastBackupId,
    lastAttemptAt,
    lastError,
    linked: linked === '1',
  };
}

/**
 * Automatic backups only run once this device is "linked": the user configured the
 * token and decided what to do with any backup already in the cloud. That way a fresh
 * install never pushes an empty database on top of real history before asking.
 */
export async function setLinked(db: Db, linked: boolean): Promise<void> {
  await setMeta(db, 'cloud_linked', linked ? '1' : null);
}

export async function runBackup(deps: SyncDeps, opts: { manual?: boolean } = {}): Promise<BackupOutcome> {
  const { db } = deps;
  const config = await deps.getConfig();
  if (!config) return { status: 'not_configured' };
  if ((await getMeta(db, 'cloud_linked')) !== '1') return { status: 'needs_link' };
  if (!(await deps.isOnline())) return { status: 'offline' };

  const local = await getRevision(db, 'local_revision');
  const backed = await getRevision(db, 'backed_up_revision');
  // Identical data is never uploaded twice; a manual press can still create the very first backup.
  const neverBackedUp = !(await getMeta(db, 'last_backup_id'));
  if (local <= backed && !(opts.manual && neverBackedUp)) return { status: 'nothing_new' };
  if (!opts.manual && !(await hasUserChanges(db))) return { status: 'nothing_new' };

  const attemptAt = new Date().toISOString();
  await setMeta(db, 'last_attempt_at', attemptAt);
  try {
    const deviceId = await getDeviceId(db, deps.makeId);
    const snapshot = await createSnapshot(db, deviceId);
    const envelope = await wrapSnapshot(snapshot);

    // Same revision as a previous failed attempt → same id, so the server can de-duplicate.
    const pendingRev = await getMeta(db, 'pending_backup_revision');
    let id = await getMeta(db, 'pending_backup_id');
    if (!id || pendingRev !== String(snapshot.localRevision)) {
      id = deps.makeId();
      await setMeta(db, 'pending_backup_id', id);
      await setMeta(db, 'pending_backup_revision', String(snapshot.localRevision));
    }

    const res = await cloudApi.upload(config, id, envelope, deps.fetchImpl, !!opts.manual);
    const at = res.receivedAt ?? new Date().toISOString();
    // Only what was in the snapshot is safe: writes made during the upload stay pending.
    await setMeta(db, 'backed_up_revision', String(snapshot.localRevision));
    await setMeta(db, 'last_backup_at', at);
    await setMeta(db, 'last_backup_id', res.id);
    await setMeta(db, 'last_error', null);
    await setMeta(db, 'pending_backup_id', null);
    await setMeta(db, 'pending_backup_revision', null);
    return { status: 'uploaded', id: res.id, duplicate: res.duplicate, at };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error desconocido al respaldar.';
    await setMeta(db, 'last_error', message);
    return { status: 'error', message };
  }
}

export type RestoreCheck = {
  meta: CloudBackupMeta;
  envelope: BackupEnvelope;
  /** Local changes that the backup does not include and would be lost. */
  localHasUnsavedChanges: boolean;
  backupRecords: number;
};

/** Downloads and fully validates a cloud backup without touching local data. */
export async function prepareCloudRestore(deps: SyncDeps, id: string | 'latest' = 'latest'): Promise<RestoreCheck> {
  const config = await deps.getConfig();
  if (!config) throw new Error('Configurá primero el respaldo en la nube.');
  const { meta, envelope } = await cloudApi.download(config, id, deps.fetchImpl);
  const valid = await validateEnvelope(envelope);
  const info = await getSyncInfo(deps.db);
  return { meta, envelope: valid, localHasUnsavedChanges: info.pendingChanges, backupRecords: countUserRecords(valid.snapshot) };
}

/** Applies an already validated envelope and links the device for automatic backups. */
export async function applyRestore(db: Db, envelope: BackupEnvelope, sourceBackupId: string | null): Promise<void> {
  await restoreSnapshot(db, envelope.snapshot);
  if (sourceBackupId) await setMeta(db, 'last_backup_id', sourceBackupId);
  await setMeta(db, 'pending_backup_id', null);
  await setMeta(db, 'pending_backup_revision', null);
}

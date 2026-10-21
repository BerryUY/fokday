import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';
import type { Db } from '@/db/types';
import { buildEnvelope } from './files';
import { getMeta, setMeta } from './snapshot';
import { copiesToDelete, folderFileName, isWeeklyDue } from './weekly';

/**
 * Weekly copies in a folder the person picks (Documents, Downloads, a Drive folder…), the way
 * Signal or Aegis do it. The folder is outside the app, so the copies survive uninstalling it.
 * Its address lives in sync_metadata: it belongs to this phone and is never part of a backup.
 */

export type FolderBackupInfo = { folderUri: string | null; lastAt: string | null; lastError: string | null };

export async function getFolderBackupInfo(db: Db): Promise<FolderBackupInfo> {
  const [folderUri, lastAt, lastError] = await Promise.all([
    getMeta(db, 'folder_backup_uri'),
    getMeta(db, 'folder_backup_last_at'),
    getMeta(db, 'folder_backup_error'),
  ]);
  return { folderUri, lastAt, lastError };
}

/** Opens Android's folder picker. Returns false if the person cancelled. */
export async function chooseBackupFolder(db: Db): Promise<boolean> {
  if (Platform.OS !== 'android') throw new Error('Las copias en una carpeta están disponibles en Android.');
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return false;
  }
  await setMeta(db, 'folder_backup_uri', dir.uri);
  await setMeta(db, 'folder_backup_error', null);
  await writeFolderCopy(db, { force: true });
  return true;
}

export async function disableFolderBackup(db: Db): Promise<void> {
  await setMeta(db, 'folder_backup_uri', null);
  await setMeta(db, 'folder_backup_last_at', null);
  await setMeta(db, 'folder_backup_error', null);
}

/** Writes a copy if one is due (or `force`), then keeps only the newest few. Never throws. */
export async function writeFolderCopy(db: Db, opts: { force?: boolean; now?: Date } = {}): Promise<'written' | 'not_due' | 'off' | 'error'> {
  const info = await getFolderBackupInfo(db);
  if (!info.folderUri || Platform.OS !== 'android') return 'off';
  const now = opts.now ?? new Date();
  if (!opts.force && !isWeeklyDue(info.lastAt, now)) return 'not_due';
  try {
    const dir = new Directory(info.folderUri);
    const file = dir.createFile(folderFileName(now), 'application/json');
    file.write(JSON.stringify(await buildEnvelope(db)));
    const names = dir.list().filter((f): f is File => f instanceof File).map((f) => f.name);
    const drop = new Set(copiesToDelete(names));
    for (const f of dir.list()) if (f instanceof File && drop.has(f.name)) f.delete();
    await setMeta(db, 'folder_backup_last_at', now.toISOString());
    await setMeta(db, 'folder_backup_error', null);
    return 'written';
  } catch {
    await setMeta(db, 'folder_backup_error', 'No se pudo guardar en la carpeta elegida. Elegila de nuevo.');
    return 'error';
  }
}

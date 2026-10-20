import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { Db } from '@/db/types';
import { todayKey } from '@/lib/dates';
import { newId } from '@/lib/ids';
import { createSnapshot, getDeviceId, parseEnvelopeText, validateEnvelope, wrapSnapshot, type BackupEnvelope } from './snapshot';

/** Local, Neon-independent backups: JSON export/import and CSV export via the Android share sheet. */

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function buildEnvelope(db: Db): Promise<BackupEnvelope> {
  return wrapSnapshot(await createSnapshot(db, await getDeviceId(db, newId)));
}

async function shareText(fileName: string, text: string, mimeType: string) {
  if (Platform.OS === 'web') {
    const blob = new Blob([text], { type: mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    return;
  }
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este dispositivo no permite compartir archivos.');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
}

export async function exportJsonBackup(db: Db): Promise<void> {
  const envelope = await buildEnvelope(db);
  await shareText(`momentum-respaldo-${todayKey()}.json`, JSON.stringify(envelope), 'application/json');
}

export async function exportCsv(fileName: string, csv: string): Promise<void> {
  await shareText(fileName, csv, 'text/csv');
}

/** Lets the user pick a JSON file and returns the validated envelope (nothing is restored yet). */
export async function pickJsonBackup(): Promise<BackupEnvelope | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
  return validateEnvelope(parseEnvelopeText(text));
}

const SAFETY_DIR = 'respaldos-automaticos';
const KEEP_SAFETY_COPIES = 5;

/**
 * Written before any restore or reset, inside the app's private storage, so the
 * previous state can always be recovered. Keeps the last few copies.
 */
export async function saveSafetyCopy(db: Db, reason: 'antes-de-restaurar' | 'antes-de-borrar'): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const envelope = await buildEnvelope(db);
  const dir = new Directory(Paths.document, SAFETY_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `${reason}-${stamp()}.json`);
  file.create();
  file.write(JSON.stringify(envelope));
  const copies = dir
    .list()
    .filter((f): f is File => f instanceof File && f.name.endsWith('.json'))
    .sort((a, b) => (a.name < b.name ? 1 : -1));
  for (const old of copies.slice(KEEP_SAFETY_COPIES)) old.delete();
  return file.uri;
}

export function listSafetyCopies(): { name: string; uri: string; size: number }[] {
  if (Platform.OS === 'web') return [];
  const dir = new Directory(Paths.document, SAFETY_DIR);
  if (!dir.exists) return [];
  return dir
    .list()
    .filter((f): f is File => f instanceof File && f.name.endsWith('.json'))
    .sort((a, b) => (a.name < b.name ? 1 : -1))
    .map((f) => ({ name: f.name, uri: f.uri, size: f.size ?? 0 }));
}

export async function readSafetyCopy(uri: string): Promise<BackupEnvelope> {
  return validateEnvelope(parseEnvelopeText(await new File(uri).text()));
}

export async function shareSafetyCopy(uri: string): Promise<void> {
  await Sharing.shareAsync(uri, { mimeType: 'application/json' });
}

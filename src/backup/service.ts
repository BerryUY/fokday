import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import type { Db } from '@/db/types';
import { newId } from '@/lib/ids';
import { subscribeData } from '@/state/dataBus';
import { cloudApi, normalizeBaseUrl, type CloudConfig } from './api';
import { getSyncInfo, runBackup, setLinked, type BackupOutcome, type SyncDeps, type SyncInfo } from './sync';

/**
 * Runs backups in the background of the UI (all async, never blocks a screen). The phone's
 * data is always the source of truth, so uploads are spaced out to keep the server idle:
 * when the app goes to the background (at most hourly) and otherwise every few hours while
 * it is open. Failures retry with backoff; local data is never touched.
 */

const URL_KEY = 'momentum_backup_url';
const TOKEN_KEY = 'momentum_backup_token';

// SecureStore is native-only; web previews keep the config in memory for the session.
const memoryStore = new Map<string, string>();
const secure = {
  get: (k: string) => (Platform.OS === 'web' ? Promise.resolve(memoryStore.get(k) ?? null) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (Platform.OS === 'web' ? Promise.resolve(void memoryStore.set(k, v)) : SecureStore.setItemAsync(k, v)),
  del: (k: string) => (Platform.OS === 'web' ? Promise.resolve(void memoryStore.delete(k)) : SecureStore.deleteItemAsync(k)),
};

export async function getCloudConfig(): Promise<CloudConfig | null> {
  const [url, token] = await Promise.all([secure.get(URL_KEY), secure.get(TOKEN_KEY)]);
  return url && token ? { url, token } : null;
}

export async function saveCloudConfig(config: CloudConfig): Promise<void> {
  await secure.set(URL_KEY, normalizeBaseUrl(config.url));
  await secure.set(TOKEN_KEY, config.token.trim());
  refreshState();
}

/** Address of the backup server baked into the app (app.json → extra.backupApiUrl); empty until the server is deployed. */
export function defaultApiUrl(): string {
  const value = Constants.expoConfig?.extra?.backupApiUrl;
  return typeof value === 'string' ? value.trim() : '';
}

/** The personal token doubles as the recovery code: with it, a new phone can reach the same backups. */
export async function getRecoveryCode(): Promise<string | null> {
  return secure.get(TOKEN_KEY);
}

/**
 * Creates this person's profile on the server with an invite code and links the phone to it.
 * The phone's data is the source of truth for a brand-new profile, so automatic backups start right away.
 */
export async function createCloudProfile(database: Db, input: { url: string; inviteCode: string; name: string }): Promise<void> {
  const url = normalizeBaseUrl(input.url);
  if (!/^https:\/\//.test(url)) throw new Error('La dirección del servidor tiene que empezar con https://');
  const { token } = await cloudApi.createProfile(url, input.inviteCode.trim(), input.name);
  await saveCloudConfig({ url, token });
  await setLinked(database, true);
  void backupNow(true);
}

export async function clearCloudConfig(): Promise<void> {
  await secure.del(URL_KEY);
  await secure.del(TOKEN_KEY);
  refreshState();
}

export async function isOnline(): Promise<boolean> {
  const s = await NetInfo.fetch();
  return !!s.isConnected && s.isInternetReachable !== false;
}

export type SyncState = {
  running: boolean;
  configured: boolean;
  online: boolean;
  last: BackupOutcome | null;
  info: SyncInfo | null;
};

let state: SyncState = { running: false, configured: false, online: true, last: null, info: null };
const listeners = new Set<() => void>();
const setState = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

let db: Db | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
const RETRY_DELAYS = [30_000, 120_000, 600_000, 1_800_000];

export function syncDeps(database: Db): SyncDeps {
  return { db: database, getConfig: getCloudConfig, isOnline, makeId: newId };
}

async function refreshState() {
  if (!db) return;
  const [info, config] = await Promise.all([getSyncInfo(db), getCloudConfig()]);
  setState({ info, configured: !!config });
}

function schedule(delay: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void backupNow(), delay);
}

/** Automatic uploads happen at most this often while the app is open… */
const OPEN_GAP_MS = 6 * 60 * 60_000;
/** …and at most this often when leaving the app, which is when changes usually end. */
const LEAVE_GAP_MS = 60 * 60_000;

/** Uploads only if there are changes and the last backup is older than the gap (or failed). */
async function autoBackup(gapMs: number) {
  if (!db) return;
  const info = await getSyncInfo(db);
  if (!info.linked || !info.pendingChanges) return;
  const last = info.lastBackupAt ? Date.parse(info.lastBackupAt) : 0;
  if (!info.lastError && Date.now() - last < gapMs) return;
  await backupNow();
}

/** Runs a backup now. Manual runs report every outcome; automatic ones stay quiet. */
export async function backupNow(manual = false): Promise<BackupOutcome | null> {
  if (!db || state.running) return null;
  setState({ running: true });
  let outcome: BackupOutcome;
  try {
    outcome = await runBackup(syncDeps(db), { manual });
  } catch (e) {
    outcome = { status: 'error', message: e instanceof Error ? e.message : 'Error desconocido' };
  }
  if (outcome.status === 'error') {
    schedule(RETRY_DELAYS[Math.min(failures, RETRY_DELAYS.length - 1)]);
    failures += 1;
  } else {
    failures = 0;
  }
  setState({ running: false, last: outcome });
  await refreshState();
  return outcome;
}

/** Starts the background triggers. Returns a cleanup function. */
export function startBackupService(database: Db): () => void {
  db = database;
  void refreshState();
  const unsubNet = NetInfo.addEventListener((s) => {
    const online = !!s.isConnected && s.isInternetReachable !== false;
    const cameBack = online && !state.online;
    setState({ online });
    if (cameBack) setTimeout(() => void autoBackup(OPEN_GAP_MS), 3_000);
  });
  const appState = AppState.addEventListener('change', (s) => {
    if (s === 'background') void autoBackup(LEAVE_GAP_MS);
    else if (s === 'active') setTimeout(() => void autoBackup(OPEN_GAP_MS), 5_000);
  });
  const unsubData = subscribeData(() => void refreshState());
  const interval = setInterval(() => void autoBackup(OPEN_GAP_MS), 30 * 60_000);
  setTimeout(() => void autoBackup(OPEN_GAP_MS), 5_000);
  return () => {
    unsubNet();
    appState.remove();
    unsubData();
    clearInterval(interval);
    if (timer) clearTimeout(timer);
    db = null;
  };
}

export { refreshState as refreshSyncState };

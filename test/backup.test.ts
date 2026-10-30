import { randomUUID } from 'node:crypto';
import { markAttendance } from '@/data/attendance';
import { getDailyTotals, listMeals, logMeal } from '@/data/meals';
import { saveWeight, listWeights } from '@/data/weight';
import type { FetchLike } from '@/backup/api';
import {
  BackupValidationError,
  createSnapshot,
  restoreSnapshot,
  validateEnvelope,
  wrapSnapshot,
} from '@/backup/snapshot';
import { applyRestore, getSyncInfo, prepareCloudRestore, runBackup, setLinked, type SyncDeps } from '@/backup/sync';
import { DATA_TABLES } from '@/db/schema';
import { createTestDb } from './helpers/db';

type Db = Awaited<ReturnType<typeof createTestDb>>;

async function addSampleData(db: Db) {
  const meal = (await listMeals(db)).find((m) => m.seedKey === 'desayuno-a')!;
  await logMeal(db, { date: '2026-03-10', category: 'desayuno', meal, portion: 1.5 });
  await saveWeight(db, '2026-03-10', 57.4);
  await markAttendance(db, '2026-03-10');
}

/** In-memory stand-in for the Vercel API, with the same de-duplication rule (ignore known ids). */
function fakeServer() {
  const store = new Map<string, { body: Record<string, unknown>; payload: string; receivedAt: string }>();
  let failNext = 0;
  let dropResponse = false;
  let uploads = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    if (failNext > 0) {
      failNext--;
      throw new TypeError('Network request failed');
    }
    const path = url.split('/api/')[1];
    if (init?.method === 'POST' && path === 'backups') {
      uploads++;
      const body = JSON.parse(String(init.body));
      const duplicate = store.has(body.id);
      if (!duplicate) store.set(body.id, { body, payload: JSON.stringify(body.snapshot), receivedAt: new Date().toISOString() });
      if (dropResponse) {
        dropResponse = false;
        throw new TypeError('Network request failed');
      }
      return new Response(JSON.stringify({ id: body.id, duplicate, receivedAt: store.get(body.id)!.receivedAt }), { status: 201 });
    }
    if (path.startsWith('backups/')) {
      const entries = [...store.values()];
      const hit = path === 'backups/latest' ? entries[entries.length - 1] : store.get(decodeURIComponent(path.slice(8)));
      if (!hit) return new Response(JSON.stringify({ error: 'No encontrado' }), { status: 404 });
      const { snapshot: _s, ...meta } = hit.body;
      return new Response(`{"meta":0,${JSON.stringify({ ...meta, receivedAt: hit.receivedAt }).slice(1, -1)},"snapshot":${hit.payload}}`, { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  return {
    fetchImpl,
    store,
    get uploads() { return uploads; },
    failNextRequests(n: number) { failNext = n; },
    dropNextResponse() { dropResponse = true; },
  };
}

function deps(db: Db, server: ReturnType<typeof fakeServer>, online = true): SyncDeps {
  return {
    db,
    getConfig: async () => ({ url: 'https://momentum.example.app/', token: 'test-token' }),
    isOnline: async () => online,
    makeId: () => randomUUID(),
    fetchImpl: server.fetchImpl,
  };
}

describe('local snapshot backup and restore', () => {
  it('round-trips every table into a fresh install', async () => {
    const source = await createTestDb();
    await addSampleData(source);
    const env = await wrapSnapshot(await createSnapshot(source, 'device-a'));

    const target = await createTestDb();
    const valid = await validateEnvelope(JSON.parse(JSON.stringify(env)));
    await restoreSnapshot(target, valid.snapshot);

    const again = await createSnapshot(target, 'device-a');
    for (const t of DATA_TABLES) expect(again.tables[t]).toEqual(env.snapshot.tables[t]);
    expect((await getDailyTotals(target, '2026-03-10')).calories).toBe(630);
  });

  it('rejects tampered, foreign, incomplete or newer backups', async () => {
    const db = await createTestDb();
    const env = await wrapSnapshot(await createSnapshot(db, 'd'));

    const tampered = JSON.parse(JSON.stringify(env));
    tampered.snapshot.tables.settings[0].value = 'hack';
    await expect(validateEnvelope(tampered)).rejects.toThrow(/integridad/);

    await expect(validateEnvelope({ hello: 'world' })).rejects.toBeInstanceOf(BackupValidationError);

    const newer = JSON.parse(JSON.stringify(env));
    newer.snapshot.schemaVersion = 999;
    await expect(validateEnvelope(await wrapSnapshot(newer.snapshot))).rejects.toThrow(/más nueva/);

    const incomplete = JSON.parse(JSON.stringify(env));
    delete incomplete.snapshot.tables.meal_logs;
    await expect(validateEnvelope(await wrapSnapshot(incomplete.snapshot))).rejects.toThrow(/meal_logs/);
  });

  it('a failed restore leaves local data untouched', async () => {
    const db = await createTestDb();
    await addSampleData(db);
    const broken = await createSnapshot(db, 'd');
    broken.tables.meal_logs = [{ ...broken.tables.meal_logs[0], id: 'bad', portion: -5 }]; // violates CHECK
    await expect(restoreSnapshot(db, broken)).rejects.toThrow();
    expect(await listWeights(db)).toHaveLength(1);
    expect((await getDailyTotals(db, '2026-03-10')).calories).toBe(630);
  });
});

describe('cloud backups', () => {
  it('waits until the device is linked, so a fresh install never overwrites the cloud', async () => {
    const db = await createTestDb();
    const server = fakeServer();
    await addSampleData(db);
    expect(await runBackup(deps(db, server))).toEqual({ status: 'needs_link' });
    expect(server.uploads).toBe(0);
  });

  it('backs up new data once and skips when nothing changed', async () => {
    const db = await createTestDb();
    const server = fakeServer();
    await setLinked(db, true);
    expect((await runBackup(deps(db, server))).status).toBe('nothing_new'); // only factory catalog
    await addSampleData(db);
    expect((await getSyncInfo(db)).pendingChanges).toBe(true);

    const first = await runBackup(deps(db, server));
    expect(first.status).toBe('uploaded');
    expect((await getSyncInfo(db)).pendingChanges).toBe(false);
    expect(await runBackup(deps(db, server))).toEqual({ status: 'nothing_new' });
    expect(await runBackup(deps(db, server), { manual: true })).toEqual({ status: 'nothing_new' });
    expect(server.uploads).toBe(1);

    await saveWeight(db, '2026-03-11', 57.6);
    expect((await runBackup(deps(db, server))).status).toBe('uploaded');
    expect(server.store.size).toBe(2); // versioned: one row per backup
  });

  it('offline: everything is saved locally and the backup stays pending', async () => {
    const db = await createTestDb();
    const server = fakeServer();
    await setLinked(db, true);
    await addSampleData(db);
    expect(await runBackup(deps(db, server, false))).toEqual({ status: 'offline' });
    expect(server.uploads).toBe(0);
    expect((await getSyncInfo(db)).pendingChanges).toBe(true);
    expect(await listWeights(db)).toHaveLength(1);
  });

  it('a failed upload keeps local data and records the error; the retry succeeds', async () => {
    const db = await createTestDb();
    const server = fakeServer();
    await setLinked(db, true);
    await addSampleData(db);
    server.failNextRequests(1);
    const failed = await runBackup(deps(db, server));
    expect(failed.status).toBe('error');
    const info = await getSyncInfo(db);
    expect(info.pendingChanges).toBe(true);
    expect(info.lastError).toMatch(/conectar/);
    expect(await listWeights(db)).toHaveLength(1);

    expect((await runBackup(deps(db, server))).status).toBe('uploaded');
    expect((await getSyncInfo(db)).lastError).toBeNull();
  });

  it('a retry after a lost response does not create a duplicate backup', async () => {
    const db = await createTestDb();
    const server = fakeServer();
    await setLinked(db, true);
    await addSampleData(db);
    server.dropNextResponse(); // server stored it, but the phone never heard back
    expect((await runBackup(deps(db, server))).status).toBe('error');
    const retry = await runBackup(deps(db, server));
    expect(retry).toMatchObject({ status: 'uploaded', duplicate: true });
    expect(server.store.size).toBe(1);
  });

  it('restores the latest cloud backup after a reinstall', async () => {
    const server = fakeServer();
    const phone = await createTestDb();
    await setLinked(phone, true);
    await addSampleData(phone);
    await runBackup(deps(phone, server));

    const reinstalled = await createTestDb();
    const check = await prepareCloudRestore(deps(reinstalled, server));
    expect(check.backupRecords).toBe(3);
    expect(check.localHasUnsavedChanges).toBe(false);
    await applyRestore(reinstalled, check.envelope, check.meta.id);

    expect((await getDailyTotals(reinstalled, '2026-03-10')).calories).toBe(630);
    const info = await getSyncInfo(reinstalled);
    expect(info.pendingChanges).toBe(false); // nothing to re-upload
  });

  it('warns before a restore would discard newer local changes', async () => {
    const server = fakeServer();
    const db = await createTestDb();
    await setLinked(db, true);
    await addSampleData(db);
    await runBackup(deps(db, server));
    await saveWeight(db, '2026-03-12', 58);
    const check = await prepareCloudRestore(deps(db, server));
    expect(check.localHasUnsavedChanges).toBe(true);
  });
});

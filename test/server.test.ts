import { randomUUID } from 'node:crypto';
import type { FetchLike } from '@/backup/api';
import { applyRestore, getSyncInfo, prepareCloudRestore, runBackup, setLinked, type SyncDeps } from '@/backup/sync';
import { getDailyTotals, listMeals, logMeal } from '@/data/meals';
import { saveWeight } from '@/data/weight';
import {
  handleBackupById,
  handleBackups,
  handleStatus,
  type ApiRequest,
  type BackupMeta,
  type BackupStore,
  type Env,
  type NewBackup,
} from '../server/lib/handlers';
import { createTestDb } from './helpers/db';

const TOKEN = 'a'.repeat(64);

function memoryStore(): BackupStore & { rows: (BackupMeta & { payload: string })[] } {
  const rows: (BackupMeta & { payload: string })[] = [];
  let clock = Date.parse('2026-03-10T12:00:00Z');
  return {
    rows,
    async ensureSchema() {},
    async count() { return rows.length; },
    async list(limit) { return [...rows].reverse().slice(0, limit).map(({ payload: _p, ...m }) => m); },
    async get(id) { return (id === 'latest' ? rows[rows.length - 1] : rows.find((r) => r.id === id)) ?? null; },
    async insert(b: NewBackup) {
      const existing = rows.find((r) => r.id === b.id);
      if (existing) return { inserted: false, receivedAt: existing.receivedAt };
      clock += 60_000;
      const receivedAt = new Date(clock).toISOString();
      rows.push({ ...b, receivedAt });
      return { inserted: true, receivedAt };
    },
    async prune(keep) {
      const extra = Math.max(0, rows.length - keep);
      rows.splice(0, extra);
      return extra;
    },
  };
}

/** Routes the app's fetch calls straight into the server handlers, JSON round-trip included. */
function wire(store: BackupStore, env: Env): FetchLike {
  return async (url, init) => {
    const path = url.split('/api/')[1];
    const req: ApiRequest = {
      method: init?.method ?? 'GET',
      headers: { authorization: (init?.headers as Record<string, string>)?.Authorization },
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    const out =
      path === 'status' ? await handleStatus(req, store, env)
      : path === 'backups' ? await handleBackups(req, store, env)
      : await handleBackupById({ ...req, id: decodeURIComponent(path.replace('backups/', '')) }, store, env);
    return new Response(out.raw ?? JSON.stringify(out.json), { status: out.status });
  };
}

const env: Env = { token: TOKEN, maxBackups: 3 };

function deps(db: Awaited<ReturnType<typeof createTestDb>>, fetchImpl: FetchLike, token = TOKEN): SyncDeps {
  return { db, fetchImpl, getConfig: async () => ({ url: 'https://api.example.com', token }), isOnline: async () => true, makeId: randomUUID };
}

describe('backup API', () => {
  it('rejects missing or wrong tokens and refuses to run with a weak server token', async () => {
    const store = memoryStore();
    expect((await handleStatus({ method: 'GET', headers: {}, body: null }, store, env)).status).toBe(401);
    expect((await handleStatus({ method: 'GET', headers: { authorization: 'Bearer nope' }, body: null }, store, env)).status).toBe(401);
    expect((await handleStatus({ method: 'GET', headers: { authorization: `Bearer ${TOKEN}` }, body: null }, store, { ...env, token: 'short' })).status).toBe(500);
    expect((await handleStatus({ method: 'GET', headers: { authorization: `Bearer ${TOKEN}` }, body: null }, store, env)).status).toBe(200);
  });

  it('rejects a snapshot whose checksum does not match', async () => {
    const store = memoryStore();
    const res = await handleBackups(
      {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}` },
        body: { id: randomUUID(), checksum: 'f'.repeat(64), createdAt: new Date().toISOString(), snapshot: { tables: {} } },
      },
      store,
      env,
    );
    expect(res.status).toBe(400);
    expect(store.rows).toHaveLength(0);
  });

  it('end to end: backs up from the phone, keeps versions, prunes the oldest and restores on a new install', async () => {
    const store = memoryStore();
    const fetchImpl = wire(store, env);

    const phone = await createTestDb();
    await setLinked(phone, true);
    const meal = (await listMeals(phone)).find((m) => m.seedKey === 'almuerzo-1')!;
    for (let day = 1; day <= 4; day++) {
      await logMeal(phone, { date: `2026-03-0${day}`, category: 'almuerzo', meal });
      await saveWeight(phone, `2026-03-0${day}`, 57 + day / 10);
      expect((await runBackup(deps(phone, fetchImpl))).status).toBe('uploaded');
    }
    expect(store.rows).toHaveLength(3); // maxBackups = 3, oldest pruned
    expect((await getSyncInfo(phone)).pendingChanges).toBe(false);

    const wrongToken = await runBackup(deps(phone, fetchImpl, 'b'.repeat(64)), { manual: true });
    expect(wrongToken.status).toBe('nothing_new');

    const newPhone = await createTestDb();
    const check = await prepareCloudRestore(deps(newPhone, fetchImpl));
    await applyRestore(newPhone, check.envelope, check.meta.id);
    expect((await getDailyTotals(newPhone, '2026-03-04')).calories).toBe(700);
  });

  it('reports a bad token to the app as a readable error and keeps data pending', async () => {
    const store = memoryStore();
    const db = await createTestDb();
    await setLinked(db, true);
    await saveWeight(db, '2026-03-01', 57);
    const res = await runBackup(deps(db, wire(store, env), 'c'.repeat(64)));
    expect(res).toEqual({ status: 'error', message: expect.stringMatching(/token/i) });
    expect((await getSyncInfo(db)).pendingChanges).toBe(true);
  });
});

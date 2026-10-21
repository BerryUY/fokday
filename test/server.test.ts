import { randomUUID } from 'node:crypto';
import { cloudApi, type FetchLike } from '@/backup/api';
import { applyRestore, getSyncInfo, prepareCloudRestore, runBackup, setLinked, type SyncDeps } from '@/backup/sync';
import { getDailyTotals, listMeals, logMeal } from '@/data/meals';
import { saveWeight } from '@/data/weight';
import {
  handleBackupById,
  handleBackups,
  handleProfiles,
  handleStatus,
  type ApiRequest,
  type BackupMeta,
  type BackupStore,
  type Env,
  type NewBackup,
  type Profile,
} from '../server/lib/handlers';
import { createTestDb } from './helpers/db';

const URL = 'https://api.example.com';
const INVITE = 'invitacion-secreta';

type StoredBackup = BackupMeta & { payload: string; profileId: string };

function memoryStore() {
  const rows: StoredBackup[] = [];
  const profiles: (Profile & { tokenHash: string })[] = [];
  let clock = Date.parse('2026-03-10T12:00:00Z');
  const store: BackupStore = {
    async ensureSchema() {},
    async countProfiles() { return profiles.length; },
    async createProfile(p) {
      const profile = { id: p.id, name: p.name, plan: 'free', createdAt: new Date(clock).toISOString(), tokenHash: p.tokenHash };
      profiles.push(profile);
      const { tokenHash: _h, ...pub } = profile;
      return pub;
    },
    async findProfileByTokenHash(hash) {
      const found = profiles.find((p) => p.tokenHash === hash);
      if (!found) return null;
      const { tokenHash: _h, ...pub } = found;
      return pub;
    },
    async count(profileId) { return rows.filter((r) => r.profileId === profileId).length; },
    async list(profileId, limit) {
      return rows.filter((r) => r.profileId === profileId).reverse().slice(0, limit).map(({ payload: _p, profileId: _i, ...m }) => m);
    },
    async get(profileId, id) {
      const mine = rows.filter((r) => r.profileId === profileId);
      return (id === 'latest' ? mine[mine.length - 1] : mine.find((r) => r.id === id)) ?? null;
    },
    async insert(profileId, b: NewBackup) {
      const existing = rows.find((r) => r.id === b.id && r.profileId === profileId);
      if (existing) return { inserted: false, receivedAt: existing.receivedAt };
      clock += 60_000;
      const receivedAt = new Date(clock).toISOString();
      rows.push({ ...b, receivedAt, profileId });
      return { inserted: true, receivedAt };
    },
    async prune(profileId, keep) {
      const mine = rows.filter((r) => r.profileId === profileId);
      const extra = mine.slice(0, Math.max(0, mine.length - keep));
      for (const r of extra) rows.splice(rows.indexOf(r), 1);
      return extra.length;
    },
  };
  return { store, rows, profiles };
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
      path === 'profiles' ? await handleProfiles(req, store, env)
      : path === 'status' ? await handleStatus(req, store, env)
      : path === 'backups' ? await handleBackups(req, store, env)
      : await handleBackupById({ ...req, id: decodeURIComponent(path.replace('backups/', '')) }, store, env);
    return new Response(out.raw ?? JSON.stringify(out.json), { status: out.status });
  };
}

const env: Env = { inviteCode: INVITE, maxBackups: 3, maxProfiles: 3 };

function deps(db: Awaited<ReturnType<typeof createTestDb>>, fetchImpl: FetchLike, token: string): SyncDeps {
  return { db, fetchImpl, getConfig: async () => ({ url: URL, token }), isOnline: async () => true, makeId: randomUUID };
}

async function signUp(fetchImpl: FetchLike, name: string) {
  return cloudApi.createProfile(URL, INVITE, name, fetchImpl);
}

describe('profiles', () => {
  it('needs the invite code, and refuses to run without a usable one', async () => {
    const { store, profiles } = memoryStore();
    const fetchImpl = wire(store, env);
    await expect(cloudApi.createProfile(URL, 'incorrecto', 'Ana', fetchImpl)).rejects.toMatchObject({ status: 403 });
    expect(profiles).toHaveLength(0);
    const unset = await handleProfiles({ method: 'POST', headers: {}, body: { inviteCode: 'x', name: 'Ana' } }, store, { ...env, inviteCode: undefined });
    expect(unset.status).toBe(500);
    const weak = await handleProfiles({ method: 'POST', headers: {}, body: { inviteCode: 'corto', name: 'Ana' } }, store, { ...env, inviteCode: 'corto' });
    expect(weak.status).toBe(500);
    expect((await handleProfiles({ method: 'GET', headers: {}, body: null }, store, env)).status).toBe(405);
  });

  it('creates a profile with a secret token and stores only its hash', async () => {
    const { store, profiles } = memoryStore();
    const created = await signUp(wire(store, env), '  Ana  ');
    expect(created.profile.name).toBe('Ana');
    expect(created.token).toMatch(/^mom_[0-9a-f]{64}$/);
    expect(profiles).toHaveLength(1);
    expect(JSON.stringify(profiles)).not.toContain(created.token);
    const status = await cloudApi.status({ url: URL, token: created.token }, wire(store, env));
    expect(status).toMatchObject({ ok: true, count: 0, profile: { name: 'Ana' } });
  });

  it('stops at the profile limit', async () => {
    const { store } = memoryStore();
    const fetchImpl = wire(store, env);
    for (const name of ['A', 'B', 'C']) await signUp(fetchImpl, name);
    await expect(signUp(fetchImpl, 'D')).rejects.toMatchObject({ status: 403 });
  });

  it('rejects missing, short or unknown tokens', async () => {
    const { store } = memoryStore();
    const status = (authorization?: string) => handleStatus({ method: 'GET', headers: { authorization }, body: null }, store, env);
    expect((await status()).status).toBe(401);
    expect((await status('Bearer nope')).status).toBe(401);
    expect((await status(`Bearer ${'a'.repeat(64)}`)).status).toBe(401);
  });
});

describe('backup API', () => {
  it('rejects a snapshot whose checksum does not match', async () => {
    const { store, rows } = memoryStore();
    const { token } = await signUp(wire(store, env), 'Ana');
    const res = await handleBackups(
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: { id: randomUUID(), checksum: 'f'.repeat(64), createdAt: new Date().toISOString(), snapshot: { tables: {} } },
      },
      store,
      env,
    );
    expect(res.status).toBe(400);
    expect(rows).toHaveLength(0);
  });

  it('end to end: backs up from the phone, keeps versions, prunes the oldest and restores on a new install', async () => {
    const { store, rows } = memoryStore();
    const fetchImpl = wire(store, env);
    const { token } = await signUp(fetchImpl, 'Ana');

    const phone = await createTestDb();
    await setLinked(phone, true);
    const meal = (await listMeals(phone)).find((m) => m.seedKey === 'almuerzo-1')!;
    for (let day = 1; day <= 4; day++) {
      await logMeal(phone, { date: `2026-03-0${day}`, category: 'almuerzo', meal });
      await saveWeight(phone, `2026-03-0${day}`, 57 + day / 10);
      expect((await runBackup(deps(phone, fetchImpl, token))).status).toBe('uploaded');
    }
    expect(rows).toHaveLength(3); // maxBackups = 3, oldest pruned
    expect((await getSyncInfo(phone)).pendingChanges).toBe(false);

    const newPhone = await createTestDb();
    const check = await prepareCloudRestore(deps(newPhone, fetchImpl, token));
    await applyRestore(newPhone, check.envelope, check.meta.id);
    expect((await getDailyTotals(newPhone, '2026-03-04')).calories).toBe(700);
  });

  it('keeps every profile\'s backups private from the others', async () => {
    const { store } = memoryStore();
    const fetchImpl = wire(store, env);
    const ana = await signUp(fetchImpl, 'Ana');
    const beto = await signUp(fetchImpl, 'Beto');

    const phone = await createTestDb();
    await setLinked(phone, true);
    await saveWeight(phone, '2026-03-01', 57);
    expect((await runBackup(deps(phone, fetchImpl, ana.token))).status).toBe('uploaded');

    const anaList = await cloudApi.list({ url: URL, token: ana.token }, fetchImpl);
    expect(anaList.backups).toHaveLength(1);
    const betoList = await cloudApi.list({ url: URL, token: beto.token }, fetchImpl);
    expect(betoList.backups).toHaveLength(0);
    await expect(cloudApi.download({ url: URL, token: beto.token }, anaList.backups[0].id, fetchImpl)).rejects.toMatchObject({ status: 404 });
    await expect(cloudApi.download({ url: URL, token: beto.token }, 'latest', fetchImpl)).rejects.toMatchObject({ status: 404 });
  });

  it('reports a bad token to the app as a readable error and keeps data pending', async () => {
    const { store } = memoryStore();
    const db = await createTestDb();
    await setLinked(db, true);
    await saveWeight(db, '2026-03-01', 57);
    const res = await runBackup(deps(db, wire(store, env), 'c'.repeat(64)));
    expect(res).toEqual({ status: 'error', message: expect.stringMatching(/token/i) });
    expect((await getSyncInfo(db)).pendingChanges).toBe(true);
  });
});

import { randomUUID } from 'node:crypto';
import { cloudApi, type FetchLike } from '@/backup/api';
import { applyRestore, getSyncInfo, prepareCloudRestore, runBackup, setLinked, type SyncDeps } from '@/backup/sync';
import { getDailyTotals, listMeals, logMeal } from '@/data/meals';
import { saveWeight } from '@/data/weight';
import {
  backupsToKeep,
  handleRequest,
  sha256Hex,
  type ApiRequest,
  type AuthUser,
  type BackupMeta,
  type BackupStore,
  type Env,
  type NewBackup,
  type Profile,
  type PublicFood,
} from '../supabase/functions/momentum/handlers';
import { createTestDb } from './helpers/db';

const URL = 'https://api.example.com';
const INVITE = 'invitacion-secreta';

type StoredBackup = BackupMeta & { payload: string; profileId: string };

function memoryStore() {
  const rows: StoredBackup[] = [];
  const profiles: (Profile & { tokenHash: string; authUserId?: string })[] = [];
  const usage = new Map<string, number>();
  const videos = new Map<string, number>();
  const transactions = new Set<string>();
  const foods: (PublicFood & { profileId: string })[] = [];
  let clock = Date.parse('2026-03-10T12:00:00Z');
  const pub = ({ tokenHash: _h, authUserId: _a, ...p }: Profile & { tokenHash: string; authUserId?: string }): Profile => p;
  const store: BackupStore = {
    async countProfiles() { return profiles.length; },
    async createProfile(p) {
      // Like the unique index on auth_user_id.
      if (p.authUserId && profiles.some((x) => x.authUserId === p.authUserId)) throw new Error('duplicate key');
      const profile = { id: p.id, name: p.name, plan: 'free', createdAt: new Date(clock).toISOString(), tokenHash: p.tokenHash, authUserId: p.authUserId };
      profiles.push(profile);
      return pub(profile);
    },
    async findProfileByTokenHash(hash) {
      const found = profiles.find((p) => p.tokenHash === hash);
      return found ? pub(found) : null;
    },
    async findProfileByAuthUser(authUserId) {
      const found = profiles.find((p) => p.authUserId === authUserId);
      return found ? pub(found) : null;
    },
    async setAuthUser(profileId, authUserId) {
      const found = profiles.find((p) => p.id === profileId);
      if (found) found.authUserId = authUserId;
    },
    async setTokenHash(profileId, hash) {
      const found = profiles.find((p) => p.id === profileId);
      if (found) found.tokenHash = hash;
    },
    async deleteProfile(profileId) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].profileId === profileId) rows.splice(i, 1);
      profiles.splice(profiles.findIndex((p) => p.id === profileId), 1);
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
      clock += 60 * 60_000; // one hour between uploads
      const receivedAt = new Date(clock).toISOString();
      rows.push({ ...b, receivedAt, profileId });
      return { inserted: true, receivedAt };
    },
    async remove(profileId, ids) {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].profileId === profileId && ids.includes(rows[i].id)) rows.splice(i, 1);
    },
    async usage(profileId, day, kind) { return { count: usage.get(profileId + day + kind) ?? 0, videos: videos.get(profileId + day + kind) ?? 0 }; },
    async tryUse(profileId, day, kind, limit) {
      // Same contract as the SQL function: check and increment in one step.
      const n = usage.get(profileId + day + kind) ?? 0;
      if (n >= limit) return false;
      usage.set(profileId + day + kind, n + 1);
      return true;
    },
    async refundUse(profileId, day, kind) { usage.set(profileId + day + kind, Math.max(0, (usage.get(profileId + day + kind) ?? 0) - 1)); },
    async addVideo(profileId, day, kind, transactionId) {
      if (transactions.has(transactionId)) return false;
      transactions.add(transactionId);
      videos.set(profileId + day + kind, (videos.get(profileId + day + kind) ?? 0) + 1);
      return true;
    },
    async searchPublicFoods(query, limit) {
      const q = query.toLowerCase();
      return foods.filter((f) => f.name.toLowerCase().includes(q)).reverse().slice(0, limit);
    },
    async countPublicFoods(profileId) { return foods.filter((f) => f.profileId === profileId).length; },
    async createPublicFood(profileId, input) {
      const food = { ...input, id: randomUUID(), createdAt: new Date(clock).toISOString(), profileId };
      foods.push(food);
      const { profileId: _p, ...pub } = food;
      return pub;
    },
    async deletePublicFood(profileId, id) {
      const i = foods.findIndex((f) => f.id === id && f.profileId === profileId);
      if (i < 0) return false;
      foods.splice(i, 1);
      return true;
    },
  };
  return { store, rows, profiles, foods, now: () => new Date(clock + 60 * 60_000) };
}

/** Routes the app's fetch calls straight into the server handlers, JSON round-trip included. */
function wire(store: BackupStore, env: Env): FetchLike {
  return async (url, init) => {
    const req: ApiRequest = {
      method: init?.method ?? 'GET',
      headers: { authorization: (init?.headers as Record<string, string>)?.Authorization },
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    const [path, search = ''] = url.split('/api/')[1].split('?');
    req.query = Object.fromEntries(new URLSearchParams(search));
    req.rawQuery = search;
    const out = await handleRequest(path, req, store, env);
    return new Response(out.raw ?? JSON.stringify(out.json), { status: out.status });
  };
}

function setup() {
  const mem = memoryStore();
  const env: Env = { inviteCodeHash: sha256Hex(INVITE), maxProfiles: 3, minUploadIntervalSeconds: 60, now: mem.now };
  return { ...mem, env, fetchImpl: wire(mem.store, env) };
}

function deps(db: Awaited<ReturnType<typeof createTestDb>>, fetchImpl: FetchLike, token: string): SyncDeps {
  return { db, fetchImpl, getConfig: async () => ({ url: URL, token }), isOnline: async () => true, makeId: randomUUID };
}

const signUp = (fetchImpl: FetchLike, name: string) => cloudApi.createProfile(URL, INVITE, name, fetchImpl);

describe('profiles', () => {
  it('needs the invite code, and refuses to run without one configured', async () => {
    const { store, profiles, env, fetchImpl } = setup();
    await expect(cloudApi.createProfile(URL, 'incorrecto', 'Ana', fetchImpl)).rejects.toMatchObject({ status: 403 });
    expect(profiles).toHaveLength(0);
    const unset = await handleRequest('profiles', { method: 'POST', headers: {}, body: { inviteCode: INVITE } }, store, { ...env, inviteCodeHash: undefined });
    expect(unset.status).toBe(500);
    expect((await handleRequest('profiles', { method: 'GET', headers: {}, body: null }, store, env)).status).toBe(405);
  });

  it('creates a profile with a secret token and stores only its hash', async () => {
    const { profiles, fetchImpl } = setup();
    const created = await signUp(fetchImpl, '  Ana  ');
    expect(created.profile.name).toBe('Ana');
    expect(created.token).toMatch(/^mom_[0-9a-f]{64}$/);
    expect(JSON.stringify(profiles)).not.toContain(created.token);
    expect(await cloudApi.status({ url: URL, token: created.token }, fetchImpl)).toMatchObject({ ok: true, count: 0, profile: { name: 'Ana' } });
  });

  it('stops at the profile limit', async () => {
    const { fetchImpl } = setup();
    for (const name of ['A', 'B', 'C']) await signUp(fetchImpl, name);
    await expect(signUp(fetchImpl, 'D')).rejects.toMatchObject({ status: 403 });
  });

  it('rejects missing, short or unknown tokens', async () => {
    const { store, env } = setup();
    const status = (authorization?: string) => handleRequest('status', { method: 'GET', headers: { authorization }, body: null }, store, env);
    expect((await status()).status).toBe(401);
    expect((await status('Bearer nope')).status).toBe(401);
    expect((await status(`Bearer ${'a'.repeat(64)}`)).status).toBe(401);
  });

  it('issues a new recovery code and the old one stops working', async () => {
    const { fetchImpl } = setup();
    const { token } = await signUp(fetchImpl, 'Ana');
    const { token: fresh } = await cloudApi.rotateToken({ url: URL, token }, fetchImpl);
    expect(fresh).not.toBe(token);
    await expect(cloudApi.status({ url: URL, token }, fetchImpl)).rejects.toMatchObject({ status: 401 });
    expect(await cloudApi.status({ url: URL, token: fresh }, fetchImpl)).toMatchObject({ ok: true });
  });

  it('deletes the profile and every backup it owns', async () => {
    const { rows, profiles, fetchImpl } = setup();
    const ana = await signUp(fetchImpl, 'Ana');
    const beto = await signUp(fetchImpl, 'Beto');
    for (const who of [ana, beto]) {
      const phone = await createTestDb();
      await setLinked(phone, true);
      await saveWeight(phone, '2026-03-01', 70);
      expect((await runBackup(deps(phone, fetchImpl, who.token))).status).toBe('uploaded');
    }
    await cloudApi.deleteProfile({ url: URL, token: ana.token }, fetchImpl);
    expect(profiles.map((p) => p.name)).toEqual(['Beto']);
    expect(rows).toHaveLength(1);
    await expect(cloudApi.status({ url: URL, token: ana.token }, fetchImpl)).rejects.toMatchObject({ status: 401 });
  });
});

describe('backup API', () => {
  it('rejects a snapshot whose checksum does not match', async () => {
    const { store, rows, env, fetchImpl } = setup();
    const { token } = await signUp(fetchImpl, 'Ana');
    const res = await handleRequest(
      'backups',
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

  it('refuses automatic uploads too close together, but not manual ones', async () => {
    const { store, env } = setup();
    const created = await handleRequest('profiles', { method: 'POST', headers: {}, body: { inviteCode: INVITE, name: 'Ana' } }, store, env);
    const token = (created.json as { token: string }).token;
    const snapshot = { tables: {} };
    const body = (extra: object = {}) => ({ id: randomUUID(), checksum: sha256Hex(JSON.stringify(snapshot)), createdAt: new Date().toISOString(), snapshot, ...extra });
    const post = (b: object, nowIso: string) =>
      handleRequest('backups', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: b }, store, { ...env, now: () => new Date(nowIso) });
    const first = await post(body(), '2026-03-10T13:00:00Z');
    expect(first.status).toBe(201);
    const receivedAt = (first.json as { receivedAt: string }).receivedAt;
    const soon = new Date(Date.parse(receivedAt) + 10_000).toISOString();
    expect((await post(body(), soon)).status).toBe(429);
    expect((await post(body({ manual: true }), soon)).status).toBe(201);
  });

  it('keeps the 3 newest backups plus one per day for a week', () => {
    const now = new Date('2026-03-20T12:00:00Z');
    const backups = [];
    for (let day = 10; day <= 20; day++) {
      for (const hour of ['08', '20']) backups.push({ id: `${day}-${hour}`, receivedAt: `2026-03-${day}T${hour}:00:00.000Z` });
    }
    const keep = [...backupsToKeep(backups, now)].sort();
    // 3 newest (20-08, 19-20, 20-20 → 20-20, 20-08, 19-20) + newest per day from 13 to 20.
    expect(keep).toEqual(['13-20', '14-20', '15-20', '16-20', '17-20', '18-20', '19-20', '20-08', '20-20'].sort());
  });

  it('end to end: backs up from the phone, prunes old versions and restores on a new install', async () => {
    const { rows, fetchImpl } = setup();
    const { token } = await signUp(fetchImpl, 'Ana');
    const phone = await createTestDb();
    await setLinked(phone, true);
    const meal = (await listMeals(phone)).find((m) => m.seedKey === 'almuerzo-1')!;
    for (let day = 1; day <= 6; day++) {
      await logMeal(phone, { date: `2026-03-0${day}`, category: 'almuerzo', meal });
      await saveWeight(phone, `2026-03-0${day}`, 57 + day / 10);
      expect((await runBackup(deps(phone, fetchImpl, token))).status).toBe('uploaded');
    }
    // Uploads are an hour apart on one day: only the 3 newest are kept.
    expect(rows).toHaveLength(3);
    expect((await getSyncInfo(phone)).pendingChanges).toBe(false);

    const newPhone = await createTestDb();
    const check = await prepareCloudRestore(deps(newPhone, fetchImpl, token));
    await applyRestore(newPhone, check.envelope, check.meta.id);
    expect((await getDailyTotals(newPhone, '2026-03-06')).calories).toBe(700);
  });

  it('keeps every profile\'s backups private from the others', async () => {
    const { fetchImpl } = setup();
    const ana = await signUp(fetchImpl, 'Ana');
    const beto = await signUp(fetchImpl, 'Beto');
    const phone = await createTestDb();
    await setLinked(phone, true);
    await saveWeight(phone, '2026-03-01', 57);
    expect((await runBackup(deps(phone, fetchImpl, ana.token))).status).toBe('uploaded');

    const anaList = await cloudApi.list({ url: URL, token: ana.token }, fetchImpl);
    expect(anaList.backups).toHaveLength(1);
    expect((await cloudApi.list({ url: URL, token: beto.token }, fetchImpl)).backups).toHaveLength(0);
    await expect(cloudApi.download({ url: URL, token: beto.token }, anaList.backups[0].id, fetchImpl)).rejects.toMatchObject({ status: 404 });
    await expect(cloudApi.download({ url: URL, token: beto.token }, 'latest', fetchImpl)).rejects.toMatchObject({ status: 404 });
  });

  it('reports a bad token to the app as a readable error and keeps data pending', async () => {
    const { fetchImpl } = setup();
    const db = await createTestDb();
    await setLinked(db, true);
    await saveWeight(db, '2026-03-01', 57);
    const res = await runBackup(deps(db, fetchImpl, 'c'.repeat(64)));
    expect(res).toEqual({ status: 'error', message: expect.stringMatching(/token/i) });
    expect((await getSyncInfo(db)).pendingChanges).toBe(true);
  });
});

describe('food: AI photo and public library', () => {
  const photo = 'A'.repeat(400);
  const analysis = { name: 'Milanesa con puré', items: [{ name: 'milanesa', grams: 180 }], calories: 650, protein: 38, carbs: 55, fat: 28, fiber: 4, confidence: 'media' as const };

  it('analyzes a photo, counts the daily limit and says when the server has no AI', async () => {
    const mem = memoryStore();
    const env: Env = { inviteCodeHash: sha256Hex(INVITE), maxProfiles: 3, minUploadIntervalSeconds: 60, limits: { photo: { free: 2 } }, analyzeFood: async () => analysis };
    const fetchImpl = wire(mem.store, env);
    const { token } = await signUp(fetchImpl, 'Ana');
    const cfg = { url: URL, token };
    expect(await cloudApi.analyzeFood(cfg, photo, fetchImpl)).toMatchObject({ food: analysis, remaining: 1 });
    expect((await cloudApi.analyzeFood(cfg, photo, fetchImpl)).remaining).toBe(0);
    await expect(cloudApi.analyzeFood(cfg, photo, fetchImpl)).rejects.toMatchObject({ status: 429 });
    await expect(cloudApi.analyzeFood(cfg, 'not base64 !!', fetchImpl)).rejects.toMatchObject({ status: 400 });
    const noAi = wire(mem.store, { ...env, analyzeFood: undefined });
    await expect(cloudApi.analyzeFood(cfg, photo, noAi)).rejects.toMatchObject({ status: 503 });
    await expect(cloudApi.analyzeFood({ url: URL, token: 'x'.repeat(40) }, photo, fetchImpl)).rejects.toMatchObject({ status: 401 });
  });

  it('does not count a failed analysis against the limit', async () => {
    const mem = memoryStore();
    const env: Env = { inviteCodeHash: sha256Hex(INVITE), maxProfiles: 3, minUploadIntervalSeconds: 60, limits: { photo: { free: 1 } }, analyzeFood: async () => { throw new Error('IA: No se ve comida en la foto.'); } };
    const fetchImpl = wire(mem.store, env);
    const { token } = await signUp(fetchImpl, 'Ana');
    await expect(cloudApi.analyzeFood({ url: URL, token }, photo, fetchImpl)).rejects.toThrow('No se ve comida en la foto.');
    await expect(cloudApi.analyzeFood({ url: URL, token }, photo, fetchImpl)).rejects.toMatchObject({ status: 502 });
  });

  it('shares foods anonymously, searches them and lets only the author delete', async () => {
    const { fetchImpl, foods } = setup();
    const ana = await signUp(fetchImpl, 'Ana');
    const beto = await signUp(fetchImpl, 'Beto');
    const food = { name: 'Cucharada de chocolate', category: 'extra' as const, calories: 60, protein: 1, extras: { carbs: 7, bogus: 3 }, ingredients: ['chocolate'] };
    const { food: shared } = await cloudApi.sharePublicFood({ url: URL, token: ana.token }, food, fetchImpl);
    expect(shared).toMatchObject({ name: 'Cucharada de chocolate', extras: { carbs: 7 }, mine: true });
    expect(foods).toHaveLength(1);
    await expect(cloudApi.sharePublicFood({ url: URL, token: ana.token }, { ...food, name: '  ' }, fetchImpl)).rejects.toMatchObject({ status: 400 });

    const seen = await cloudApi.searchPublicFoods({ url: URL, token: beto.token }, 'choco', fetchImpl);
    expect(seen.foods).toHaveLength(1);
    expect(seen.foods[0]).toMatchObject({ mine: false });
    expect(JSON.stringify(seen)).not.toContain(ana.profile.id);
    expect((await cloudApi.searchPublicFoods({ url: URL, token: beto.token }, 'pizza', fetchImpl)).foods).toHaveLength(0);

    await expect(cloudApi.deletePublicFood({ url: URL, token: beto.token }, shared.id, fetchImpl)).rejects.toMatchObject({ status: 404 });
    await cloudApi.deletePublicFood({ url: URL, token: ana.token }, shared.id, fetchImpl);
    expect(foods).toHaveLength(0);
  });
});

describe('accounts, plans and rewarded videos', () => {
  const photo = 'A'.repeat(400);
  const analysis = { name: 'Tarta', items: [], calories: 400, protein: 12, carbs: 40, fat: 20, fiber: 2, confidence: 'media' as const };
  // Fake Supabase access tokens: "jwt.<user>.sig" maps to that account.
  const jwt = (user: string) => 'eyJhbGciOi.' + user.padEnd(24, '_') + '.signature';
  const users: Record<string, AuthUser> = {
    ana: { id: '11111111-1111-4111-8111-111111111111', email: 'ana@example.com', name: 'Ana' },
    beto: { id: '22222222-2222-4222-8222-222222222222', email: 'beto@example.com', name: null },
  };
  const verifyAuthToken = async (token: string) => users[token.split('.')[1].replace(/_+$/, '')] ?? null;

  function accounts(extra: Partial<Env> = {}) {
    const mem = memoryStore();
    const deleted: string[] = [];
    const env: Env = {
      inviteCodeHash: sha256Hex(INVITE), maxProfiles: 5, minUploadIntervalSeconds: 60, now: mem.now,
      analyzeFood: async () => analysis, verifyAuthToken, deleteAuthUser: async (id) => void deleted.push(id),
      verifyAdReward: async (raw) => raw.includes('signature=good'),
      ...extra,
    };
    return { ...mem, env, deleted, fetchImpl: wire(mem.store, env) };
  }
  const reward = (fetchImpl: FetchLike, user: string, tx: string, signature = 'good', kind = 'photo') =>
    fetchImpl(`${URL}/api/ads/reward?ad_network=1&custom_data=${kind}&transaction_id=${tx}&user_id=${user}&signature=${signature}&key_id=1`);

  it('creates the profile on the first call with an account and finds it afterwards', async () => {
    const { fetchImpl, profiles } = accounts();
    const first = await cloudApi.status({ url: URL, token: jwt('ana') }, fetchImpl);
    const again = await cloudApi.status({ url: URL, token: jwt('ana') }, fetchImpl);
    expect(first.profile).toMatchObject({ name: 'Ana' });
    expect(again.profile.id).toBe(first.profile.id);
    expect(profiles).toHaveLength(1);
    expect((await cloudApi.status({ url: URL, token: jwt('beto') }, fetchImpl)).profile.name).toBe('beto');
    await expect(cloudApi.status({ url: URL, token: jwt('nadie') }, fetchImpl)).rejects.toMatchObject({ status: 401 });
  });

  it('creates a single profile when the first requests of an account arrive together', async () => {
    const { fetchImpl, profiles } = accounts();
    const all = await Promise.all(Array.from({ length: 6 }, () => cloudApi.status({ url: URL, token: jwt('ana') }, fetchImpl)));
    expect(profiles).toHaveLength(1);
    expect(new Set(all.map((s) => s.profile.id)).size).toBe(1);
  });

  it('links an older install to the account, keeping its backups', async () => {
    const { fetchImpl, profiles } = accounts();
    const old = await signUp(fetchImpl, 'Santi');
    await cloudApi.status({ url: URL, token: jwt('ana') }, fetchImpl); // empty profile made on first use
    const linked = await cloudApi.linkProfile({ url: URL, token: jwt('ana') }, old.token, fetchImpl);
    expect(linked.profile.id).toBe(old.profile.id);
    expect(profiles).toHaveLength(1);
    expect((await cloudApi.status({ url: URL, token: jwt('ana') }, fetchImpl)).profile.id).toBe(old.profile.id);
    await expect(cloudApi.linkProfile({ url: URL, token: jwt('ana') }, 'mom_' + 'x'.repeat(40), fetchImpl)).rejects.toMatchObject({ status: 404 });
  });

  it('gives free accounts 2 photos, one more for every 2 videos (up to 3), and Pro 20', async () => {
    const { fetchImpl, env, store } = accounts();
    const ana = { url: URL, token: jwt('ana') };
    await cloudApi.analyzeFood(ana, photo, fetchImpl);
    const second = await cloudApi.analyzeFood(ana, photo, fetchImpl);
    expect(second.ai).toMatchObject({ pro: false, used: 2, limit: 2, bonusLeft: 3, videosPerExtra: 2 });
    await expect(cloudApi.analyzeFood(ana, photo, fetchImpl)).rejects.toMatchObject({ status: 429 });

    expect((await reward(fetchImpl, users.ana.id, 'tx1')).status).toBe(200);
    expect((await cloudApi.status(ana, fetchImpl)).ai).toMatchObject({ videos: 1, limit: 2 });
    await reward(fetchImpl, users.ana.id, 'tx1'); // the same video twice counts once
    await reward(fetchImpl, users.ana.id, 'tx2');
    expect((await cloudApi.status(ana, fetchImpl)).ai).toMatchObject({ videos: 2, bonus: 1, limit: 3, bonusLeft: 2 });
    expect((await reward(fetchImpl, users.ana.id, 'tx3', 'forged')).status).toBe(403);
    await cloudApi.analyzeFood(ana, photo, fetchImpl);
    for (const tx of ['a', 'b', 'c', 'd', 'e', 'f']) await reward(fetchImpl, users.ana.id, tx);
    expect((await cloudApi.status(ana, fetchImpl)).ai).toMatchObject({ bonus: 3, limit: 5, bonusLeft: 0 });

    const pro = wire(store, { ...env, checkPro: async (id) => id === users.ana.id });
    expect((await cloudApi.status(ana, pro)).ai).toMatchObject({ pro: true, limit: 20, bonusLeft: 0 });
  });

  it('gives free accounts 1 barcode a day, +1 per video up to 5, and Pro no practical limit', async () => {
    const product = { code: '7790310984147', name: 'Galletitas', brand: null, per100g: { calories: 430, protein: 9, carbs: 70, fat: 12, fiber: 3 }, servingGrams: 30 };
    const { fetchImpl, env, store } = accounts({ lookupBarcode: async (code) => (code === product.code ? product : null) });
    const ana = { url: URL, token: jwt('ana') };
    await expect(cloudApi.lookupBarcode(ana, '0000000000000', fetchImpl)).rejects.toMatchObject({ status: 404 }); // unknown: not counted
    expect(await cloudApi.lookupBarcode(ana, product.code, fetchImpl)).toMatchObject({ product, barcode: { used: 1, limit: 1, bonusLeft: 5 } });
    await expect(cloudApi.lookupBarcode(ana, product.code, fetchImpl)).rejects.toMatchObject({ status: 429 });
    await expect(cloudApi.lookupBarcode(ana, 'abc', fetchImpl)).rejects.toMatchObject({ status: 400 });
    await reward(fetchImpl, users.ana.id, 'b1', 'good', 'barcode');
    expect((await cloudApi.status(ana, fetchImpl)).barcode).toMatchObject({ limit: 2, bonus: 1, bonusLeft: 4 });
    expect((await cloudApi.status(ana, fetchImpl)).ai).toMatchObject({ videos: 0 }); // a barcode video is not a photo video
    for (const tx of ['b2', 'b3', 'b4', 'b5', 'b6', 'b7']) await reward(fetchImpl, users.ana.id, tx, 'good', 'barcode');
    expect((await cloudApi.status(ana, fetchImpl)).barcode).toMatchObject({ limit: 6, bonus: 5, bonusLeft: 0 });
    const pro = wire(store, { ...env, checkPro: async () => true });
    expect((await cloudApi.status(ana, pro)).barcode).toMatchObject({ pro: true, limit: 200 });
  });

  it('never goes past the limit with many photos at once, and gives back failed ones', async () => {
    let calls = 0;
    const { fetchImpl, store } = accounts({ analyzeFood: async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return analysis; } });
    const ana = { url: URL, token: jwt('ana') };
    await cloudApi.status(ana, fetchImpl);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => cloudApi.analyzeFood(ana, photo, fetchImpl)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(calls).toBe(2);
    const failing = wire(store, { ...accounts().env, analyzeFood: async () => { throw new Error('IA: ocupado'); } });
    const beto = { url: URL, token: jwt('beto') };
    await expect(cloudApi.analyzeFood(beto, photo, failing)).rejects.toMatchObject({ status: 502 });
    expect((await cloudApi.status(beto, failing)).ai).toMatchObject({ used: 0 });
  });

  it('older installs without an account keep 2 photos and cannot earn videos; a manual grant gives Pro', async () => {
    const { fetchImpl, profiles } = accounts();
    const old = await signUp(fetchImpl, 'Santi');
    expect((await cloudApi.status({ url: URL, token: old.token }, fetchImpl)).ai).toMatchObject({ limit: 2, bonusLeft: 0 });
    profiles[0].plan = 'pro';
    expect((await cloudApi.status({ url: URL, token: old.token }, fetchImpl)).ai).toMatchObject({ pro: true, limit: 20 });
  });

  it('answers AdMob\'s unsigned test call and ignores unknown accounts', async () => {
    const { fetchImpl } = accounts();
    expect((await fetchImpl(`${URL}/api/ads/reward`)).status).toBe(200);
    expect((await reward(fetchImpl, '99999999-9999-4999-8999-999999999999', 'tx')).status).toBe(404);
    expect((await reward(fetchImpl, "x' or 1=1 --", 'tx')).status).toBe(400);
  });

  it('writes the weekly summary only for Pro', async () => {
    const { fetchImpl, env, store } = accounts({ summarizeWeek: async (w) => 'Semana sólida: ' + String(w.gymDays) });
    const ana = { url: URL, token: jwt('ana') };
    await expect(cloudApi.weeklySummary(ana, { gymDays: 3 }, fetchImpl)).rejects.toMatchObject({ status: 402 });
    const pro = wire(store, { ...env, checkPro: async () => true });
    expect(await cloudApi.weeklySummary(ana, { gymDays: 3 }, pro)).toEqual({ text: 'Semana sólida: 3' });
    await cloudApi.weeklySummary(ana, { gymDays: 3 }, pro);
    await cloudApi.weeklySummary(ana, { gymDays: 3 }, pro);
    await expect(cloudApi.weeklySummary(ana, { gymDays: 3 }, pro)).rejects.toMatchObject({ status: 429 }); // 3 a day
    await expect(cloudApi.weeklySummary(ana, [] as unknown as Record<string, unknown>, pro)).rejects.toMatchObject({ status: 400 });
  });

  it('deleting the profile also deletes the account sign-in', async () => {
    const { fetchImpl, deleted, profiles } = accounts();
    await cloudApi.status({ url: URL, token: jwt('ana') }, fetchImpl);
    await cloudApi.deleteProfile({ url: URL, token: jwt('ana') }, fetchImpl);
    expect(profiles).toHaveLength(0);
    expect(deleted).toEqual([users.ana.id]);
  });
});

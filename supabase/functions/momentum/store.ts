import { createClient } from 'npm:@supabase/supabase-js@2';
import type { AuthUser, BackupMeta, BackupStore, NewBackup, Profile, PublicFood } from './handlers.ts';

/**
 * Profiles and backup metadata live in Postgres; each snapshot is a gzip file in the private
 * `backups` bucket (`<profile>/<backup>.json.gz`). Only this function's secret key can reach
 * either: the tables have RLS on with no policies, and the bucket is private.
 */

const BUCKET = 'backups';
const META = 'id, deviceId:device_id, schemaVersion:schema_version, localRevision:local_revision, checksum, sizeBytes:size_bytes, counts, createdAt:created_at, receivedAt:received_at';
const PROFILE = 'id, name, plan, createdAt:created_at';
const PUBLIC_FOOD = 'id, name, category, calories, protein, extras, ingredients, createdAt:created_at, profileId:profile_id';

const path = (profileId: string, id: string) => `${profileId}/${id}.json.gz`;
const iso = (v: string) => new Date(v).toISOString();
const toMeta = (r: BackupMeta): BackupMeta => ({ ...r, createdAt: iso(r.createdAt), receivedAt: iso(r.receivedAt) });
const toProfile = (r: Profile): Profile => ({ ...r, createdAt: iso(r.createdAt) });

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data: Blob): Promise<string> {
  return new Response(data.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? 'error desconocido'}`);
}

/** Server settings (invite code hash, limits) from the momentum_config table. */
export async function readConfig(url: string, secretKey: string): Promise<Record<string, string>> {
  const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.from('momentum_config').select('key, value');
  if (error) fail('No se pudo leer la configuración', error);
  return Object.fromEntries((data as { key: string; value: string }[]).map((r) => [r.key, r.value]));
}

/**
 * Supabase account helpers for the API: checks a person's access token (Supabase Auth verifies
 * it) and deletes an account when the person deletes their profile.
 */
export function createAuthHelpers(url: string, secretKey: string) {
  const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async verifyAuthToken(jwt: string): Promise<AuthUser | null> {
      const { data, error } = await db.auth.getUser(jwt);
      if (error || !data.user) return null;
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const name = [meta.full_name, meta.name].find((v) => typeof v === 'string' && v.trim()) as string | undefined;
      return { id: data.user.id, email: data.user.email ?? null, name: name?.trim() ?? null };
    },
    async deleteAuthUser(authUserId: string): Promise<void> {
      const { error } = await db.auth.admin.deleteUser(authUserId);
      if (error) fail('deleteAuthUser', error);
    },
  };
}

export function createSupabaseStore(url: string, secretKey: string): BackupStore {
  const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

  async function removeFiles(profileId: string, ids: string[]) {
    if (!ids.length) return;
    const { error } = await db.storage.from(BUCKET).remove(ids.map((id) => path(profileId, id)));
    if (error) fail('No se pudieron borrar archivos', error);
  }

  return {
    async countProfiles() {
      const { count, error } = await db.from('momentum_profiles').select('id', { count: 'exact', head: true });
      if (error) fail('countProfiles', error);
      return count ?? 0;
    },
    async createProfile(p) {
      const { data, error } = await db.from('momentum_profiles').insert({ id: p.id, name: p.name, token_hash: p.tokenHash, auth_user_id: p.authUserId ?? null }).select(PROFILE).single();
      if (error) fail('createProfile', error);
      return toProfile(data as Profile);
    },
    async findProfileByTokenHash(tokenHash) {
      const { data, error } = await db.from('momentum_profiles').select(PROFILE).eq('token_hash', tokenHash).maybeSingle();
      if (error) fail('findProfile', error);
      return data ? toProfile(data as Profile) : null;
    },
    async findProfileByAuthUser(authUserId) {
      const { data, error } = await db.from('momentum_profiles').select(PROFILE).eq('auth_user_id', authUserId).maybeSingle();
      if (error) fail('findProfileByAuthUser', error);
      return data ? toProfile(data as Profile) : null;
    },
    async setAuthUser(profileId, authUserId) {
      const { error } = await db.from('momentum_profiles').update({ auth_user_id: authUserId }).eq('id', profileId);
      if (error) fail('setAuthUser', error);
    },
    async setTokenHash(profileId, tokenHash) {
      const { error } = await db.from('momentum_profiles').update({ token_hash: tokenHash }).eq('id', profileId);
      if (error) fail('setTokenHash', error);
    },
    async deleteProfile(profileId) {
      const { data, error } = await db.from('momentum_backups').select('id').eq('profile_id', profileId);
      if (error) fail('deleteProfile', error);
      await removeFiles(profileId, (data ?? []).map((r: { id: string }) => r.id));
      const del = await db.from('momentum_profiles').delete().eq('id', profileId);
      if (del.error) fail('deleteProfile', del.error);
    },
    async count(profileId) {
      const { count, error } = await db.from('momentum_backups').select('id', { count: 'exact', head: true }).eq('profile_id', profileId);
      if (error) fail('count', error);
      return count ?? 0;
    },
    async list(profileId, limit) {
      const { data, error } = await db.from('momentum_backups').select(META).eq('profile_id', profileId).order('received_at', { ascending: false }).limit(limit);
      if (error) fail('list', error);
      return (data as BackupMeta[]).map(toMeta);
    },
    async get(profileId, id) {
      let query = db.from('momentum_backups').select(META).eq('profile_id', profileId);
      query = id === 'latest' ? query.order('received_at', { ascending: false }).limit(1) : query.eq('id', id).limit(1);
      const { data, error } = await query;
      if (error) fail('get', error);
      const row = (data as BackupMeta[])[0];
      if (!row) return null;
      const file = await db.storage.from(BUCKET).download(path(profileId, row.id));
      if (file.error || !file.data) fail('No se pudo leer el respaldo', file.error);
      return { ...toMeta(row), payload: await gunzip(file.data) };
    },
    async insert(profileId, b: NewBackup) {
      const existing = await db.from('momentum_backups').select('receivedAt:received_at').eq('id', b.id).eq('profile_id', profileId).maybeSingle();
      if (existing.error) fail('insert', existing.error);
      if (existing.data) return { inserted: false, receivedAt: iso((existing.data as { receivedAt: string }).receivedAt) };
      const compressed = await gzip(b.payload);
      const up = await db.storage.from(BUCKET).upload(path(profileId, b.id), compressed, { contentType: 'application/gzip', upsert: true });
      if (up.error) fail('No se pudo guardar el respaldo', up.error);
      const { data, error } = await db
        .from('momentum_backups')
        .insert({
          id: b.id,
          profile_id: profileId,
          device_id: b.deviceId,
          schema_version: b.schemaVersion,
          local_revision: b.localRevision,
          checksum: b.checksum,
          size_bytes: b.sizeBytes,
          stored_bytes: compressed.byteLength,
          counts: b.counts,
          created_at: b.createdAt,
        })
        .select('receivedAt:received_at')
        .single();
      if (error) {
        await removeFiles(profileId, [b.id]).catch(() => {});
        fail('insert', error);
      }
      return { inserted: true, receivedAt: iso((data as { receivedAt: string }).receivedAt) };
    },
    async remove(profileId, ids) {
      if (!ids.length) return;
      await removeFiles(profileId, ids);
      const { error } = await db.from('momentum_backups').delete().eq('profile_id', profileId).in('id', ids);
      if (error) fail('remove', error);
    },
    async usage(profileId, day, kind) {
      const { data, error } = await db.from('momentum_daily_usage').select('count, videos').eq('profile_id', profileId).eq('day', day).eq('kind', kind).maybeSingle();
      if (error) fail('usage', error);
      const row = data as { count: number; videos: number } | null;
      return { count: row?.count ?? 0, videos: row?.videos ?? 0 };
    },
    async tryUse(profileId, day, kind, limit) {
      const { data, error } = await db.rpc('momentum_try_use', { p_profile: profileId, p_day: day, p_kind: kind, p_limit: limit });
      if (error) fail('tryUse', error);
      return data === true;
    },
    async refundUse(profileId, day, kind) {
      const { error } = await db.rpc('momentum_refund_use', { p_profile: profileId, p_day: day, p_kind: kind });
      if (error) fail('refundUse', error);
    },
    async addVideo(profileId, day, kind, transactionId) {
      const { data, error } = await db.rpc('momentum_add_video', { p_profile: profileId, p_day: day, p_kind: kind, p_tx: transactionId });
      if (error) fail('addVideo', error);
      return data === true;
    },
    async searchPublicFoods(query, limit) {
      let q = db.from('momentum_public_foods').select(PUBLIC_FOOD).order('created_at', { ascending: false }).limit(limit);
      // ilike wildcards in the person's text are matched literally.
      if (query) q = q.ilike('name', `%${query.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
      const { data, error } = await q;
      if (error) fail('searchPublicFoods', error);
      return (data as (PublicFood & { profileId: string })[]).map((f) => ({ ...f, createdAt: iso(f.createdAt) }));
    },
    async countPublicFoods(profileId) {
      const { count, error } = await db.from('momentum_public_foods').select('id', { count: 'exact', head: true }).eq('profile_id', profileId);
      if (error) fail('countPublicFoods', error);
      return count ?? 0;
    },
    async createPublicFood(profileId, f) {
      const { data, error } = await db
        .from('momentum_public_foods')
        .insert({ profile_id: profileId, name: f.name, category: f.category, calories: f.calories, protein: f.protein, extras: f.extras, ingredients: f.ingredients })
        .select(PUBLIC_FOOD)
        .single();
      if (error) fail('createPublicFood', error);
      const { profileId: _p, ...food } = data as PublicFood & { profileId: string };
      return { ...food, createdAt: iso(food.createdAt) };
    },
    async accountKind(email) {
      const { data, error } = await db.rpc('momentum_account_kind', { p_email: email });
      if (error) fail('accountKind', error);
      return data === 'password' || data === 'google' ? data : 'none';
    },
    async deletePublicFood(profileId, id) {
      const { data, error } = await db.from('momentum_public_foods').delete().eq('id', id).eq('profile_id', profileId).select('id');
      if (error) fail('deletePublicFood', error);
      return (data ?? []).length > 0;
    },
  };
}

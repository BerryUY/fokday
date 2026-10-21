import { createClient } from 'npm:@supabase/supabase-js@2';
import type { BackupMeta, BackupStore, NewBackup, Profile } from './handlers.ts';

/**
 * Profiles and backup metadata live in Postgres; each snapshot is a gzip file in the private
 * `backups` bucket (`<profile>/<backup>.json.gz`). Only this function's secret key can reach
 * either: the tables have RLS on with no policies, and the bucket is private.
 */

const BUCKET = 'backups';
const META = 'id, deviceId:device_id, schemaVersion:schema_version, localRevision:local_revision, checksum, sizeBytes:size_bytes, counts, createdAt:created_at, receivedAt:received_at';
const PROFILE = 'id, name, plan, createdAt:created_at';

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
      const { data, error } = await db.from('momentum_profiles').insert({ id: p.id, name: p.name, token_hash: p.tokenHash }).select(PROFILE).single();
      if (error) fail('createProfile', error);
      return toProfile(data as Profile);
    },
    async findProfileByTokenHash(tokenHash) {
      const { data, error } = await db.from('momentum_profiles').select(PROFILE).eq('token_hash', tokenHash).maybeSingle();
      if (error) fail('findProfile', error);
      return data ? toProfile(data as Profile) : null;
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
  };
}

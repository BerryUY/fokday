-- Momentum backup storage. Only the `momentum` Edge Function (secret key) reaches these:
-- RLS is on with no policies, so the public (anon/authenticated) keys can read or write nothing.

create table public.momentum_config (
  key text primary key,
  value text not null
);

create table public.momentum_profiles (
  id uuid primary key,
  name text not null,
  token_hash text not null unique,   -- sha256 of the person's secret token; the token itself is never stored
  plan text not null default 'free', -- reserved for a future paid plan
  created_at timestamptz not null default now()
);

create table public.momentum_backups (
  id uuid primary key,
  profile_id uuid not null references public.momentum_profiles (id) on delete cascade,
  device_id text not null,
  schema_version integer not null,
  local_revision bigint not null,
  checksum text not null,            -- sha256 of the uncompressed snapshot JSON
  size_bytes integer not null,       -- uncompressed size
  stored_bytes integer not null,     -- gzip size in the `backups` bucket
  counts jsonb not null,
  created_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index momentum_backups_profile_idx on public.momentum_backups (profile_id, received_at desc);

alter table public.momentum_config enable row level security;
alter table public.momentum_profiles enable row level security;
alter table public.momentum_backups enable row level security;
revoke all on public.momentum_config, public.momentum_profiles, public.momentum_backups from anon, authenticated;

-- Snapshots: one gzip file per backup at <profile_id>/<backup_id>.json.gz, private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 10485760, array['application/gzip']);

insert into public.momentum_config (key, value) values
  ('max_profiles', '50'),
  ('min_upload_interval_seconds', '60');
-- The invite code hash is set separately (never committed):
--   insert into public.momentum_config values ('invite_code_sha256', '<sha256 hex of the code>');

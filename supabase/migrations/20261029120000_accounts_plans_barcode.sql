-- Accounts (Supabase Auth), daily limits per feature (AI photo, barcode) and rewarded videos.
-- Same rule as the rest: RLS on with no policies, only the Edge Function's secret key reaches them.

-- A profile can belong to a Supabase account; deleting the account deletes the profile.
alter table public.momentum_profiles add column auth_user_id uuid unique references auth.users (id) on delete cascade;

create table public.momentum_daily_usage (
  profile_id uuid not null references public.momentum_profiles (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('photo', 'barcode')),
  count integer not null default 0,
  videos integer not null default 0,
  primary key (profile_id, day, kind)
);

-- Each AdMob transaction counts once, even if Google retries the callback.
create table public.momentum_ad_rewards (
  transaction_id text primary key check (char_length(transaction_id) between 1 and 200),
  profile_id uuid not null references public.momentum_profiles (id) on delete cascade,
  kind text not null check (kind in ('photo', 'barcode')),
  created_at timestamptz not null default now()
);
create index momentum_ad_rewards_profile_idx on public.momentum_ad_rewards (profile_id);

alter table public.momentum_daily_usage enable row level security;
alter table public.momentum_ad_rewards enable row level security;
revoke all on public.momentum_daily_usage, public.momentum_ad_rewards from anon, authenticated;

-- Today's photo count carries over from the old table.
insert into public.momentum_daily_usage (profile_id, day, kind, count)
select profile_id, day, 'photo', count from public.momentum_ai_usage
on conflict do nothing;

create function public.momentum_add_usage(p_profile uuid, p_day date, p_kind text) returns void
language sql security invoker set search_path = '' as $$
  insert into public.momentum_daily_usage (profile_id, day, kind, count) values (p_profile, p_day, p_kind, 1)
  on conflict (profile_id, day, kind) do update set count = public.momentum_daily_usage.count + 1;
$$;

create function public.momentum_add_video(p_profile uuid, p_day date, p_kind text, p_tx text) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.momentum_ad_rewards (transaction_id, profile_id, kind) values (p_tx, p_profile, p_kind)
  on conflict (transaction_id) do nothing;
  if not found then
    return false;
  end if;
  insert into public.momentum_daily_usage (profile_id, day, kind, videos) values (p_profile, p_day, p_kind, 1)
  on conflict (profile_id, day, kind) do update set videos = public.momentum_daily_usage.videos + 1;
  return true;
end;
$$;

revoke execute on function public.momentum_add_usage(uuid, date, text) from public, anon, authenticated;
revoke execute on function public.momentum_add_video(uuid, date, text, text) from public, anon, authenticated;

-- Limits (editable without updating the app). Profiles are now created by signing in.
insert into public.momentum_config (key, value) values
  ('photo_free', '2'), ('photo_bonus_max', '3'), ('photo_videos_per_extra', '2'), ('photo_pro', '20'),
  ('barcode_free', '1'), ('barcode_bonus_max', '5'), ('barcode_videos_per_extra', '1'), ('barcode_pro', '200')
on conflict (key) do nothing;
insert into public.momentum_config (key, value) values ('max_profiles', '1000')
on conflict (key) do update set value = excluded.value;

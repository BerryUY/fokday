-- AI photo analysis (daily usage per profile) and the public food library.
-- Same rule as the rest: RLS on with no policies, only the Edge Function's secret key reaches them.

create table public.momentum_ai_usage (
  profile_id uuid not null references public.momentum_profiles (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (profile_id, day)
);

create table public.momentum_public_foods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.momentum_profiles (id) on delete cascade, -- never sent to other people
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (category in ('desayuno', 'almuerzo', 'merienda', 'cena', 'extra')),
  calories integer not null check (calories between 0 and 5000),
  protein real not null check (protein between 0 and 500),
  extras jsonb not null default '{}'::jsonb,
  ingredients jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index momentum_public_foods_created_idx on public.momentum_public_foods (created_at desc);
create index momentum_public_foods_profile_idx on public.momentum_public_foods (profile_id);

alter table public.momentum_ai_usage enable row level security;
alter table public.momentum_public_foods enable row level security;
revoke all on public.momentum_ai_usage, public.momentum_public_foods from anon, authenticated;

-- Atomic +1 for the daily AI counter.
create function public.momentum_add_ai_usage(p_profile uuid, p_day date) returns void
language sql security invoker set search_path = '' as $$
  insert into public.momentum_ai_usage (profile_id, day, count) values (p_profile, p_day, 1)
  on conflict (profile_id, day) do update set count = public.momentum_ai_usage.count + 1;
$$;
revoke execute on function public.momentum_add_ai_usage(uuid, date) from public, anon, authenticated;

insert into public.momentum_config (key, value) values ('ai_daily_limit', '30')
on conflict (key) do nothing;

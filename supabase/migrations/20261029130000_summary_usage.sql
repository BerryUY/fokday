-- The Pro weekly summary has a small daily cap, counted like the other limited features.
alter table public.momentum_daily_usage drop constraint momentum_daily_usage_kind_check;
alter table public.momentum_daily_usage add constraint momentum_daily_usage_kind_check check (kind in ('photo', 'barcode', 'summary'));
insert into public.momentum_config (key, value) values ('summary_pro', '3') on conflict (key) do nothing;

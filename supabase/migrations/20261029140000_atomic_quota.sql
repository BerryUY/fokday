-- Atomic daily limits: a use is reserved only while there is room, so parallel requests cannot
-- go past the limit (the row lock of the UPDATE serializes them). A failed use is given back.

create function public.momentum_try_use(p_profile uuid, p_day date, p_kind text, p_limit integer) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.momentum_daily_usage (profile_id, day, kind, count) values (p_profile, p_day, p_kind, 0)
  on conflict (profile_id, day, kind) do nothing;
  update public.momentum_daily_usage set count = count + 1
  where profile_id = p_profile and day = p_day and kind = p_kind and count < p_limit;
  return found;
end;
$$;

create function public.momentum_refund_use(p_profile uuid, p_day date, p_kind text) returns void
language sql security invoker set search_path = '' as $$
  update public.momentum_daily_usage set count = greatest(count - 1, 0)
  where profile_id = p_profile and day = p_day and kind = p_kind;
$$;

revoke execute on function public.momentum_try_use(uuid, date, text, integer) from public, anon, authenticated;
revoke execute on function public.momentum_refund_use(uuid, date, text) from public, anon, authenticated;

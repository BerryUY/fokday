-- How an email signs in, so a failed sign-in can say "no account with that email" or "that account
-- uses Google" instead of a vague "wrong email or password". Only the momentum Edge Function
-- (service role) can call it; the app never reaches auth.users directly.
create or replace function public.momentum_account_kind(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when u.id is null then 'none'
    when coalesce(u.encrypted_password, '') <> '' then 'password'
    else 'google'
  end
  from (select 1) as one
  left join auth.users u on lower(u.email) = lower(trim(p_email));
$$;

revoke all on function public.momentum_account_kind(text) from public, anon, authenticated;
grant execute on function public.momentum_account_kind(text) to service_role;

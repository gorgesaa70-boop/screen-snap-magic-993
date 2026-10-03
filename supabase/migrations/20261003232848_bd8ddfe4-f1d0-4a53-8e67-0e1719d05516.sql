alter table public.brokers add column if not exists account_type text not null default 'individual';
alter table public.brokers add constraint brokers_account_type_check check (account_type in ('office','individual'));
alter table public.brokers add column if not exists suspended_at timestamptz;

update public.brokers b set account_type = 'office'
  from public.plans p where p.id = b.plan_id and p.code = 'business';

create or replace function public.normalize_phone(_p text)
returns text language sql immutable set search_path = public as $$
  select case
    when d = '' then null
    when d ~ '^00' then substr(d, 3)
    when d ~ '^01[0125][0-9]{8}$' then '2' || d
    when d ~ '^1[0125][0-9]{8}$' then '20' || d
    else d end
  from (select regexp_replace(coalesce(_p,''), '\D', '', 'g') as d) s
$$;

create index if not exists brokers_phone_norm_idx on public.brokers (public.normalize_phone(phone));

create or replace function public.brokers_by_phone(_phone text)
returns table (id uuid, user_id uuid, is_active boolean, suspended boolean, account_type text)
language sql stable security definer set search_path = public as $$
  select b.id, b.user_id, b.is_active, b.suspended_at is not null, b.account_type
  from public.brokers b
  where public.normalize_phone(b.phone) = public.normalize_phone(_phone)
$$;
revoke all on function public.brokers_by_phone(text) from public, anon, authenticated;
grant execute on function public.brokers_by_phone(text) to service_role;

create or replace function public.auth_user_ids_by_phone(_phone text)
returns setof uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where public.normalize_phone(phone) = public.normalize_phone(_phone)
$$;
revoke all on function public.auth_user_ids_by_phone(text) from public, anon, authenticated;
grant execute on function public.auth_user_ids_by_phone(text) to service_role;

create or replace function public.brokers_guard()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.has_role(auth.uid(), 'admin') and coalesce(auth.role(), '') <> 'service_role' then
    new.is_active := old.is_active;
    new.plan_id := old.plan_id;
    new.user_id := old.user_id;
    new.slug := old.slug;
    new.is_demo := old.is_demo;
    new.account_type := old.account_type;
    new.suspended_at := old.suspended_at;
    new.phone := old.phone;
  end if;
  new.updated_at := now();
  return new;
end $function$;

alter table public.auth_events drop constraint auth_events_event_check;
alter table public.auth_events add constraint auth_events_event_check check (event = any (array[
 'otp_requested','otp_resent','otp_verified','otp_failed','otp_locked','signed_out','phone_change_requested','phone_changed','join_requested',
 'wa_otp_sent','wa_otp_send_failed','wa_otp_verified','wa_otp_failed','wa_otp_locked','wa_otp_rate_limited',
 'wa_login_conflict','wa_login_suspended','wa_phone_changed','wa_phone_change_conflict']));
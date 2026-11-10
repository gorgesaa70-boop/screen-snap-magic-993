-- فاليو عقار — إصدار 56: أجهزة التطبيق الجديد للإشعارات. ينفع يتشغل تاني. مستقل عن الإصدارات التانية.
--   20261110100000_app-devices.sql

begin;
-- Native app devices (release 56): the new Value Aqar app (React Native) registers its push token here.
-- * One row per device token (FCM for Android, and for iPhone through Firebase too); the device belongs to whoever
--   is signed in on it now. Ten devices per account; the oldest makes room.
-- * A notification is queued for push when the user has a browser subscription OR an app device.
-- * Sending lives in the site (/api/public/push/dispatch); it does nothing for app devices until FIREBASE_SERVICE_ACCOUNT is set.
-- Additive only; re-runnable. Independent of the other releases.

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 4096),
  platform text not null check (platform in ('android','ios')),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_devices_user_idx on public.push_devices (user_id);
alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon;
grant select on public.push_devices to authenticated;
grant all on public.push_devices to service_role;
drop policy if exists "own app devices read" on public.push_devices;
create policy "own app devices read" on public.push_devices for select to authenticated using (user_id = auth.uid());

create or replace function public.register_push_device(_token text, _platform text, _app_version text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid uuid;
begin
  if me is null then raise exception 'سجّل دخول الأول' using errcode = '42501'; end if;
  if _platform not in ('android','ios') then raise exception 'نوع جهاز غير معروف' using errcode = '22023'; end if;
  if (select count(*) from public.push_devices where user_id = me and token <> _token) >= 10 then
    delete from public.push_devices where id = (select id from public.push_devices where user_id = me order by coalesce(last_used_at, created_at) limit 1);
  end if;
  insert into public.push_devices (user_id, token, platform, app_version)
  values (me, _token, _platform, left(_app_version, 40))
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, app_version = excluded.app_version, failed_count = 0
  returning id into rid;
  return rid;
end $$;
revoke execute on function public.register_push_device(text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text) to authenticated;

-- Sign-out: the app forgets its token for this account.
create or replace function public.unregister_push_device(_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_devices where token = _token and user_id = auth.uid()
$$;
revoke execute on function public.unregister_push_device(text) from public, anon;
grant execute on function public.unregister_push_device(text) to authenticated;

-- Same as release 21, plus app devices.
create or replace function public.notifications_mark_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare kinds text[];
begin
  if not exists (select 1 from public.push_subscriptions where user_id = new.user_id)
     and not exists (select 1 from public.push_devices where user_id = new.user_id) then return new; end if;
  select push_types into kinds from public.notification_preferences where user_id = new.user_id;
  if kinds is null or new.type = any(kinds) then new.push_status := 'pending'; end if;
  return new;
end $$;
revoke execute on function public.notifications_mark_push() from public, anon, authenticated;
commit;

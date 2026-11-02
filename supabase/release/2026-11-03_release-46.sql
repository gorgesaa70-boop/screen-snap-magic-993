-- فاليو عقار — إصدار 46: مواعيد نشر ثابتة على السوشيال — كل بوست بينزل على فيسبوك وإنستجرام وتيك توك في نفس الدقيقة.
-- * مواعيد النشر بتوقيت مصر (8 في اليوم افتراضيًا) تتغير من لوحة الإدارة؛ أقرب ميعادين بس بيتحجزوا فالجديد دايمًا قبل القديم.
-- * زرار «انشر العقارات الموجودة» بيحط العقارات اللي على الموقع في الطابور (الأحدث الأول).
-- إضافة بس، ينفع يتشغل تاني. بعد إصدار 45.
--   20261103200000_social-slots.sql

begin;
-- Social auto-post, fixed times (release 46): every post goes out on Facebook, Instagram and TikTok at the same minute,
-- at times the admin picks (app_settings.social_slots, Cairo hours; 8 a day by default). Only the next
-- social_lookahead times are booked, so a newly approved listing still takes the first free time and the backlog
-- waits behind it. social_backfill() (admin) queues the listings that were already on the site, oldest last.
-- Additive only; re-runnable. After release 45.

alter table public.social_posts add column if not exists scheduled_for timestamptz;
create index if not exists social_posts_scheduled_idx on public.social_posts (scheduled_for) where scheduled_for is not null;

alter table public.app_settings add column if not exists social_slots smallint[] not null default array[9,11,13,15,17,19,21,23]::smallint[];
alter table public.app_settings add column if not exists social_lookahead smallint not null default 2;
do $$
begin
  alter table public.app_settings add constraint app_settings_social_slots_check
    check (cardinality(social_slots) between 1 and 24 and 0 <= all (social_slots) and 23 >= all (social_slots));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.app_settings add constraint app_settings_social_lookahead_check check (social_lookahead between 1 and 10);
exception when duplicate_object then null;
end $$;

-- The next free posting times: the first social_lookahead upcoming times (Cairo), minus those a post already holds.
create or replace function public.social_free_slots()
returns setof timestamptz language sql stable security definer set search_path = public as $$
  with s as (select social_slots, social_lookahead from public.app_settings where id = 1),
  cand as (
    select distinct (d + make_interval(hours => h)) at time zone 'Africa/Cairo' as t
    from s,
      generate_series((now() at time zone 'Africa/Cairo')::date::timestamp, (now() at time zone 'Africa/Cairo')::date::timestamp + interval '3 days', interval '1 day') d,
      unnest(s.social_slots) h
  ),
  upcoming as (
    select t from cand where t > now() + interval '5 minutes' order by t limit (select social_lookahead from s)
  )
  select u.t from upcoming u
  where not exists (select 1 from public.social_posts p where p.scheduled_for = u.t and p.status <> 'skipped')
  order by u.t;
$$;
revoke execute on function public.social_free_slots() from public, anon;
grant execute on function public.social_free_slots() to authenticated, service_role;

-- Claiming now books the times: a retry keeps its time while it is still ahead; everything else gets the next
-- free time, newest listing first.
create or replace function public.social_claim(_n integer default 3)
returns setof public.social_posts language plpgsql security definer set search_path = public as $$
declare free timestamptz[]; ids uuid[]; i integer; lim integer := greatest(1, least(_n, 10));
begin
  return query
  update public.social_posts p set status = 'processing', attempts = p.attempts + 1, updated_at = now()
  where p.id in (
    select id from public.social_posts
    where status in ('pending','partial') and next_attempt_at <= now() and scheduled_for > now() + interval '2 minutes'
    order by scheduled_for limit lim
    for update skip locked)
  returning p.*;

  free := array(select public.social_free_slots());
  if coalesce(array_length(free, 1), 0) = 0 then return; end if;
  ids := array(
    select id from public.social_posts
    where status in ('pending','partial') and next_attempt_at <= now()
      and (scheduled_for is null or scheduled_for <= now() + interval '2 minutes')
    order by created_at desc limit least(lim, array_length(free, 1))
    for update skip locked);
  for i in 1 .. coalesce(array_length(ids, 1), 0) loop
    return query
    update public.social_posts p set status = 'processing', attempts = p.attempts + 1, scheduled_for = free[i], updated_at = now()
    where p.id = ids[i]
    returning p.*;
  end loop;
end $$;
revoke execute on function public.social_claim(integer) from public, anon, authenticated;
grant execute on function public.social_claim(integer) to service_role;

-- The database only calls the site when a post is due and (for new ones) a time is free.
create or replace function public.call_social_dispatch()
returns void language plpgsql security definer set search_path = public as $$
declare site text; sec text;
begin
  update public.social_posts set status = 'pending', updated_at = now()
  where status = 'processing' and updated_at < now() - interval '15 minutes';
  if not exists (
    select 1 from public.social_posts
    where status in ('pending','partial') and next_attempt_at <= now()
      and (scheduled_for > now() + interval '2 minutes' or exists (select 1 from public.social_free_slots()))
  ) then return; end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null or to_regclass('public.push_config') is null then return; end if;
  execute 'select site_url, secret from public.push_config where id = 1' into site, sec;
  if sec is null then return; end if;
  execute 'select net.http_post(url := $1, body := $2, params := ''{}''::jsonb, headers := $3, timeout_milliseconds := 60000)'
    using site || '/api/public/social/dispatch', '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', sec);
exception when others then
  perform public.log_app_error('server', left('call_social_dispatch: ' || sqlerrm, 500), '', 'pg_cron call_social_dispatch', '');
end $$;
revoke execute on function public.call_social_dispatch() from public, anon, authenticated;
grant execute on function public.call_social_dispatch() to service_role;

-- «انشر العقارات الموجودة»: queues every approved, available listing that isn't queued yet (same filters as new
-- ones). They keep the listing's own date, so newer listings — and any listing approved later — go first.
create or replace function public.social_backfill()
returns integer language plpgsql security definer set search_path = public as $$
declare s record; n integer;
begin
  if not public.has_role(auth.uid(), 'admin') and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'admins only';
  end if;
  select social_categories into s from public.app_settings where id = 1;
  insert into public.social_posts (property_id, created_at, next_attempt_at)
  select p.id, p.created_at, now()
  from public.properties p
  where p.review_status = 'approved' and not coalesce(p.is_demo, false)
    and coalesce(p.availability, 'available') = 'available'
    and coalesce(p.category, 'residential') = any (s.social_categories)
  on conflict (property_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.social_backfill() from public, anon;
grant execute on function public.social_backfill() to authenticated, service_role;
commit;

-- فاليو عقار — إصدار 45: النشر التلقائي على فيسبوك وإنستجرام وتيك توك (Buffer).
-- * زرار في لوحة الإدارة ← الإعدادات ← النشر على السوشيال (مقفول لحد ما الأدمن يشغّله). أي عقار جديد يتوافق عليه بعد التشغيل
--   بيدخل طابور، والموقع بيعمله صورة بشكل فاليو عقار ونص بالهاشتاجات ويبعته لـ Buffer. الأحدث الأول.
--   قاعدة البيانات بتنادي الموقع كل دقيقتين لو فيه حاجة مستنية بس.
-- إضافة بس، ينفع يتشغل تاني. بعد إصدار 44. محتاج Publish + Secret اسمه BUFFER_API_KEY.
--   20261103100000_social-autopost.sql

begin;
-- Social auto-post: every newly approved listing goes to Facebook, Instagram and TikTok through Buffer, by itself.
-- * app_settings.social_autopost (admin switch, off by default) + social_since (set when switched on: only listings
--   created after that are posted, so turning it on never floods the old ones) + social_channels + social_categories.
-- * social_posts: one row per listing (unique), filled by a trigger when a listing becomes approved. The site route
--   /api/public/social/dispatch (called by the database every 2 minutes, secret from push_config) draws the card image,
--   writes the caption and adds the post to each channel's Buffer queue. Rows wait 10 minutes first so an admin can
--   press «ماتنشرش». Results per channel are kept in results; admins are notified when a post goes out or fails.
-- Additive only; re-runnable. After release 44.

alter table public.app_settings add column if not exists social_autopost boolean not null default false;
alter table public.app_settings add column if not exists social_since timestamptz;
alter table public.app_settings add column if not exists social_channels text[] not null default array['facebook','instagram','tiktok'];
alter table public.app_settings add column if not exists social_categories text[] not null default array['residential'];

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique references public.properties(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','posted','partial','failed','skipped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now() + interval '10 minutes',
  card_url text,
  caption text,
  results jsonb not null default '{}'::jsonb,
  error text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_posts_due_idx on public.social_posts (next_attempt_at) where status in ('pending','partial');

alter table public.social_posts enable row level security;
grant select, update on public.social_posts to authenticated;
grant all on public.social_posts to service_role;
drop policy if exists "admins read social posts" on public.social_posts;
create policy "admins read social posts" on public.social_posts for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "admins manage social posts" on public.social_posts;
create policy "admins manage social posts" on public.social_posts for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Admins may only skip a post or send it again; everything else is written by the dispatcher (service role).
create or replace function public.social_posts_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Signed-in users (the admin) are limited; the dispatcher (service role) and the scheduler (no user) are not.
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.status = 'skipped' and old.status in ('pending','partial','failed') then
    new := old;
    new.status := 'skipped';
  elsif new.status = 'pending' and old.status in ('failed','skipped','partial') then
    new := old;
    new.status := 'pending'; new.attempts := 0; new.next_attempt_at := now(); new.error := null;
  else
    raise exception 'social post: only skip or retry';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.social_posts_guard() from public, anon, authenticated;
drop trigger if exists social_posts_guard on public.social_posts;
create trigger social_posts_guard before update on public.social_posts for each row execute function public.social_posts_guard();

-- Switching the auto-post on starts the clock: listings created before that are never posted.
create or replace function public.app_settings_social_since()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.social_autopost and not coalesce(old.social_autopost, false) then new.social_since := now(); end if;
  return new;
end $$;
revoke execute on function public.app_settings_social_since() from public, anon, authenticated;
drop trigger if exists app_settings_social_since on public.app_settings;
create trigger app_settings_social_since before update of social_autopost on public.app_settings
  for each row execute function public.app_settings_social_since();

-- A listing that becomes approved (first time) joins the queue when the switch is on and it matches the settings.
create or replace function public.social_enqueue()
returns trigger language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if new.review_status is distinct from 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.review_status = 'approved' then return new; end if;
  if coalesce(new.is_demo, false) then return new; end if;
  select social_autopost, social_since, social_categories into s from public.app_settings where id = 1;
  if not coalesce(s.social_autopost, false) or s.social_since is null then return new; end if;
  if new.created_at < s.social_since then return new; end if;
  if not (coalesce(new.category, 'residential') = any (s.social_categories)) then return new; end if;
  if coalesce(new.availability, 'available') <> 'available' then return new; end if;
  insert into public.social_posts (property_id) values (new.id) on conflict (property_id) do nothing;
  return new;
end $$;
revoke execute on function public.social_enqueue() from public, anon, authenticated;
drop trigger if exists social_enqueue on public.properties;
create trigger social_enqueue after insert or update of review_status on public.properties
  for each row execute function public.social_enqueue();

-- The dispatcher claims due rows (no two runs take the same one), newest listings first: when many arrive at once
-- the latest go out first and the older ones wait (the route adds each with Buffer's «share next», oldest of the
-- batch first, so the newest ends up at the front of the queue) ...
create or replace function public.social_claim(_n integer default 3)
returns setof public.social_posts language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.social_posts p set status = 'processing', attempts = p.attempts + 1, updated_at = now()
  where p.id in (
    select id from public.social_posts
    where status in ('pending','partial') and next_attempt_at <= now()
    order by created_at desc limit greatest(1, least(_n, 10))
    for update skip locked)
  returning p.*;
end $$;
revoke execute on function public.social_claim(integer) from public, anon, authenticated;
grant execute on function public.social_claim(integer) to service_role;

-- ... and reports back. posted / failed notify the admins; partial (a channel's queue is full) and pending try again
-- later; skipped (the listing was taken down meanwhile) just stops.
create or replace function public.social_finish(_id uuid, _status text, _results jsonb, _error text,
  _card_url text default null, _caption text default null, _retry_minutes integer default 60)
returns void language plpgsql security definer set search_path = public as $$
declare p record; code text;
begin
  if _status not in ('posted','partial','failed','pending','skipped') then raise exception 'bad status'; end if;
  update public.social_posts set
    status = _status, results = coalesce(_results, results), error = nullif(_error, ''),
    card_url = coalesce(_card_url, card_url), caption = coalesce(_caption, caption),
    posted_at = case when _status = 'posted' then now() else posted_at end,
    next_attempt_at = now() + make_interval(mins => greatest(1, _retry_minutes)), updated_at = now()
  where id = _id;
  if _status not in ('posted','failed') then return; end if;
  select pr.id, pr.title, pr.listing_no into p from public.social_posts sp join public.properties pr on pr.id = sp.property_id where sp.id = _id;
  code := coalesce('VA-' || p.listing_no, '');
  if _status = 'posted' then
    perform public.notify_admins('admin', 'اتنشر عقار على السوشيال', trim(code || ' ' || coalesce(p.title, '')), p.id, '/admin?tab=social');
  else
    perform public.notify_admins('admin', 'فشل نشر عقار على السوشيال',
      trim(code || ' ' || coalesce(p.title, '')) || ' — ' || left(coalesce(_error, ''), 200), p.id, '/admin?tab=social');
  end if;
end $$;
revoke execute on function public.social_finish(uuid, text, jsonb, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.social_finish(uuid, text, jsonb, text, text, text, integer) to service_role;

-- The database calls the site every 2 minutes, only when something is due (no empty requests).
create or replace function public.call_social_dispatch()
returns void language plpgsql security definer set search_path = public as $$
declare site text; sec text;
begin
  if not exists (select 1 from public.social_posts where status in ('pending','partial') and next_attempt_at <= now()) then
    -- A run that died mid-way leaves rows in processing; give them back after 15 minutes.
    update public.social_posts set status = 'pending', updated_at = now()
    where status = 'processing' and updated_at < now() - interval '15 minutes';
    return;
  end if;
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

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'value-aqar-social';
    perform cron.schedule('value-aqar-social', '*/2 * * * *', 'select public.call_social_dispatch()');
  end if;
end $$;
commit;

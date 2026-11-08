-- فاليو عقار — إصدار 53: تأكيد الإعلانات وأرقام أداء التطبيق. ينفع يتشغل تاني. مستقل عن الإصدارات التانية.
--   20261108400000_trust-and-metrics.sql

begin;
-- Fresh listings and app numbers (release 53).
-- * Every listing has a «last confirmed» date. After 30 days its owner is asked once; after 60 days with no answer it is hidden, never deleted.
-- * Only owners we can reach are ever hidden. Malls, industrial units and Value Aqar's own exempt accounts are left alone.
-- * The clock starts when this release is applied, so nothing is hidden for 60 days.
-- * app_opens / app_searches: anonymous device counts for «أداء التطبيق», nothing personal, kept 180 days.
-- Re-runnable.

alter table public.properties
  add column if not exists confirmed_at timestamptz not null default now(),
  add column if not exists stale_notified_at timestamptz,
  add column if not exists stale_hidden_at timestamptz;
create index if not exists properties_stale_check on public.properties (confirmed_at) where review_status = 'approved' and stale_hidden_at is null;

-- Owners can't move these dates by hand; changing the listing itself counts as confirming it.
-- A listing hidden for being stale stays hidden even when a plan renewal unhides the account's listings.
create or replace function public.properties_freshness_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare trusted boolean := public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null
  or coalesce(current_setting('va.listing_confirm', true), '') = '1';
begin
  if not trusted then
    new.confirmed_at := old.confirmed_at; new.stale_notified_at := old.stale_notified_at; new.stale_hidden_at := old.stale_hidden_at;
    if (new.price, new.status, new.title, new.description) is distinct from (old.price, old.status, old.title, old.description) then
      new.confirmed_at := now(); new.stale_notified_at := null;
    end if;
  end if;
  if new.stale_hidden_at is not null then new.hidden_by_plan := true; end if;
  return new;
end $$;
revoke execute on function public.properties_freshness_guard() from public, anon, authenticated;
drop trigger if exists zz_properties_freshness_guard on public.properties;
create trigger zz_properties_freshness_guard before update on public.properties for each row execute function public.properties_freshness_guard();

create or replace function public.confirm_listing(_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare p public.properties; ph text;
begin
  select * into p from public.properties where id = _id for update;
  if p.id is null then raise exception 'الإعلان مش موجود' using errcode = 'P0001'; end if;
  select l.phone_norm into ph from public.leads l where l.id = p.owner_lead_id;
  if not ((p.broker_id is not null and p.broker_id = public.current_broker_id())
          or (p.broker_id is null and ph is not null and ph = public.my_phone())
          or public.staff_can('review', 'edit')) then
    raise exception 'الإعلان ده مش بتاعك' using errcode = '42501';
  end if;
  perform set_config('va.listing_confirm', '1', true);
  perform set_config('va.plan_sync', '1', true);
  update public.properties set confirmed_at = now(), stale_notified_at = null, stale_hidden_at = null,
    hidden_by_plan = case when p.stale_hidden_at is not null then false else hidden_by_plan end
  where id = _id;
  -- Coming back must still respect the plan's limit.
  if p.stale_hidden_at is not null then
    if p.broker_id is not null then perform public.sync_broker_access(p.broker_id, true);
    elsif ph is not null then perform public.sync_owner_access(ph, true); end if;
  end if;
  perform set_config('va.listing_confirm', '', true);
  perform set_config('va.plan_sync', '', true);
  return now();
end $$;
revoke execute on function public.confirm_listing(uuid) from public, anon;
grant execute on function public.confirm_listing(uuid) to authenticated;

-- The owner's listings with their dates (next to my_owner_listings, whose columns older clients rely on).
create or replace function public.my_listing_freshness()
returns table (id uuid, confirmed_at timestamptz, stale_hidden_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.confirmed_at, p.stale_hidden_at
  from public.properties p left join public.leads l on l.id = p.owner_lead_id
  where (p.broker_id is not null and p.broker_id = public.current_broker_id())
     or (p.broker_id is null and public.my_phone() is not null and l.phone_norm = public.my_phone())
$$;
revoke execute on function public.my_listing_freshness() from public, anon;
grant execute on function public.my_listing_freshness() to authenticated;

-- One notification per account, however many listings it covers.
create or replace function public.run_stale_listings()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; done integer := 0;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.has_role(auth.uid(), 'admin')) then raise exception 'غير مسموح' using errcode = '42501'; end if;
  perform set_config('va.listing_confirm', '1', true);
  for r in
    with eligible as (
      select p.id, p.confirmed_at, p.stale_notified_at, p.broker_id, l.phone_norm,
        coalesce(b.user_id, public.phone_user_id(l.phone_norm)) uid
      from public.properties p
      left join public.brokers b on b.id = p.broker_id
      left join public.leads l on l.id = p.owner_lead_id
      where p.review_status = 'approved' and p.stale_hidden_at is null and not p.hidden_by_plan and not p.is_demo
        and p.confirmed_at < now() - interval '30 days'
        and coalesce(p.category, '') not in ('mall', 'industrial')
        and not coalesce(b.plan_exempt, false)
    )
    select uid, bool_or(broker_id is not null) is_account,
      array_agg(id) filter (where stale_notified_at is null) to_ask,
      array_agg(id) filter (where stale_notified_at < now() - interval '25 days' and confirmed_at < now() - interval '60 days') to_hide
    from eligible where uid is not null group by uid limit 200
  loop
    if r.to_ask is not null then
      update public.properties set stale_notified_at = now() where id = any(r.to_ask);
      perform public.notify_user(r.uid, 'request_status', 'إعلاناتك لسه متاحة؟',
        'عندك ' || cardinality(r.to_ask) || ' إعلان محتاج تأكيد، ولو ماتأكدش هيستخبى عن الزوار بعد 30 يوم.', null,
        case when r.is_account then '/dashboard?tab=properties' else '/my-listings' end);
      done := done + 1;
    end if;
    if r.to_hide is not null then
      update public.properties set stale_hidden_at = now(), hidden_by_plan = true where id = any(r.to_hide);
      perform public.notify_user(r.uid, 'request_status', 'في إعلانات استخبت عن الزوار',
        cardinality(r.to_hide) || ' إعلان ماتأكدش من 60 يوم. أكّده بضغطة وهيرجع على طول، ومفيش حاجة اتمسحت.', null,
        case when r.is_account then '/dashboard?tab=properties' else '/my-listings' end);
      done := done + 1;
    end if;
  end loop;
  perform set_config('va.listing_confirm', '', true);
  return done;
end $$;
revoke execute on function public.run_stale_listings() from public, anon;
grant execute on function public.run_stale_listings() to authenticated;

-- Anonymous app numbers.
create table if not exists public.app_opens (
  day date not null default ((now() at time zone 'Africa/Cairo')::date),
  device text not null check (char_length(device) between 8 and 64),
  platform text not null check (platform in ('web','android','ios')),
  primary key (day, device)
);
create table if not exists public.app_searches (
  id bigint generated always as identity primary key,
  device text not null check (char_length(device) between 8 and 64),
  label text not null check (char_length(label) between 1 and 160),
  results integer not null check (results >= 0),
  created_at timestamptz not null default now()
);
create index if not exists app_searches_time on public.app_searches (created_at desc);
create index if not exists app_searches_device on public.app_searches (device, created_at desc);
alter table public.app_opens enable row level security;
alter table public.app_searches enable row level security;
grant all on public.app_opens, public.app_searches to service_role;

create or replace function public.track_app_open(_device text, _platform text)
returns void language sql security definer set search_path = public as $$
  insert into public.app_opens (device, platform)
  select _device, _platform where _device ~ '^[A-Za-z0-9_-]{8,64}$' and _platform in ('web','android','ios')
  on conflict do nothing
$$;
revoke execute on function public.track_app_open(text, text) from public;
grant execute on function public.track_app_open(text, text) to anon, authenticated;

create or replace function public.track_app_search(_device text, _label text, _results integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _device !~ '^[A-Za-z0-9_-]{8,64}$' or nullif(btrim(_label), '') is null or _results is null or _results < 0 then return; end if;
  -- A device can't flood the numbers.
  if (select count(*) from public.app_searches where device = _device and created_at > now() - interval '1 day') >= 100 then return; end if;
  insert into public.app_searches (device, label, results) values (_device, left(btrim(_label), 160), least(_results, 100000));
end $$;
revoke execute on function public.track_app_search(text, text, integer) from public;
grant execute on function public.track_app_search(text, text, integer) to anon, authenticated;

create or replace function public.run_app_metrics_cleanup()
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.has_role(auth.uid(), 'admin')) then raise exception 'غير مسموح' using errcode = '42501'; end if;
  delete from public.app_opens where day < current_date - 180;
  delete from public.app_searches where created_at < now() - interval '180 days';
  return 0;
end $$;
revoke execute on function public.run_app_metrics_cleanup() from public, anon;
grant execute on function public.run_app_metrics_cleanup() to authenticated;

create or replace function public.admin_app_stats(_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d integer := least(greatest(coalesce(_days, 30), 1), 180); since date := current_date - d; res jsonb;
begin
  if not public.staff_can('reports', 'view') then raise exception 'غير مسموح' using errcode = '42501'; end if;
  select jsonb_build_object(
    'days', d,
    'devices', (select count(distinct device) from public.app_opens where day >= since),
    'today', (select count(*) from public.app_opens where day = (now() at time zone 'Africa/Cairo')::date),
    'platforms', coalesce((select jsonb_object_agg(platform, n) from (select platform, count(distinct device) n from public.app_opens where day >= since group by 1) x), '{}'),
    'searches', (select count(*) from public.app_searches where created_at >= since),
    'search_devices', (select count(distinct device) from public.app_searches where created_at >= since),
    'top', coalesce((select jsonb_agg(x) from (select label, count(*) n from public.app_searches where created_at >= since group by 1 order by 2 desc limit 10) x), '[]'),
    'empty', coalesce((select jsonb_agg(x) from (select label, count(*) n from public.app_searches where created_at >= since and results = 0 group by 1 order by 2 desc limit 10) x), '[]'),
    'views', coalesce((select sum(views) from public.listing_stats_daily where day >= since), 0),
    'contacts', coalesce((select sum(contacts) from public.listing_stats_daily where day >= since), 0),
    'requests', (select count(*) from public.leads where created_at >= since),
    'approved', (select count(*) from public.properties where review_status = 'approved' and not is_demo),
    'verified', (select count(*) from public.properties where review_status = 'approved' and not is_demo and verified_at is not null),
    'asked', (select count(*) from public.properties where review_status = 'approved' and stale_notified_at is not null and stale_hidden_at is null),
    'hidden', (select count(*) from public.properties where stale_hidden_at is not null)
  ) into res;
  return res;
end $$;
revoke execute on function public.admin_app_stats(integer) from public, anon;
grant execute on function public.admin_app_stats(integer) to authenticated;

-- The scheduler runs the two new jobs with the others.
create or replace function public.run_scheduled_jobs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare job text; failed text[] := '{}';
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  foreach job in array array['run_lead_transfers', 'run_subscription_expiry', 'run_service_subscriptions', 'run_listing_expiry',
                              'run_service_offers', 'run_referrals', 'run_reminders', 'run_stale_listings', 'run_app_metrics_cleanup'] loop
    begin
      execute format('select public.%I()', job);
    exception when others then
      failed := failed || job;
      perform public.log_app_error('server', left(job || ': ' || sqlerrm, 500), '', 'pg_cron run_scheduled_jobs', '');
    end;
  end loop;
  return jsonb_build_object('failed', to_jsonb(failed));
end $$;
revoke execute on function public.run_scheduled_jobs() from public, anon, authenticated;
grant execute on function public.run_scheduled_jobs() to service_role;
commit;

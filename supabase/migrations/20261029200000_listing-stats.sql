-- Listing statistics for every account: how often each listing showed (in lists), was opened, and had its
-- WhatsApp / call buttons pressed, per day and by where the visitor came from; requests come from leads.
-- Counted once per device per day (a random id kept in the browser — nothing personal is stored), and an
-- account's own views don't count. What an account sees follows its plan (basic / full / report).

create table if not exists public.listing_stats_daily (
  property_id uuid not null references public.properties(id) on delete cascade,
  day date not null,
  impressions integer not null default 0,
  views integer not null default 0,
  contacts integer not null default 0,
  sources jsonb not null default '{}'::jsonb,
  primary key (property_id, day)
);
create index if not exists listing_stats_daily_day_idx on public.listing_stats_daily (day);
alter table public.listing_stats_daily enable row level security;
grant all on public.listing_stats_daily to service_role;

-- Which device was already counted today (kept 2 days, then cleaned up).
create table if not exists public.listing_stat_seen (
  property_id uuid not null,
  day date not null,
  kind text not null,
  device text not null,
  primary key (property_id, day, kind, device)
);
create index if not exists listing_stat_seen_day_idx on public.listing_stat_seen (day);
alter table public.listing_stat_seen enable row level security;
grant all on public.listing_stat_seen to service_role;

-- Called by the site: a batch of listings that showed, or one listing opened / contacted.
create or replace function public.track_listing(_ids uuid[], _kind text, _device text, _source text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Africa/Cairo')::date; me uuid := public.current_broker_id(); src text; pid uuid; n integer := 0; k integer;
begin
  if _kind not in ('impression', 'view', 'contact') or _device !~ '^[A-Za-z0-9_-]{8,64}$' or _ids is null or cardinality(_ids) > 60 then return 0; end if;
  src := case when _source in ('home', 'search', 'listing', 'whatsapp', 'facebook', 'instagram', 'tiktok', 'google', 'direct', 'other') then _source else 'other' end;
  for pid in
    select p.id from public.properties p
    where p.id = any(_ids) and p.review_status = 'approved' and not p.is_demo and p.broker_id is distinct from me
  loop
    insert into public.listing_stat_seen (property_id, day, kind, device) values (pid, d, _kind, _device) on conflict do nothing;
    get diagnostics k = row_count;
    if k = 1 then
      insert into public.listing_stats_daily (property_id, day, impressions, views, contacts, sources)
      values (pid, d, (_kind = 'impression')::int, (_kind = 'view')::int, (_kind = 'contact')::int,
              case when _kind = 'view' then jsonb_build_object(src, 1) else '{}'::jsonb end)
      on conflict (property_id, day) do update set
        impressions = listing_stats_daily.impressions + (_kind = 'impression')::int,
        views = listing_stats_daily.views + (_kind = 'view')::int,
        contacts = listing_stats_daily.contacts + (_kind = 'contact')::int,
        sources = case when _kind = 'view'
          then listing_stats_daily.sources || jsonb_build_object(src, coalesce((listing_stats_daily.sources ->> src)::int, 0) + 1)
          else listing_stats_daily.sources end;
      n := n + 1;
    end if;
  end loop;
  if random() < 0.02 then delete from public.listing_stat_seen where day < d - 1; end if;
  return n;
end $$;
revoke execute on function public.track_listing(uuid[], text, text, text) from public;
grant execute on function public.track_listing(uuid[], text, text, text) to anon, authenticated;

-- «إحصائيات إعلاناتي»: the signed-in account's (or owner phone's) listings. Basic plans: last 7 days, showings,
-- views and requests. Full / report plans: up to 90 days, contacts and sources too.
create or replace function public.my_listing_stats(_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b uuid := public.current_broker_id(); ph text := public.my_phone(); lvl text; days int; since date; ids uuid[]; is_full boolean;
begin
  if b is not null then
    if public.current_member_role() not in ('owner', 'manager') then raise exception 'الإحصائيات لصاحب الحساب والمديرين' using errcode = '42501'; end if;
    select bp.stats_level into lvl from public.broker_plan(b) bp;
    select coalesce(array_agg(id), '{}') into ids from public.properties where broker_id = b;
  elsif ph is not null then
    select coalesce(max(op.stats_level), 'basic') into lvl from (values ('sale'), ('rent'), ('summer')) k(kind)
      cross join lateral public.owner_kind_plan(ph, k.kind) op
      where public.owner_kind_access_until(ph, k.kind) > now();
    select coalesce(array_agg(p.id), '{}') into ids from public.properties p join public.leads l on l.id = p.owner_lead_id
    where p.broker_id is null and l.phone_norm = ph;
  else
    return null;
  end if;
  lvl := coalesce(lvl, 'basic');
  is_full := lvl in ('full', 'report');
  days := least(greatest(coalesce(_days, 30), 1), case when is_full then 90 else 7 end);
  since := (now() at time zone 'Africa/Cairo')::date - (days - 1);
  return jsonb_build_object(
    'level', lvl, 'days', days, 'max_days', case when is_full then 90 else 7 end,
    'series', (select coalesce(jsonb_agg(jsonb_build_object('day', g.day::date, 'impressions', coalesce(s.i, 0), 'views', coalesce(s.v, 0),
                 'contacts', case when is_full then coalesce(s.c, 0) end, 'leads', coalesce(ld.n, 0)) order by g.day), '[]'::jsonb)
               from generate_series(since, (now() at time zone 'Africa/Cairo')::date, interval '1 day') g(day)
               left join (select day, sum(impressions) i, sum(views) v, sum(contacts) c from public.listing_stats_daily
                          where property_id = any(ids) and day >= since group by day) s on s.day = g.day::date
               left join (select (created_at at time zone 'Africa/Cairo')::date d, count(*) n from public.leads
                          where property_id = any(ids) and created_at >= since group by 1) ld on ld.d = g.day::date),
    'listings', (select coalesce(jsonb_agg(x order by (x ->> 'views')::int desc, (x ->> 'impressions')::int desc), '[]'::jsonb) from (
                   select jsonb_build_object('id', p.id, 'title', p.title, 'image', p.image_url,
                     'impressions', coalesce(sum(s.impressions), 0), 'views', coalesce(sum(s.views), 0),
                     'contacts', case when is_full then coalesce(sum(s.contacts), 0) end,
                     'leads', (select count(*) from public.leads l where l.property_id = p.id and l.created_at >= since)) x
                   from public.properties p left join public.listing_stats_daily s on s.property_id = p.id and s.day >= since
                   where p.id = any(ids) and p.review_status = 'approved' group by p.id) t),
    'sources', case when is_full then (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
                 select e.key k, sum(e.value::int) n from public.listing_stats_daily s, jsonb_each_text(s.sources) e
                 where s.property_id = any(ids) and s.day >= since group by e.key) z) end);
end $$;
revoke execute on function public.my_listing_stats(integer) from public, anon;
grant execute on function public.my_listing_stats(integer) to authenticated;

-- The team's view: every account's totals for a period (who benefits, who needs a hand).
create or replace function public.admin_listing_stats(_days integer default 30)
returns table (account text, broker_id uuid, listings integer, impressions bigint, views bigint, contacts bigint, leads bigint)
language plpgsql stable security definer set search_path = public as $$
declare since date := (now() at time zone 'Africa/Cairo')::date - (least(greatest(coalesce(_days, 30), 1), 365) - 1);
begin
  if not public.staff_can('plans', 'view') then raise exception 'غير مسموح' using errcode = '42501'; end if;
  return query
    select coalesce(b.name, 'ملاك (من غير وسيط)'), p.broker_id, count(distinct p.id)::int,
      coalesce(sum(s.impressions), 0)::bigint, coalesce(sum(s.views), 0)::bigint, coalesce(sum(s.contacts), 0)::bigint,
      (select count(*) from public.leads l join public.properties lp on lp.id = l.property_id
       where lp.broker_id is not distinct from p.broker_id and l.created_at >= since)::bigint
    from public.properties p
    left join public.brokers b on b.id = p.broker_id
    left join public.listing_stats_daily s on s.property_id = p.id and s.day >= since
    where p.review_status = 'approved' and not p.is_demo
    group by b.name, p.broker_id
    order by 5 desc, 4 desc
    limit 200;
end $$;
revoke execute on function public.admin_listing_stats(integer) from public, anon;
grant execute on function public.admin_listing_stats(integer) to authenticated;

-- فاليو عقار — إصدار 16: مؤشر الأسعار (المولات أولًا)، خانة التشطيب للعقارات، ونسب التشطيب.
-- مرة واحدة بس، وتلقائيًا كله أو مفيش. بيضيف خانتين ودالتين بس، ومبيغيّرش نوع أي خانة موجودة.
--   20261013400000_price-index.sql

begin;
-- Price index: mall-first price comparison for Borg El Arab, plus residential prices by district and finishing.
-- Adds only: a finishing column, finishing ratios in app_settings, and two functions. The index fills itself as units are listed.
-- No existing column changes type.

-- 1) Finishing level of a listing (null = not stated, older listings).
alter table public.properties
  add column if not exists finishing text check (finishing is null or finishing in ('skeleton','semi','full','super_lux'));

-- 2) How finishing levels compare, used when a district only has data for one level (full = 1).
alter table public.app_settings
  add column if not exists finishing_ratios jsonb not null default '{"skeleton":0.55,"semi":0.75,"full":1,"super_lux":1.2}'::jsonb;

-- 3) Mall floor as a number: 0 ground, 1..4, 5 = fifth or higher; null when the text can't be read.
create or replace function public.floor_level(_floor text)
returns integer language sql immutable set search_path = public as $$
  select case
    when t = '' then null
    when t ~ '(أرض|ارض|ground|بدروم|basement)' or t = '0' then 0
    when t ~ '(الأول|الاول|أول|اول|first)' or t = '1' then 1
    when t ~ '(تاني|ثاني|second)' or t = '2' then 2
    when t ~ '(تالت|ثالث|third)' or t = '3' then 3
    when t ~ '(رابع|fourth)' or t = '4' then 4
    when t ~ '(خامس|سادس|سابع|ثامن|تاسع|عاشر|fifth)' or t ~ '^([5-9]|[1-9][0-9])$' then 5
    else null
  end
  from (select lower(btrim(coalesce(_floor, ''))) t) x
$$;
grant execute on function public.floor_level(text) to anon, authenticated;

-- 4) Market prices per m² (median), from approved real listings and approved deals. Only aggregates leave the
-- database, and a group needs at least 3 data points, so no single listing's or deal's price can be read back.
-- month = null → the last 12 months together; otherwise one row per month (for the trend chart).
-- unit_type = null (malls only) → every unit type on that floor together.
create or replace function public.price_index()
returns table (kind text, mall_id uuid, city text, area text, floor_level integer, unit_type text, finishing text,
               purpose text, month date, price_per_m2 numeric, samples integer)
language sql stable security definer set search_path = public as $$
  with pts as (
    select case p.category when 'mall' then 'mall' else 'residential' end as kind,
      p.mall_id, p.city, p.area,
      case when p.category = 'mall' then public.floor_level(p.floor) end as floor_level,
      p.type as unit_type,
      case when p.category = 'mall' then null else p.finishing end as finishing,
      case p.status when 'بيع' then 'sale' else 'rent' end as purpose,
      date_trunc('month', p.created_at)::date as month,
      p.price / nullif(case when p.type in ('أرض','بيت','عمارة') then coalesce(nullif(p.land_size, 0), p.size) else p.size end, 0) as ppm
    from public.properties p
    where p.review_status = 'approved' and not p.is_demo and p.category in ('residential','mall')
      and p.status in ('بيع','إيجار') and p.price > 0 and p.size >= case when p.category = 'mall' then 4 else 20 end
      and p.created_at >= now() - interval '12 months'
    union all
    select case p.category when 'mall' then 'mall' else 'residential' end,
      p.mall_id, p.city, p.area,
      case when p.category = 'mall' then public.floor_level(p.floor) end,
      p.type,
      case when p.category = 'mall' then null else p.finishing end,
      case d.deal_type when 'rent' then 'rent' else 'sale' end,
      date_trunc('month', coalesce(d.sale_date, d.rent_start, d.created_at::date))::date,
      (case d.deal_type when 'rent' then d.rent_monthly else d.sale_value end)
        / nullif(case when p.type in ('أرض','بيت','عمارة') then coalesce(nullif(p.land_size, 0), p.size) else p.size end, 0)
    from public.deals d join public.properties p on p.id = d.property_id
    where d.review_status = 'approved' and d.deal_type in ('sale','rent') and not p.is_demo
      and p.category in ('residential','mall') and p.size > 0
      and coalesce(d.sale_date, d.rent_start, d.created_at::date) >= (now() - interval '12 months')::date
  )
  select kind, mall_id, city, area, floor_level, unit_type, finishing, purpose, month,
    round(percentile_cont(0.5) within group (order by ppm)::numeric, 0) as price_per_m2,
    count(*)::integer as samples
  from pts
  where ppm > 0
  group by grouping sets (
    (kind, mall_id, city, area, floor_level, unit_type, finishing, purpose),
    (kind, mall_id, city, area, floor_level, unit_type, finishing, purpose, month),
    -- Malls also get one row per floor across all unit types (unit_type = null).
    (kind, mall_id, floor_level, purpose),
    (kind, mall_id, floor_level, purpose, month)
  )
  having count(*) >= 3 and not (grouping(unit_type) = 1 and kind <> 'mall')
$$;
revoke execute on function public.price_index() from public;
grant execute on function public.price_index() to anon, authenticated;

commit;

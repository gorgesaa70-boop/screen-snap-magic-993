-- Value Aqar release 17 (fix): re-creates 4 functions whose Arabic text was damaged when release 15/16 were applied.
-- This file is plain ASCII on purpose (Arabic is written as U&escapes). Apply once; all or nothing.
--   20261013500000_arabic-safe-functions.sql

begin;
-- Re-creates functions whose Arabic text was damaged when applied: every Arabic string is now written as
-- U&'XXXX' escapes, so this file is plain ASCII and survives any copy/paste or encoding.
-- Behaviour is identical to the originals.

CREATE OR REPLACE FUNCTION public.notify_on_property_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bu uuid; url text; bname text; who text; title text;
BEGIN
  url := CASE new.category WHEN 'industrial' THEN '/industrial/' || new.id WHEN 'mall' THEN '/dashboard' ELSE '/properties/' || new.id END;
  SELECT user_id, name INTO bu, bname FROM public.brokers WHERE id = new.broker_id;
  IF new.owner_lead_id IS NOT NULL AND new.broker_id IS NULL THEN
    title := U&'\0639\0631\0636 \0639\0642\0627\0631 \062c\062f\064a\062f \0645\0646 \0645\0627\0644\0643';
    SELECT name INTO who FROM public.leads WHERE id = new.owner_lead_id;
  ELSE
    title := U&'\0637\0644\0628 \0639\0642\0627\0631 \062c\062f\064a\062f \0645\0646 \0648\0633\064a\0637';
    who := bname;
  END IF;
  IF tg_op = 'UPDATE' AND new.review_status IS DISTINCT FROM old.review_status THEN
    IF new.review_status IN ('approved','rejected') AND bu IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify_user(bu, 'request_status',
        CASE WHEN new.review_status = 'approved' THEN U&'\062a\0645 \0627\0639\062a\0645\0627\062f \0639\0642\0627\0631\0643' ELSE U&'\062a\0645 \0631\0641\0636 \0639\0642\0627\0631\0643' END,
        new.title || coalesce(U&' \2014 ' || new.review_note, ''), new.id,
        CASE WHEN new.review_status = 'approved' THEN url ELSE '/dashboard' END);
    END IF;
    IF new.review_status = 'rejected' THEN
      PERFORM public.notify_admins('admin', U&'\062a\0645 \0631\0641\0636 \0639\0642\0627\0631', new.title || coalesce(U&' \2014 ' || who, '') || coalesce(U&' \2014 \0627\0644\0633\0628\0628: ' || new.review_note, ''), new.id, '/admin');
    ELSIF new.review_status = 'pending' THEN
      PERFORM public.notify_admins('admin', title, new.title || coalesce(U&' \2014 ' || who, ''), new.id, '/admin');
    END IF;
  ELSIF tg_op = 'INSERT' AND new.review_status = 'pending' THEN
    PERFORM public.notify_admins('admin', title, new.title || coalesce(U&' \2014 ' || who, ''), new.id, '/admin');
  END IF;
  IF tg_op = 'UPDATE' AND new.is_featured AND NOT old.is_featured THEN
    PERFORM public.notify_admins('admin', U&'\062a\0645 \062a\0645\064a\064a\0632 \0639\0642\0627\0631', new.title || coalesce(U&' \2014 ' || bname, ''), new.id, url);
    IF bu IS DISTINCT FROM auth.uid() THEN
      PERFORM public.notify_user(bu, 'request_status', U&'\062a\0645 \062a\0645\064a\064a\0632 \0639\0642\0627\0631\0643', new.title, new.id, url);
    END IF;
  END IF;
  RETURN new;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_on_property_review() FROM PUBLIC, anon, authenticated;

create or replace function public.actor_label()
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then case when coalesce(auth.role(), '') = 'anon' then U&'\0632\0627\0626\0631' else U&'\0627\0644\0646\0638\0627\0645' end
    when public.has_role(auth.uid(), 'admin') then U&'\0623\062f\0645\0646'
    when public.is_staff() then U&'\0645\0648\0638\0641 \0641\0627\0644\064a\0648 \0639\0642\0627\0631'
    else coalesce(
      (select U&'\0635\0627\062d\0628 \062d\0633\0627\0628: ' || name from public.brokers where user_id = auth.uid() limit 1),
      (select U&'\0641\0631\064a\0642: ' || m.member_name || ' (' || b.name || ')' from public.my_membership() m join public.brokers b on b.id = m.company_id limit 1),
      U&'\0645\0633\062a\062e\062f\0645')
  end
$$;
revoke execute on function public.actor_label() from public, anon, authenticated;

create or replace function public.floor_level(_floor text)
returns integer language sql immutable set search_path = public as $$
  select case
    when t = '' then null
    when t ~ U&'(\0623\0631\0636|\0627\0631\0636|ground|\0628\062f\0631\0648\0645|basement)' or t = '0' then 0
    when t ~ U&'(\0627\0644\0623\0648\0644|\0627\0644\0627\0648\0644|\0623\0648\0644|\0627\0648\0644|first)' or t = '1' then 1
    when t ~ U&'(\062a\0627\0646\064a|\062b\0627\0646\064a|second)' or t = '2' then 2
    when t ~ U&'(\062a\0627\0644\062a|\062b\0627\0644\062b|third)' or t = '3' then 3
    when t ~ U&'(\0631\0627\0628\0639|fourth)' or t = '4' then 4
    when t ~ U&'(\062e\0627\0645\0633|\0633\0627\062f\0633|\0633\0627\0628\0639|\062b\0627\0645\0646|\062a\0627\0633\0639|\0639\0627\0634\0631|fifth)' or t ~ '^([5-9]|[1-9][0-9])$' then 5
    else null
  end
  from (select lower(btrim(coalesce(_floor, ''))) t) x
$$;
grant execute on function public.floor_level(text) to anon, authenticated;

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
      case p.status when U&'\0628\064a\0639' then 'sale' else 'rent' end as purpose,
      date_trunc('month', p.created_at)::date as month,
      p.price / nullif(case when p.type in (U&'\0623\0631\0636',U&'\0628\064a\062a',U&'\0639\0645\0627\0631\0629') then coalesce(nullif(p.land_size, 0), p.size) else p.size end, 0) as ppm
    from public.properties p
    where p.review_status = 'approved' and not p.is_demo and p.category in ('residential','mall')
      and p.status in (U&'\0628\064a\0639',U&'\0625\064a\062c\0627\0631') and p.price > 0 and p.size >= case when p.category = 'mall' then 4 else 20 end
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
        / nullif(case when p.type in (U&'\0623\0631\0636',U&'\0628\064a\062a',U&'\0639\0645\0627\0631\0629') then coalesce(nullif(p.land_size, 0), p.size) else p.size end, 0)
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

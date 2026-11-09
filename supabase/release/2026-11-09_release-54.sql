-- فاليو عقار — إصدار 54: صفحة المطلوب. ينفع يتشغل تاني. مستقل عن الإصدارات التانية.
--   20261109100000_wanted-board.sql

begin;
-- «المطلوب» (release 54): customers' property requests shown to everyone, without their name or number.
-- * A request sent from the site form appears for 60 days and disappears earlier when reserved, sold, lost or hidden by the admin.
-- * Visitors never read leads: wanted_board() returns only safe columns. The customer's free-text details are never shown,
--   only a description the admin writes. Anything typed that looks like a number or a link is dropped.
-- * «عندي العقار ده» creates a new lead that stays with Value Aqar (no routing to companies) and tells the request's owner,
--   without any details about who offered. Old requests appear only if the admin shows them.
-- Additive only; re-runnable. Independent of the other releases.

alter table public.leads
  add column if not exists wanted_public boolean not null default false,
  add column if not exists wanted_until timestamptz,
  add column if not exists wanted_note text check (wanted_note is null or char_length(wanted_note) <= 300),
  add column if not exists wanted_lead_id uuid references public.leads(id) on delete set null;
create index if not exists leads_wanted_public_idx on public.leads (created_at desc) where wanted_public;
create index if not exists leads_wanted_lead_idx on public.leads (wanted_lead_id) where wanted_lead_id is not null;

-- Runs after leads_guard and before leads_pick_company (trigger name order).
create or replace function public.leads_i_wanted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  flag text := coalesce(current_setting('va.wanted', true), '');
  service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'INSERT' then
    if flag = 'offer' then
      new.source_note := 'صفحة المطلوب';
      new.wanted_public := false; new.wanted_until := null; new.wanted_note := null;
      return new;
    end if;
    if not service then new.wanted_lead_id := null; new.wanted_note := null; end if;
    if new.wanted_public and new.kind = 'request' and new.property_id is null then
      new.wanted_until := now() + interval '60 days';
    else
      new.wanted_public := false; new.wanted_until := null;
    end if;
    return new;
  end if;
  if not service then
    new.wanted_lead_id := old.wanted_lead_id;
    if flag <> 'admin' then
      new.wanted_public := old.wanted_public; new.wanted_until := old.wanted_until; new.wanted_note := old.wanted_note;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.leads_i_wanted() from public, anon, authenticated;
drop trigger if exists leads_i_wanted on public.leads;
create trigger leads_i_wanted before insert or update on public.leads for each row execute function public.leads_i_wanted();

-- Same as before, except that an offer stays with Value Aqar.
create or replace function public.leads_pick_company()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.routing_rules%rowtype; pick uuid;
begin
  if new.assigned_broker_id is not null or new.assigned_staff_id is not null or new.kind = 'investment' or new.wanted_lead_id is not null then return new; end if;
  for r in select * from public.routing_rules where is_active order by priority, created_at loop
    continue when r.areas is not null and not (coalesce(new.area, '') = any(r.areas));
    continue when r.property_types is not null and not (coalesce(new.property_type, '') = any(r.property_types));
    continue when r.kinds is not null and not (new.kind = any(r.kinds));
    continue when r.sources is not null and not (new.source = any(r.sources));
    select b.id into pick
    from unnest(r.broker_ids) as x(id) join public.brokers b on b.id = x.id
    where b.is_active and b.suspended_at is null
    order by (select max(a.created_at) from public.lead_assignments a where a.broker_id = b.id) nulls first, b.created_at
    limit 1;
    if pick is not null then
      new.assigned_broker_id := pick;
      new.routed_rule_id := r.id;
      return new;
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.leads_pick_company() from public, anon, authenticated;

-- Same names as before, plus the offer's own name.
create or replace function public.lead_title(_l public.leads)
returns text language sql stable security definer set search_path = public as $$
  select case
    when _l.wanted_lead_id is not null then 'عرض على طلب VA-' || coalesce(lpad((select lead_no::text from public.leads where id = _l.wanted_lead_id), 6, '0'), '') || ' من صفحة المطلوب'
    when _l.details like 'دليل الخدمات%' then 'طلب خدمة'
    when _l.details like 'سكن مشترك%' then 'سكن مشترك'
    when _l.details like 'سوق الوسطاء%' then 'سوق الوسطاء'
    when _l.details like 'طلب تقييم%' then 'طلب تقييم عقار'
    when _l.compound_id is not null then 'طلب وحدة في ' || coalesce((select name from public.compounds where id = _l.compound_id), 'كمبوند')
    when _l.project_id is not null then 'طلب وحدة في ' || coalesce((select name from public.projects where id = _l.project_id), 'مشروع')
    when _l.kind = 'investment' then 'طلب استثمار' || coalesce(' — ' || (select title from public.investment_opportunities where id = _l.opportunity_id), '')
    when _l.kind = 'listing' then 'عرض عقار من مالك'
    when _l.kind = 'inquiry' then 'استفسار عن ' || coalesce(left((select title from public.properties where id = _l.property_id), 60), 'عقار')
    else case _l.purpose when 'rent' then 'طلب إيجار' when 'summer' then 'طلب مصيف' when 'sale' then 'طلب شراء' else 'طلب عقار' end
         || coalesce(' — ' || _l.property_type, '') || coalesce(' في ' || _l.area, '')
  end
$$;
revoke execute on function public.lead_title(public.leads) from public, anon, authenticated;

-- Typed text that looks like a phone number or a link never reaches the page.
create or replace function public.wanted_safe_text(_t text, _max integer)
returns text language sql immutable set search_path = public as $$
  select case
    when _t is null then null
    when length(regexp_replace(translate(_t, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g')) >= 7 then null
    when _t ~* '(https?:|www\.|wa\.me|@)' then null
    else nullif(left(btrim(_t), _max), '')
  end
$$;
revoke execute on function public.wanted_safe_text(text, integer) from public, anon, authenticated;

create or replace function public.wanted_is_open(_l public.leads)
returns boolean language sql stable set search_path = public as $$
  select _l.kind = 'request' and _l.wanted_public and _l.wanted_until > now() and _l.stage::text not in ('reserved', 'sold', 'lost')
$$;
revoke execute on function public.wanted_is_open(public.leads) from public, anon, authenticated;

-- What everyone sees. A budget too large to be real could be a phone number typed as digits, so it is dropped.
create or replace function public.wanted_board()
returns table (id uuid, lead_no bigint, purpose text, property_type text, area text, budget numeric, note text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from (
    select l.id, l.lead_no::bigint, l.purpose, public.wanted_safe_text(l.property_type, 40) as property_type, public.wanted_safe_text(l.area, 60) as area,
      case when l.budget > 0 and l.budget <= 500000000 then l.budget end as budget, l.wanted_note as note, l.created_at
    from public.leads l where public.wanted_is_open(l)
  ) x
  where x.property_type is not null or x.area is not null or x.note is not null
  order by x.created_at desc limit 300
$$;
revoke execute on function public.wanted_board() from public;
grant execute on function public.wanted_board() to anon, authenticated;

-- «عندي العقار ده». Returns 'ok', or 'dup' when this number already offered on this request.
create or replace function public.submit_wanted_offer(_request uuid, _name text, _phone text, _details text default null)
returns text language plpgsql security definer set search_path = public as $$
declare req public.leads; ph text := public.normalize_phone(_phone); nm text := btrim(coalesce(_name, '')); cust uuid; code text;
begin
  if char_length(nm) < 2 or ph is null then raise exception 'اكتب الاسم ورقم هاتف صحيح' using errcode = '22023'; end if;
  select * into req from public.leads where id = _request;
  if req.id is null or not public.wanted_is_open(req) then raise exception 'الطلب ده اتقفل' using errcode = 'P0001'; end if;
  if req.phone_norm = ph then raise exception 'ده طلبك أنت' using errcode = 'P0001'; end if;
  if exists (select 1 from public.leads l where l.wanted_lead_id = req.id and l.phone_norm = ph) then return 'dup'; end if;
  if (select count(*) from public.leads l where l.wanted_lead_id is not null and l.phone_norm = ph and l.created_at > now() - interval '1 day') >= 10 then
    raise exception 'جرّب تاني بكرة' using errcode = 'P0001';
  end if;

  code := 'VA-' || lpad(req.lead_no::text, 6, '0');
  perform set_config('va.wanted', 'offer', true);
  insert into public.leads (name, phone, kind, purpose, property_type, area, details, wanted_lead_id, original_source)
  values (left(nm, 100), ph, 'inquiry', req.purpose, req.property_type, req.area,
    left('صفحة المطلوب — عرض على طلب ' || code || coalesce(': ' || nullif(btrim(_details), ''), ''), 1000), req.id, 'website');
  perform set_config('va.wanted', '', true);

  -- The request's owner never hears who offered. A message problem must not lose the offer.
  begin
    cust := coalesce(req.customer_id, public.phone_user_id(req.phone));
    if cust is not null then
      perform public.notify_user(cust, 'request_status', 'حد عنده عقار مناسب لطلبك', code || ' — فريق فاليو عقار هيتواصل معاك', req.id, '/my-requests');
    elsif not exists (select 1 from public.wa_outbox o where o.lead_id = req.id and o.title = 'عرض على طلبك' and o.created_at > now() - interval '1 day') then
      insert into public.wa_outbox (kind, phone, title, message, lead_id)
      values ('customer', req.phone, 'عرض على طلبك', 'حد عنده عقار مناسب لطلبك ' || code || ' على فاليو عقار. فريقنا هيراجع العرض ويتواصل معاك.', req.id);
    end if;
  exception when others then
    perform public.log_app_error('server', left('submit_wanted_offer: ' || sqlerrm, 500), '', 'submit_wanted_offer', '');
  end;
  return 'ok';
end $$;
revoke execute on function public.submit_wanted_offer(uuid, text, text, text) from public;
grant execute on function public.submit_wanted_offer(uuid, text, text, text) to anon, authenticated;

-- Admin: show or hide a request and write its public description. Showing starts a new 60 days.
create or replace function public.admin_set_wanted(_lead uuid, _show boolean, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_can('leads', 'edit') then raise exception 'غير مسموح' using errcode = '42501'; end if;
  perform set_config('va.wanted', 'admin', true);
  update public.leads set wanted_public = _show,
    wanted_until = case when _show then now() + interval '60 days' end,
    wanted_note = nullif(left(btrim(coalesce(_note, '')), 300), '')
  where id = _lead and kind = 'request';
  if not found then raise exception 'الطلب مش موجود' using errcode = 'P0001'; end if;
  perform set_config('va.wanted', '', true);
end $$;
revoke execute on function public.admin_set_wanted(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_wanted(uuid, boolean, text) to authenticated;
commit;

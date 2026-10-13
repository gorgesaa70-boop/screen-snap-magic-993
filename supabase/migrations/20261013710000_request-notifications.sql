-- Every request notifies Value Aqar's admins AND the party it is meant for, and the notification carries the
-- request's own name ("طلب وحدة في كمبوند النخيل", "استفسار عن شقة …", "طلب إيجار — شقة في الحي الأول" …)
-- instead of one generic "طلب عقاري جديد". Services have their own notifications (20261013700000_services.sql).

-- 1) The request's name, from what it is about.
create or replace function public.lead_title(_l public.leads)
returns text language sql stable security definer set search_path = public as $$
  select case
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

-- 2) Lead notifications with the request's name (same people as before: admins + the assigned account / member / staff).
create or replace function public.notify_on_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare t text; ttl text := public.lead_title(new); msg text; url text := '/leads/' || new.id; mu uuid;
begin
  msg := 'VA-' || lpad(new.lead_no::text, 6, '0') || ' — ' || new.name || coalesce(' — ' || new.property_type, '') || coalesce(' — ' || new.area, '');
  if tg_op = 'INSERT' then
    t := case when new.kind = 'inquiry' then 'new_inquiry' else 'new_request' end;
    perform public.notify_admins(t, ttl, msg, new.id, url);
    if new.assigned_broker_id is not null then
      perform public.notify_company(new.assigned_broker_id, t, ttl, msg, new.id, url);
    end if;
    if new.assigned_staff_id is not null and new.assigned_staff_id is distinct from auth.uid() then
      perform public.notify_user(new.assigned_staff_id, 'new_request', 'اتحوّل لك: ' || ttl, msg, new.id, url);
    end if;
    return new;
  end if;

  if new.assigned_broker_id is distinct from old.assigned_broker_id and new.assigned_broker_id is not null then
    perform public.notify_company(new.assigned_broker_id, 'new_request', 'اتحوّل لشركتك: ' || ttl, msg, new.id, url);
  end if;
  if new.assigned_member_id is distinct from old.assigned_member_id and new.assigned_member_id is not null then
    mu := public.member_user_id(new.assigned_member_id);
    if mu is not null and mu is distinct from auth.uid() then
      perform public.notify_user(mu, 'new_request', 'اتحوّل لك: ' || ttl, msg, new.id, url);
    end if;
  end if;
  if new.assigned_staff_id is distinct from old.assigned_staff_id and new.assigned_staff_id is not null and new.assigned_staff_id is distinct from auth.uid() then
    perform public.notify_user(new.assigned_staff_id, 'new_request', 'اتحوّل لك: ' || ttl, msg, new.id, url);
  end if;
  -- Suspicious events, flagged to admins and staff right away (the full list is in the review report).
  if new.stage = 'lost' and old.stage is distinct from 'lost' and new.referred_at is not null and now() - new.referred_at < interval '3 days' then
    perform public.notify_team('admin', 'تنبيه: عميل اتقفل بسرعة بعد إحالته', msg || ' — السبب: ' || coalesce(new.lost_reason, '—'), new.id, url);
  end if;
  if new.assigned_broker_id is distinct from old.assigned_broker_id and old.assigned_broker_id is not null
     and exists (select 1 from public.deals d where d.lead_id = new.id) then
    perform public.notify_team('admin', 'تنبيه: تغيير الشركة على عميل عليه صفقة', msg, new.id, url);
  end if;
  return new;
end $$;
revoke execute on function public.notify_on_lead() from public, anon, authenticated;

-- 3) A unit in a developer's compound or project: the developer hears at the same moment as the admins,
--    with the request's name and unit — never the customer's name or phone (the request stays with Value Aqar
--    until it is handed over, so the contact goes through the platform).
create or replace function public.notify_developer_unit_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare dev uuid; unit text; url text;
begin
  if new.compound_id is not null then
    select c.developer_id into dev from public.compounds c where c.id = new.compound_id;
    select u.unit_type || coalesce(' ' || u.code, '') into unit from public.compound_units u where u.id = new.compound_unit_id;
    url := '/my-compounds/' || new.compound_id;
  elsif new.project_id is not null then
    select p.developer_id into dev from public.projects p where p.id = new.project_id;
    select u.unit_type || coalesce(' ' || u.code, '') into unit from public.project_units u where u.id = new.project_unit_id;
    url := '/dashboard';
  end if;
  -- Already handed to the developer at insert: notify_on_lead() told them with the full request.
  if dev is null or new.assigned_broker_id is not distinct from dev then return null; end if;
  perform public.notify_company(dev, 'new_request', public.lead_title(new),
    coalesce('وحدة: ' || unit || ' — ', '') || 'فاليو عقار بتتواصل مع العميل وهتحوّله ليك.', coalesce(new.compound_id, new.project_id), url);
  return null;
end $$;
revoke execute on function public.notify_developer_unit_request() from public, anon, authenticated;
drop trigger if exists notify_developer_unit_request on public.leads;
create trigger notify_developer_unit_request after insert on public.leads
  for each row when (new.compound_id is not null or new.project_id is not null)
  execute function public.notify_developer_unit_request();

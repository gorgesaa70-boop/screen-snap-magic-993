-- Staff permissions, part 3 (release 38): functions that let ANY employee act now ask for the section's permission.
-- Customers' chats and alerts → «طلبات العملاء» / «تنبيهات المراجعة»; brokers' contacts → customers or accounts;
-- investment details → «الفرص الاستثمارية»; rerouting a service request → «طلبات الخدمات: يعدّل»;
-- direct messages → «الرسايل»; «الكمبوندات: يعدّل» works on every compound like the admin (assigned compounds still work).
-- Same bodies otherwise; staff_can() is true for the admin. Re-runnable.

-- lead_alerts: edit the current definition in place (keeps everything later releases added).
do $do$
declare src text;
begin
  select pg_get_functiondef('public.lead_alerts()'::regprocedure) into src;
  src := replace(src, '(public.has_role(auth.uid(), ''admin'') or public.is_staff())',
                      '(public.staff_can(''review_alerts'', ''view'') or public.staff_can(''leads'', ''view''))');
  execute src;
end $do$;

-- broker_contacts (from 20261011230000_contact-policy.sql)
create or replace function public.broker_contacts(_ids uuid[])
returns table (id uuid, phone text, whatsapp text, email text)
language sql stable security definer set search_path = public as $$
  select b.id, b.phone, b.whatsapp, b.email from public.brokers b
  where b.id = any(_ids) and b.is_active
    and (b.show_contact or public.staff_can('leads', 'view') or public.staff_can('brokers', 'view') or b.id = public.current_broker_id())
$$;

-- opportunity_private (from 20261012200000_investments.sql)
create or replace function public.opportunity_private(_id uuid)
returns table (details text, location_note text, licenses text)
language sql stable security definer set search_path = public as $$
  select o.details, o.location_note, o.licenses from public.investment_opportunities o
  where o.id = _id and (
    public.staff_can('investments', 'view') or o.submitted_by = auth.uid()
    or exists (select 1 from public.investment_requests r where r.opportunity_id = o.id and r.investor_id = auth.uid() and r.status = 'approved'))
$$;

-- opportunity_location (from 20261012300000_maps.sql)
create or replace function public.opportunity_location(_id uuid)
returns table (lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  select o.lat, o.lng from public.investment_opportunities o
  where o.id = _id and o.lat is not null and o.lng is not null and (
    public.staff_can('investments', 'view') or o.submitted_by = auth.uid()
    or exists (select 1 from public.investment_requests r where r.opportunity_id = o.id and r.investor_id = auth.uid() and r.status = 'approved'))
$$;

-- reroute_service_request (from 20261014100000_plans-and-providers.sql)
create or replace function public.reroute_service_request(_req uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_can('svc_requests', 'edit') then raise exception 'للإدارة بس' using errcode = '42501'; end if;
  if exists (select 1 from public.service_requests where id = _req and (assigned_provider_id is not null or status in ('done','closed'))) then
    raise exception 'الطلب ده اتحوّل أو اتقفل' using errcode = 'P0001';
  end if;
  perform set_config('va.service_routing', '1', true);
  update public.service_requests set declined_provider_ids = '{}', offer_provider_id = null, offered_at = null, offer_expires_at = null where id = _req;
  perform set_config('va.service_routing', '', true);
  return public.offer_service_request(_req, false);
end $$;

-- set_lead_chat_closed (from 20261013900000_lead-messages.sql)
create or replace function public.set_lead_chat_closed(_lead uuid, _closed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_can('leads', 'edit') then raise exception 'للإدارة بس' using errcode = '42501'; end if;
  update public.leads set chat_closed_at = case when _closed then now() end, chat_closed_by = case when _closed then auth.uid() end
  where id = _lead;
end $$;

-- lead_chat_side (from 20261013900000_lead-messages.sql)
create or replace function public.lead_chat_side(_lead uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare l public.leads%rowtype; me uuid := auth.uid(); role text;
begin
  if me is null then return null; end if;
  select * into l from public.leads where id = _lead;
  if not found or not public.lead_chat_enabled(l) then return null; end if;
  if public.staff_can('leads', 'view') then return 'platform'; end if;
  if l.assigned_broker_id is not null and l.assigned_broker_id = public.current_broker_id() then
    role := public.current_member_role();
    if role in ('owner','manager') or (l.assigned_member_id is not null and l.assigned_member_id = public.my_member_id()) then
      return 'company';
    end if;
  end if;
  if l.customer_id = me
     or (l.customer_id is null and l.phone_norm is not null and l.phone_norm = public.my_phone()) then
    return 'customer';
  end if;
  return null;
end $$;

-- start_direct_thread (from 20261017300000_direct-messages.sql)
create or replace function public.start_direct_thread(_broker uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); mine uuid; a uuid; b uuid; tid uuid; o public.brokers%rowtype;
begin
  if me is null then raise exception 'سجّل دخول الأول' using errcode = '42501'; end if;
  if public.staff_can('messages', 'edit') then
    if _broker is null then raise exception 'اختار الحساب اللي هتراسله'; end if;
    if not exists (select 1 from public.brokers where id = _broker) then raise exception 'الحساب ده مش موجود'; end if;
    a := _broker; b := null;
  else
    if coalesce(public.current_member_role(), '') not in ('owner','manager') then
      raise exception 'الرسايل المباشرة لصاحب الحساب والمديرين بس' using errcode = '42501';
    end if;
    mine := public.current_broker_id();
    if mine is null then raise exception 'حسابك مش مفعّل لسه' using errcode = '42501'; end if;
    if _broker is null then
      a := mine; b := null;
    else
      if _broker = mine then raise exception 'مينفعش تراسل حسابك'; end if;
      select * into o from public.brokers where id = _broker;
      if not found or not o.is_active or o.is_demo or o.suspended_at is not null
         or o.account_type not in ('individual','office','company','developer')
         or (select account_type from public.brokers where id = mine) not in ('individual','office','company','developer') then
        raise exception 'الحساب ده مش متاح للرسايل';
      end if;
      a := least(mine, _broker); b := greatest(mine, _broker);
    end if;
  end if;
  select id into tid from public.direct_threads where broker_a = a and broker_b is not distinct from b;
  if tid is null then
    begin
      insert into public.direct_threads (broker_a, broker_b, created_by) values (a, b, me) returning id into tid;
    exception when unique_violation then
      select id into tid from public.direct_threads where broker_a = a and broker_b is not distinct from b;
    end;
  end if;
  return tid;
end $$;

-- set_direct_thread_closed (from 20261017300000_direct-messages.sql)
create or replace function public.set_direct_thread_closed(_thread uuid, _closed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_can('messages', 'edit') then raise exception 'للإدارة بس' using errcode = '42501'; end if;
  update public.direct_threads set closed_at = case when _closed then now() end, closed_by = case when _closed then auth.uid() end
  where id = _thread;
end $$;

-- direct_thread_side (from 20261017300000_direct-messages.sql)
create or replace function public.direct_thread_side(_thread uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare t public.direct_threads%rowtype; me uuid := auth.uid(); mine uuid;
begin
  if me is null then return null; end if;
  select * into t from public.direct_threads where id = _thread;
  if not found then return null; end if;
  if public.staff_can('messages', 'view') then return 'platform'; end if;
  if coalesce(public.current_member_role(), '') not in ('owner','manager') then return null; end if;
  mine := public.current_broker_id();
  if mine is not null and (mine = t.broker_a or mine = t.broker_b) then return mine::text; end if;
  return null;
end $$;

-- compound_role (from 20261013600000_compounds.sql)
create or replace function public.compound_role(_compound uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.staff_can('compounds', 'edit') then 'admin'
    when c.developer_id is not null and c.developer_id = public.current_developer_id() then public.current_member_role()
    else (select m.role from public.compound_members m
          where m.compound_id = c.id and (
            (c.developer_id is not null and m.member_id is not null and m.member_id = public.my_member_id()
              and c.developer_id = public.current_broker_id())
            or (c.developer_id is null and m.staff_user_id = auth.uid() and public.is_staff()))
          limit 1)
  end
  from public.compounds c where c.id = _compound
$$;

-- notify_team: admins always; an employee only for what they can open (a customer they see, the WhatsApp inbox,
-- a compound, or general admin alerts when they hold any section). New-customer routing itself is unchanged
-- (notify_admins + the assigned company / employee).
create or replace function public.notify_team(_type text, _title text, _msg text, _related uuid, _url text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications(user_id, type, title, message, related_id, related_url)
  select distinct r.user_id, _type, _title, coalesce(_msg, ''), _related, _url
  from public.user_roles r left join public.staff_permissions p on p.user_id = r.user_id
  where r.user_id is distinct from auth.uid()
    and (r.role::text = 'admin' or (r.role::text = 'staff' and (
      case
        when _url like '/leads/%' then p.perms ->> 'leads' in ('view', 'edit')
          and (p.perms ->> 'leads_scope' = 'all' or exists (select 1 from public.leads l where l.id = _related and l.assigned_staff_id = r.user_id))
        when _url like '%tab=wa_inbox%' then p.perms ->> 'wa_inbox' in ('view', 'edit')
        when _url like '/compounds/%' then p.perms ->> 'compounds' in ('view', 'edit')
        else exists (select 1 from jsonb_each_text(coalesce(p.perms, '{}'::jsonb)) e where e.key <> 'leads_scope' and e.value in ('view', 'edit'))
      end)))
$$;
revoke execute on function public.notify_team(text, text, text, uuid, text) from public, anon, authenticated;

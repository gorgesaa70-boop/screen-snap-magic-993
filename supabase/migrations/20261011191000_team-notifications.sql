-- Notifications for the new roles and flows (items 10–13): team members, Value Aqar staff,
-- managers, deal review results, join requests, and suspicious lead events. Uses the existing
-- notifications table (in-app bell + optional WhatsApp copy).

-- Sign-in account of a company team member (members are matched by phone).
create or replace function public.member_user_id(_member uuid)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select u.id from public.company_members m join auth.users u on public.normalize_phone(u.phone) = public.normalize_phone(m.phone)
  where m.id = _member and m.is_active limit 1
$$;
revoke execute on function public.member_user_id(uuid) from public, anon, authenticated;

-- Admins and Value Aqar staff.
create or replace function public.notify_team(_type text, _title text, _msg text, _related uuid, _url text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications(user_id, type, title, message, related_id, related_url)
  select distinct user_id, _type, _title, coalesce(_msg, ''), _related, _url from public.user_roles
  where role::text in ('admin', 'staff') and user_id is distinct from auth.uid()
$$;
revoke execute on function public.notify_team(text, text, text, uuid, text) from public, anon, authenticated;

-- A company's account holder and its managers.
create or replace function public.notify_company(_company uuid, _type text, _title text, _msg text, _related uuid, _url text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  for uid in
    select b.user_id from public.brokers b where b.id = _company and b.user_id is not null
    union
    select public.member_user_id(m.id) from public.company_members m where m.company_id = _company and m.role = 'manager' and m.is_active
  loop
    if uid is not null and uid is distinct from auth.uid() then
      perform public.notify_user(uid, _type, _title, _msg, _related, _url);
    end if;
  end loop;
end $$;
revoke execute on function public.notify_company(uuid, text, text, text, uuid, text) from public, anon, authenticated;

-- Leads: assignment to a company (owner + managers), to a team member, to a staff member; suspicious closes.
create or replace function public.notify_on_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare t text; ttl text; msg text; url text := '/leads/' || new.id; mu uuid;
begin
  msg := 'VA-' || lpad(new.lead_no::text, 6, '0') || ' — ' || new.name || coalesce(' — ' || new.property_type, '') || coalesce(' — ' || new.area, '');
  if tg_op = 'INSERT' then
    t := case when new.kind = 'inquiry' then 'new_inquiry' else 'new_request' end;
    ttl := case new.kind when 'inquiry' then 'استفسار جديد عن عقار' when 'listing' then 'عقار جديد من مالك' else 'طلب عقاري جديد' end;
    perform public.notify_admins(t, ttl, msg, new.id, url);
    if new.assigned_broker_id is not null then
      perform public.notify_company(new.assigned_broker_id, t, ttl, msg, new.id, url);
    end if;
    if new.assigned_staff_id is not null and new.assigned_staff_id is distinct from auth.uid() then
      perform public.notify_user(new.assigned_staff_id, 'new_request', 'تم إسناد عميل لك', msg, new.id, url);
    end if;
    return new;
  end if;

  if new.assigned_broker_id is distinct from old.assigned_broker_id and new.assigned_broker_id is not null then
    perform public.notify_company(new.assigned_broker_id, 'new_request', 'تم إسناد عميل جديد لشركتك', msg, new.id, url);
  end if;
  if new.assigned_member_id is distinct from old.assigned_member_id and new.assigned_member_id is not null then
    mu := public.member_user_id(new.assigned_member_id);
    if mu is not null and mu is distinct from auth.uid() then
      perform public.notify_user(mu, 'new_request', 'تم إسناد عميل لك', msg, new.id, url);
    end if;
  end if;
  if new.assigned_staff_id is distinct from old.assigned_staff_id and new.assigned_staff_id is not null and new.assigned_staff_id is distinct from auth.uid() then
    perform public.notify_user(new.assigned_staff_id, 'new_request', 'تم إسناد عميل لك', msg, new.id, url);
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

-- Deal review results go back to the company and to the team member handling the lead.
create or replace function public.notify_on_deal_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare l public.leads%rowtype; ttl text; msg text; mu uuid;
begin
  if new.review_status is not distinct from old.review_status or new.review_status not in ('approved','rejected','needs_info') then return new; end if;
  select * into l from public.leads where id = new.lead_id;
  ttl := case new.review_status when 'approved' then 'تم اعتماد البيع ✓' when 'rejected' then 'تم رفض الصفقة' else 'الصفقة محتاجة بيانات' end;
  msg := 'D-' || lpad(new.deal_no::text, 6, '0') || ' — ' || l.name || coalesce(' — ' || new.review_note, '');
  if new.broker_id is not null then
    perform public.notify_company(new.broker_id, 'request_status', ttl, msg, new.lead_id, '/leads/' || new.lead_id);
  end if;
  if l.assigned_member_id is not null then
    mu := public.member_user_id(l.assigned_member_id);
    if mu is not null then perform public.notify_user(mu, 'request_status', ttl, msg, new.lead_id, '/leads/' || new.lead_id); end if;
  end if;
  return new;
end $$;
revoke execute on function public.notify_on_deal_review() from public, anon, authenticated;
create trigger deals_notify_review after update on public.deals for each row execute function public.notify_on_deal_review();

-- Join requests: admins hear about new ones; applicants hear the decision.
create or replace function public.notify_on_broker_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not new.is_active and new.user_id is not null then
      perform public.notify_admins('admin', 'طلب انضمام جديد',
        new.name || ' — ' || case new.account_type when 'company' then 'شركة تسويق / وساطة' when 'developer' then 'شركة تطوير' when 'owner' then 'مالك عقار' else 'وسيط' end,
        new.id, '/admin');
    end if;
    return new;
  end if;
  if new.is_active and not old.is_active and new.suspended_at is null then
    perform public.notify_user(new.user_id, 'request_status', 'تم اعتماد حسابك على فاليو عقار ✓', 'تقدر تدخل لوحتك دلوقتي.', new.id, '/dashboard');
  elsif new.rejected_at is not null and old.rejected_at is null then
    perform public.notify_user(new.user_id, 'request_status', 'طلب الانضمام ما اتقبلش', coalesce(new.review_note, ''), new.id, '/dashboard');
  end if;
  return new;
end $$;
revoke execute on function public.notify_on_broker_review() from public, anon, authenticated;
create trigger brokers_notify_review after insert or update on public.brokers for each row execute function public.notify_on_broker_review();

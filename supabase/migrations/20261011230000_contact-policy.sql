-- Item 17: contact-data policy. Customers reach companies through Value Aqar: brokers' phone, WhatsApp and
-- e-mail are no longer readable by the public API. An admin can allow an account to show its contact details
-- (per agreement). Inquiries from a broker's page become leads assigned to that broker on the platform.

alter table public.brokers add column if not exists show_contact boolean not null default false;

-- Column-level read access: safe profile columns only.
revoke select on public.brokers from anon, authenticated;
grant select (id, slug, name, specialty, bio, photo_url, areas, facebook, is_active, is_demo, account_type, show_contact,
              created_at, updated_at, suspended_at) on public.brokers to anon;  -- suspended_at: used by public visibility rules
grant select (id, slug, name, specialty, bio, photo_url, areas, facebook, is_active, is_demo, account_type, show_contact,
              created_at, updated_at, user_id, suspended_at) on public.brokers to authenticated;

-- The signed-in user's own account (any status), or the company they work for.
create or replace function public.my_account()
returns setof public.brokers language sql stable security definer set search_path = public as $$
  select * from public.brokers where user_id = auth.uid()
  union all
  select b.* from public.brokers b
  where not exists (select 1 from public.brokers o where o.user_id = auth.uid())
    and b.id = (select company_id from public.my_membership() limit 1)
$$;
revoke execute on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;

-- Full account rows for admins and Value Aqar staff.
create or replace function public.admin_brokers()
returns setof public.brokers language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or public.is_staff()) then
    raise exception 'غير مصرح لك' using errcode = '42501';
  end if;
  return query select * from public.brokers order by created_at desc;
end $$;
revoke execute on function public.admin_brokers() from public, anon;
grant execute on function public.admin_brokers() to authenticated;

-- Contact details only where allowed: the account itself, admins/staff, or accounts the admin opened up.
create or replace function public.broker_contacts(_ids uuid[])
returns table (id uuid, phone text, whatsapp text, email text)
language sql stable security definer set search_path = public as $$
  select b.id, b.phone, b.whatsapp, b.email from public.brokers b
  where b.id = any(_ids) and b.is_active
    and (b.show_contact or public.has_role(auth.uid(), 'admin') or public.is_staff() or b.id = public.current_broker_id())
$$;
revoke execute on function public.broker_contacts(uuid[]) from public;
grant execute on function public.broker_contacts(uuid[]) to anon, authenticated;

-- Only admins decide who shows contact details.
create or replace function public.brokers_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') and coalesce(auth.role(), '') <> 'service_role' then
    new.is_active := old.is_active;
    new.plan_id := old.plan_id;
    new.user_id := old.user_id;
    new.slug := old.slug;
    new.is_demo := old.is_demo;
    new.account_type := old.account_type;
    new.suspended_at := old.suspended_at;
    new.phone := old.phone;
    new.review_note := old.review_note;
    new.rejected_at := old.rejected_at;
    new.show_contact := old.show_contact;
  end if;
  if new.is_active then new.rejected_at := null; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.brokers_guard() from public, anon, authenticated;

-- Inquiries from a broker's public page: the visitor names the broker, the platform assigns it.
alter table public.leads add column if not exists via_broker_id uuid references public.brokers(id) on delete set null;

create or replace function public.leads_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_admin boolean := public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role';
  staff boolean := public.is_staff();
  role text := public.current_member_role();
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if not (is_admin or staff) then
      -- Public forms: the platform decides source and routing.
      new.source := 'website';
      new.source_note := null;
      new.assigned_broker_id := null;
      new.assigned_member_id := null;
      new.assigned_staff_id := null;
      new.phone_verified := false;
      if new.property_id is not null then
        select broker_id into new.assigned_broker_id from public.properties where id = new.property_id and review_status = 'approved';
        new.kind := 'inquiry';
      elsif new.via_broker_id is not null then
        select id into new.assigned_broker_id from public.brokers where id = new.via_broker_id and is_active and suspended_at is null;
        new.kind := 'inquiry';
        new.source_note := 'صفحة الوسيط';
      end if;
    elsif staff and not is_admin then
      new.phone_verified := false;
    end if;
    -- The source a lead arrived with is kept forever.
    new.original_source := new.source;
    if new.assigned_member_id is not null and not exists (
      select 1 from public.company_members m where m.id = new.assigned_member_id and m.company_id = new.assigned_broker_id) then
      new.assigned_member_id := null;
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  new.original_source := old.original_source;
  new.created_by := old.created_by;
  new.via_broker_id := old.via_broker_id;
  if not is_admin then
    new.name := old.name; new.phone := old.phone; new.kind := old.kind; new.details := old.details;
    new.property_type := old.property_type; new.area := old.area; new.budget := old.budget;
    new.property_id := old.property_id;
    new.purpose := old.purpose; new.asking_price := old.asking_price; new.size_m2 := old.size_m2;
    new.phone_verified := old.phone_verified;
    new.source := old.source; new.source_note := old.source_note;
    if not staff then
      new.assigned_broker_id := old.assigned_broker_id;
      new.assigned_staff_id := old.assigned_staff_id;
      if role is distinct from 'owner' and role is distinct from 'manager' then
        new.assigned_member_id := old.assigned_member_id;
      end if;
    end if;
  end if;
  -- A team member must belong to the company the lead is assigned to.
  if new.assigned_broker_id is distinct from old.assigned_broker_id and new.assigned_member_id is not distinct from old.assigned_member_id then
    new.assigned_member_id := null;
  end if;
  if new.assigned_member_id is not null and not exists (
    select 1 from public.company_members m where m.id = new.assigned_member_id and m.company_id = new.assigned_broker_id) then
    raise exception 'عضو الفريق ده مش تابع للشركة المسند ليها العميل' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.leads_guard() from public, anon, authenticated;

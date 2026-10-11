-- Item 10: companies with team members, Value Aqar staff, and a review status for every account.
-- Members are added by phone; whoever signs in with that phone works inside the company's account.

-- 1) Value Aqar staff role. The new enum value is only compared as text in this file
--    (Postgres forbids using a freshly added enum value inside the same transaction).
alter type public.app_role add value if not exists 'staff';

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role::text = 'staff')
$$;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- 2) Company accounts and registry data.
alter table public.brokers drop constraint if exists brokers_account_type_check;
alter table public.brokers add constraint brokers_account_type_check
  check (account_type in ('individual','office','owner','developer','company'));
alter table public.brokers
  add column if not exists contact_person text check (contact_person is null or char_length(contact_person) <= 100),
  add column if not exists commercial_register text check (commercial_register is null or char_length(commercial_register) <= 50),
  add column if not exists address text check (address is null or char_length(address) <= 300),
  add column if not exists review_note text check (review_note is null or char_length(review_note) <= 500),
  add column if not exists rejected_at timestamptz;


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
  end if;
  if new.is_active then new.rejected_at := null; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.brokers_guard() from public, anon, authenticated;

-- 3) Company team.
create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.brokers(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  phone text not null check (char_length(phone) between 8 and 20),
  role text not null default 'sales' check (role in ('manager','sales','broker')),
  is_active boolean not null default true,
  added_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One phone belongs to one company team at most.
create unique index company_members_phone_uidx on public.company_members (public.normalize_phone(phone));
create index company_members_company_idx on public.company_members (company_id);
grant select, insert, update, delete on public.company_members to authenticated;
grant all on public.company_members to service_role;
alter table public.company_members enable row level security;

create or replace function public.my_phone()
returns text language sql stable security definer set search_path = public, auth as $$
  select public.normalize_phone(phone) from auth.users where id = auth.uid()
$$;
revoke execute on function public.my_phone() from public, anon;
grant execute on function public.my_phone() to authenticated;

create or replace function public.owned_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.brokers
  where user_id = auth.uid() and is_active and suspended_at is null and account_type in ('office','company','developer')
  limit 1
$$;
revoke execute on function public.owned_company_id() from public, anon;
grant execute on function public.owned_company_id() to authenticated;

create policy "company owner manages team" on public.company_members for all to authenticated
  using (company_id = public.owned_company_id()) with check (company_id = public.owned_company_id());
create policy "member reads own membership" on public.company_members for select to authenticated
  using (public.normalize_phone(phone) = public.my_phone());
create policy "admin manages team members" on public.company_members for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "staff reads team members" on public.company_members for select to authenticated
  using (public.is_staff());

create or replace function public.company_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.phone := coalesce(public.normalize_phone(new.phone), new.phone);
  if exists (select 1 from public.brokers b where public.normalize_phone(b.phone) = new.phone and b.id <> new.company_id) then
    raise exception 'الرقم ده مسجّل كحساب مستقل على المنصة' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.added_by := auth.uid();
  else
    new.company_id := old.company_id;
    new.added_by := old.added_by;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.company_members_guard() from public, anon, authenticated;
create trigger company_members_guard before insert or update on public.company_members
  for each row execute function public.company_members_guard();

-- 4) Who am I acting for? Own active account first, otherwise an active team membership.
create or replace function public.my_membership()
returns table (company_id uuid, role text, member_name text)
language sql stable security definer set search_path = public as $$
  select m.company_id, m.role, m.name
  from public.company_members m
  join public.brokers b on b.id = m.company_id
  where m.is_active and b.is_active and b.suspended_at is null
    and public.normalize_phone(m.phone) = public.my_phone()
  limit 1
$$;
revoke execute on function public.my_membership() from public, anon;
grant execute on function public.my_membership() to authenticated;

create or replace function public.current_broker_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from public.brokers where user_id = auth.uid() and is_active limit 1),
    (select company_id from public.my_membership())
  )
$$;

-- Join requests: not for people who already work inside a company team.
drop policy if exists "user requests to join" on public.brokers;
create policy "user requests to join" on public.brokers for insert to authenticated
  with check (user_id = auth.uid() and is_active = false and is_demo = false and plan_id is null
    and rejected_at is null and review_note is null
    and account_type in ('individual','owner','developer','company')
    and not exists (select 1 from public.my_membership()));

-- 'owner' for the account holder, otherwise the team role (manager / sales / broker), null for neither.
create or replace function public.current_member_role()
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.brokers where user_id = auth.uid() and is_active) then 'owner'
    else (select role from public.my_membership())
  end
$$;
revoke execute on function public.current_member_role() from public, anon;
grant execute on function public.current_member_role() to authenticated;

-- Developers' projects: owner and managers.
create or replace function public.current_developer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select b.id from public.brokers b
  where b.id = public.current_broker_id() and b.account_type = 'developer' and b.suspended_at is null
    and public.current_member_role() in ('owner','manager')
$$;

-- 5) Sales staff and affiliated brokers work leads only; listings stay with the owner and managers.
create or replace function public.properties_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim integer; cnt integer;
begin
  if public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    new.updated_at := now();
    return new;
  end if;
  if public.current_member_role() in ('sales','broker') then
    raise exception 'صلاحيتك في الشركة لا تسمح بإدارة العقارات' using errcode = '42501';
  end if;
  new.is_featured := coalesce(case when tg_op = 'UPDATE' then old.is_featured end, false);
  new.featured_until := case when tg_op = 'UPDATE' then old.featured_until end;
  new.is_demo := false;
  new.owner_lead_id := case when tg_op = 'UPDATE' then old.owner_lead_id end;
  if new.review_status <> 'draft' then
    if tg_op = 'UPDATE' and old.review_status = 'rejected' then
      new.review_status := 'pending';
    else
      new.review_status := 'approved';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.broker_id := old.broker_id;
    new.review_note := old.review_note;
  end if;
  if tg_op = 'INSERT' then
    select p.max_properties into lim from public.brokers b left join public.plans p on p.id = b.plan_id where b.id = new.broker_id;
    select count(*) into cnt from public.properties where broker_id = new.broker_id;
    if cnt >= coalesce(lim, 5) then raise exception 'تم الوصول للحد الأقصى من العقارات في باقتك (%)', coalesce(lim,5); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.properties_guard() from public, anon, authenticated;

create or replace function public.properties_delete_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') and coalesce(auth.role(), '') <> 'service_role'
     and public.current_member_role() in ('sales','broker') then
    raise exception 'صلاحيتك في الشركة لا تسمح بحذف العقارات' using errcode = '42501';
  end if;
  return old;
end $$;
revoke execute on function public.properties_delete_guard() from public, anon, authenticated;
drop trigger if exists properties_delete_guard on public.properties;
create trigger properties_delete_guard before delete on public.properties
  for each row execute function public.properties_delete_guard();

-- 6) Value Aqar staff: read everything operational, work and assign leads (not delete, not edit customer data).
create policy "staff reads brokers" on public.brokers for select to authenticated using (public.is_staff());
create policy "staff reads properties" on public.properties for select to authenticated using (public.is_staff());
create policy "staff reads projects" on public.projects for select to authenticated using (public.is_staff());
create policy "staff reads leads" on public.leads for select to authenticated using (public.is_staff());
create policy "staff updates leads" on public.leads for update to authenticated using (public.is_staff()) with check (public.is_staff());

create or replace function public.leads_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' then
    new.updated_at := now(); return new;
  end if;
  if tg_op = 'INSERT' then
    new.assigned_broker_id := null;
    new.phone_verified := false;
    if new.property_id is not null then
      select broker_id into new.assigned_broker_id from public.properties where id = new.property_id and review_status = 'approved';
      new.kind := 'inquiry';
    end if;
  else
    new.name := old.name; new.phone := old.phone; new.kind := old.kind; new.details := old.details;
    new.property_type := old.property_type; new.area := old.area; new.budget := old.budget;
    new.property_id := old.property_id;
    -- Only admins and Value Aqar staff can (re)assign a lead.
    if not public.is_staff() then new.assigned_broker_id := old.assigned_broker_id; end if;
    new.purpose := old.purpose; new.asking_price := old.asking_price; new.size_m2 := old.size_m2;
    new.phone_verified := old.phone_verified;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.leads_guard() from public, anon, authenticated;

-- فاليو عقار — إصدار 2026-10-11: كل تحديثات قاعدة البيانات مرة واحدة.
-- بيتنفذ كله أو مفيش حاجة بتتغيّر (transaction واحدة). ما تشغلوش مرتين.
-- الملفات بالترتيب:
--   20261011120000_owner-listings.sql
--   20261011130000_owner-photos-broker-autopublish.sql
--   20261011140000_developers-projects.sql
--   20261011150000_companies-staff.sql
--   20261011160000_app-store-links.sql
--   20261011170000_leads-center.sql
--   20261011180000_lead-pipeline.sql
--   20261011190000_referral-proof.sql
--   20261011191000_team-notifications.sql

begin;

-- ================= 20261011120000_owner-listings.sql =================
-- "بيع عقارك": owners submit their property as a lead of kind 'listing'.
alter table public.leads drop constraint if exists leads_kind_check;
alter table public.leads add constraint leads_kind_check check (kind in ('request','inquiry','listing'));

alter table public.leads
  add column if not exists purpose text check (purpose is null or purpose in ('sale','rent')),
  add column if not exists asking_price numeric check (asking_price is null or asking_price >= 0),
  add column if not exists size_m2 numeric check (size_m2 is null or (size_m2 > 0 and size_m2 < 10000000)),
  add column if not exists phone_verified boolean not null default false;

-- Only the server (service_role, after a WhatsApp code) or an admin may mark a phone as verified.
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
    new.property_id := old.property_id; new.assigned_broker_id := old.assigned_broker_id;
    new.purpose := old.purpose; new.asking_price := old.asking_price; new.size_m2 := old.size_m2;
    new.phone_verified := old.phone_verified;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.leads_guard() from public, anon, authenticated;

create or replace function public.notify_on_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare t text; ttl text; bu uuid; msg text;
begin
  if tg_op = 'INSERT' then
    t := case when new.kind = 'inquiry' then 'new_inquiry' else 'new_request' end;
    ttl := case new.kind when 'inquiry' then 'استفسار جديد عن عقار' when 'listing' then 'عقار جديد من مالك' else 'طلب عقاري جديد' end;
    msg := new.name || coalesce(' — ' || new.property_type, '') || coalesce(' — ' || new.area, '');
    perform public.notify_admins(t, ttl, msg, new.id, '/inquiries');
    if new.assigned_broker_id is not null then
      select user_id into bu from public.brokers where id = new.assigned_broker_id;
      if not public.has_role(bu, 'admin') then perform public.notify_user(bu, t, ttl, msg, new.id, '/inquiries'); end if;
    end if;
  elsif new.assigned_broker_id is distinct from old.assigned_broker_id and new.assigned_broker_id is not null then
    select user_id into bu from public.brokers where id = new.assigned_broker_id;
    perform public.notify_user(bu, 'new_request', 'تم إسناد طلب جديد لك', new.name, new.id, '/inquiries');
  end if;
  return new;
end $$;
revoke execute on function public.notify_on_lead() from public, anon, authenticated;


-- ================= 20261011130000_owner-photos-broker-autopublish.sql =================
-- Property photo galleries, owner listings as pending properties, and instant publishing for active brokers.

alter table public.properties
  add column if not exists images text[] not null default '{}' check (cardinality(images) <= 12),
  add column if not exists owner_lead_id uuid references public.leads(id) on delete set null;
create index if not exists properties_owner_lead_idx on public.properties (owner_lead_id) where owner_lead_id is not null;

-- Keep existing single-image listings visible in galleries.
update public.properties set images = array[image_url] where image_url is not null and cardinality(images) = 0;

-- Brokers (only active ones reach here through RLS) publish immediately.
-- A listing the admin rejected goes back to review when the broker edits it.
-- Owner listings are created by the server (service_role) as 'pending' and approved by an admin.
create or replace function public.properties_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim integer; cnt integer;
begin
  if public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    new.updated_at := now();
    return new;
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


-- ================= 20261011140000_developers-projects.sql =================
-- Developer accounts, projects (compounds) and their units.
-- A developer is a broker row with account_type = 'developer': approved once by an admin, then publishes instantly.

alter table public.brokers drop constraint if exists brokers_account_type_check;
alter table public.brokers add constraint brokers_account_type_check check (account_type in ('individual','office','owner','developer'));
drop policy if exists "user requests to join" on public.brokers;
create policy "user requests to join" on public.brokers for insert to authenticated
  with check (user_id = auth.uid() and is_active = false and is_demo = false and plan_id is null and account_type in ('individual','owner','developer'));

create or replace function public.current_developer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.brokers where user_id = auth.uid() and is_active and suspended_at is null and account_type = 'developer' limit 1
$$;
revoke execute on function public.current_developer_id() from public, anon;
grant execute on function public.current_developer_id() to authenticated;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.brokers(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 150),
  description text check (description is null or char_length(description) <= 5000),
  city text not null,
  area text not null,
  address text check (address is null or char_length(address) <= 300),
  lat double precision,
  lng double precision,
  images text[] not null default '{}' check (cardinality(images) <= 12),
  payment_plans text check (payment_plans is null or char_length(payment_plans) <= 2000),
  delivery_date text check (delivery_date is null or char_length(delivery_date) <= 100),
  amenities text[] not null default '{}' check (cardinality(amenities) <= 30),
  -- 'approved' = visible on the site; admins can set 'rejected' to hide a project.
  review_status public.review_status not null default 'approved',
  review_note text,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_developer_idx on public.projects (developer_id);
grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;

create policy "approved projects public" on public.projects for select to anon, authenticated
  using (review_status = 'approved' and exists (select 1 from public.brokers b where b.id = developer_id and b.is_active and b.suspended_at is null));
create policy "developer reads own projects" on public.projects for select to authenticated
  using (developer_id = public.current_developer_id());
create policy "developer inserts own projects" on public.projects for insert to authenticated
  with check (developer_id = public.current_developer_id());
create policy "developer updates own projects" on public.projects for update to authenticated
  using (developer_id = public.current_developer_id()) with check (developer_id = public.current_developer_id());
create policy "developer deletes own projects" on public.projects for delete to authenticated
  using (developer_id = public.current_developer_id());
create policy "admin manages projects" on public.projects for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.projects_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null) then
    if tg_op = 'INSERT' then
      new.review_status := 'approved';
      new.review_note := null;
      new.is_featured := false;
    else
      -- A project the admin hid goes back to review when the developer edits it.
      new.review_status := case when old.review_status = 'rejected' then 'pending' else old.review_status end;
      new.review_note := old.review_note;
      new.is_featured := old.is_featured;
      new.developer_id := old.developer_id;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.projects_guard() from public, anon, authenticated;
create trigger projects_guard before insert or update on public.projects for each row execute function public.projects_guard();

create table public.project_units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text check (code is null or char_length(code) <= 50),
  unit_type text not null check (char_length(unit_type) between 2 and 50),
  size numeric not null default 0 check (size >= 0),
  rooms integer check (rooms is null or rooms between 0 and 50),
  baths integer check (baths is null or baths between 0 and 50),
  floor text check (floor is null or char_length(floor) <= 50),
  price numeric check (price is null or price >= 0),
  status text not null default 'available' check (status in ('available','reserved','sold','unavailable')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);
create index project_units_project_idx on public.project_units (project_id);
grant select on public.project_units to anon, authenticated;
grant insert, update, delete on public.project_units to authenticated;
grant all on public.project_units to service_role;
alter table public.project_units enable row level security;

create policy "units of visible projects public" on public.project_units for select to anon, authenticated
  using (exists (select 1 from public.projects p where p.id = project_id));
create policy "developer manages own units" on public.project_units for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.developer_id = public.current_developer_id()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.developer_id = public.current_developer_id()));
create policy "admin manages units" on public.project_units for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- History of unit price/status changes (item 16).
create table public.project_unit_history (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.project_units(id) on delete cascade,
  changed_by uuid,
  old_price numeric,
  new_price numeric,
  old_status text,
  new_status text,
  created_at timestamptz not null default now()
);
create index project_unit_history_unit_idx on public.project_unit_history (unit_id, created_at desc);
grant select on public.project_unit_history to authenticated;
grant all on public.project_unit_history to service_role;
alter table public.project_unit_history enable row level security;
create policy "developer reads own unit history" on public.project_unit_history for select to authenticated
  using (exists (select 1 from public.project_units u join public.projects p on p.id = u.project_id where u.id = unit_id and p.developer_id = public.current_developer_id()));
create policy "admin reads unit history" on public.project_unit_history for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create or replace function public.project_units_track()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.project_id := old.project_id;
    if new.price is distinct from old.price or new.status is distinct from old.status then
      insert into public.project_unit_history (unit_id, changed_by, old_price, new_price, old_status, new_status)
      values (new.id, auth.uid(), old.price, new.price, old.status, new.status);
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.project_units_track() from public, anon, authenticated;
create trigger project_units_track before update on public.project_units for each row execute function public.project_units_track();


-- ================= 20261011150000_companies-staff.sql =================
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


-- ================= 20261011160000_app-store-links.sql =================
-- Store links for the mobile app, edited by admins from the dashboard (no code change needed).
-- Empty link = the app is not published on that store yet; the site then shows "coming soon".
create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  ios_url text check (ios_url is null or ios_url ~ '^https://apps\.apple\.com/'),
  android_url text check (android_url is null or android_url ~ '^https://play\.google\.com/store/apps/'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.app_settings (id) values (1);
grant select on public.app_settings to anon, authenticated;
grant update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "app settings public read" on public.app_settings for select to anon, authenticated using (true);
create policy "admin updates app settings" on public.app_settings for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.app_settings_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.id := 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
revoke execute on function public.app_settings_touch() from public, anon, authenticated;
create trigger app_settings_touch before update on public.app_settings for each row execute function public.app_settings_touch();


-- ================= 20261011170000_leads-center.sql =================
-- Item 11: leads center — lead number, source tracking, duplicate detection, assignment to staff / company team members.

alter table public.leads
  add column if not exists lead_no bigint generated always as identity,
  add column if not exists source text not null default 'website'
    check (source in ('website','whatsapp','facebook','instagram','tiktok','google_ads','referral','phone_call','walk_in','manual','excel','other')),
  add column if not exists original_source text,
  add column if not exists source_note text check (source_note is null or char_length(source_note) <= 200),
  add column if not exists phone_norm text generated always as (public.normalize_phone(phone)) stored,
  add column if not exists assigned_member_id uuid references public.company_members(id) on delete set null,
  add column if not exists assigned_staff_id uuid,
  add column if not exists created_by uuid;
update public.leads set original_source = source where original_source is null;
alter table public.leads alter column original_source set not null;
create unique index if not exists leads_lead_no_uidx on public.leads (lead_no);
create index if not exists leads_phone_norm_idx on public.leads (phone_norm);
create index if not exists leads_assigned_member_idx on public.leads (assigned_member_id) where assigned_member_id is not null;
create index if not exists leads_assigned_staff_idx on public.leads (assigned_staff_id) where assigned_staff_id is not null;

-- The signed-in user's team membership id (null for account owners and everyone else).
create or replace function public.my_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select m.id from public.company_members m
  join public.brokers b on b.id = m.company_id
  where m.is_active and b.is_active and b.suspended_at is null
    and public.normalize_phone(m.phone) = public.my_phone()
    and not exists (select 1 from public.brokers own where own.user_id = auth.uid() and own.is_active)
  limit 1
$$;
revoke execute on function public.my_member_id() from public, anon;
grant execute on function public.my_member_id() to authenticated;

-- Owner and managers see every lead of the company; sales staff and affiliated brokers only the ones assigned to them.
drop policy if exists "broker reads assigned leads" on public.leads;
drop policy if exists "broker updates assigned leads" on public.leads;
create policy "company reads its leads" on public.leads for select to authenticated
  using (assigned_broker_id = public.current_broker_id()
    and (public.current_member_role() in ('owner','manager') or assigned_member_id = public.my_member_id()));
create policy "company updates its leads" on public.leads for update to authenticated
  using (assigned_broker_id = public.current_broker_id()
    and (public.current_member_role() in ('owner','manager') or assigned_member_id = public.my_member_id()))
  with check (assigned_broker_id = public.current_broker_id());

-- Managers can see their team (to assign leads); owners already manage it.
create policy "manager reads team" on public.company_members for select to authenticated
  using (company_id = public.current_broker_id() and public.current_member_role() = 'manager');

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

-- History: also record source changes and team / staff assignments.
alter table public.lead_activities drop constraint if exists lead_activities_kind_check;
alter table public.lead_activities add constraint lead_activities_kind_check
  check (kind in ('call','whatsapp','status','note','follow_up','assign','source'));

create or replace function public.log_lead_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.id, auth.uid(), 'status', old.stage || ' → ' || new.stage);
  end if;
  if new.notes is distinct from old.notes and coalesce(new.notes,'') <> '' then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.id, auth.uid(), 'note', left(new.notes, 1000));
  end if;
  if new.follow_up_at is distinct from old.follow_up_at then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.id, auth.uid(), 'follow_up', coalesce(to_char(new.follow_up_at at time zone 'Africa/Cairo','YYYY-MM-DD HH24:MI'), 'cleared'));
  end if;
  if new.assigned_broker_id is distinct from old.assigned_broker_id then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.id, auth.uid(), 'assign', coalesce((select name from public.brokers where id = new.assigned_broker_id), 'unassigned'));
  end if;
  if new.assigned_member_id is distinct from old.assigned_member_id then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.id, auth.uid(), 'assign', 'فريق: ' || coalesce((select name from public.company_members where id = new.assigned_member_id), 'بدون'));
  end if;
  if new.assigned_staff_id is distinct from old.assigned_staff_id then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.id, auth.uid(), 'assign', case when new.assigned_staff_id is null then 'موظف فاليو عقار: بدون' else 'موظف فاليو عقار' end);
  end if;
  if new.source is distinct from old.source or new.source_note is distinct from old.source_note then
    insert into public.lead_activities(lead_id, actor_id, kind, summary)
    values (new.id, auth.uid(), 'source', old.source || ' → ' || new.source || coalesce(' (' || new.source_note || ')', '') || ' · الأصلي: ' || new.original_source);
  end if;
  return new;
end $$;
revoke execute on function public.log_lead_changes() from public, anon, authenticated;


-- ================= 20261011180000_lead-pipeline.sql =================
-- Item 12: the 10-stage customer pipeline, with the data each stage needs.
-- Reservation / contract / sale details live on a deal (one per lead) with documents; a sale is only
-- confirmed after an admin approves it (the core of the deals center, item 14).

-- 1) Stage becomes text with the new 10 values. Old values map: viewing → visit_scheduled,
--    negotiating → qualified, won → sold. (Text instead of the enum: new enum values can't be used in the
--    same transaction that adds them.)
drop policy if exists "anyone submits leads" on public.leads;
alter table public.leads alter column stage drop default;
alter table public.leads alter column stage type text using (case stage::text
  when 'viewing' then 'visit_scheduled' when 'negotiating' then 'qualified' when 'won' then 'sold' else stage::text end);
alter table public.leads alter column stage set default 'new';
alter table public.leads add constraint leads_stage_check check (stage in
  ('new','contacted','qualified','visit_scheduled','visited','reserved','contracted','sold','lost','postponed'));
create policy "anyone submits leads" on public.leads for insert to anon, authenticated
  with check (stage = 'new' and notes is null);

alter table public.leads
  add column if not exists lost_reason text check (lost_reason is null or char_length(lost_reason) <= 300),
  add column if not exists visit_at timestamptz,
  add column if not exists stage_changed_at timestamptz;

-- 2) Deals.
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  deal_no bigint generated always as identity unique,
  lead_id uuid not null unique references public.leads(id) on delete restrict,
  broker_id uuid references public.brokers(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  project_unit_id uuid references public.project_units(id) on delete set null,
  unit_desc text check (unit_desc is null or char_length(unit_desc) <= 300),
  reservation_date date,
  reservation_amount numeric check (reservation_amount is null or reservation_amount >= 0),
  contract_date date,
  contract_value numeric check (contract_value is null or contract_value >= 0),
  sale_date date,
  sale_value numeric check (sale_value is null or sale_value >= 0),
  sale_requested_at timestamptz,
  review_status text not null default 'draft' check (review_status in ('draft','pending','approved','rejected','needs_info')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contract_date is null or reservation_date is null or contract_date >= reservation_date),
  check (sale_date is null or contract_date is null or sale_date >= contract_date)
);
create index deals_broker_idx on public.deals (broker_id);
create index deals_review_idx on public.deals (review_status);
grant select, insert, update on public.deals to authenticated;
grant all on public.deals to service_role;
alter table public.deals enable row level security;

-- Who can work a lead can see and fill its deal; the lead's own visibility rules decide.
create policy "deal visible with its lead" on public.deals for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));
create policy "deal created on a visible lead" on public.deals for insert to authenticated
  with check (exists (select 1 from public.leads l where l.id = lead_id));
create policy "deal updated on a visible lead" on public.deals for update to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id))
  with check (exists (select 1 from public.leads l where l.id = lead_id));

create or replace function public.deals_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare is_admin boolean := public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    select assigned_broker_id into new.broker_id from public.leads where id = new.lead_id;
    if not is_admin then
      new.review_status := 'draft'; new.review_note := null; new.reviewed_by := null; new.reviewed_at := null; new.sale_requested_at := null;
    end if;
  else
    new.lead_id := old.lead_id;
    new.created_by := old.created_by;
    if not is_admin then
      if old.review_status = 'approved' then
        raise exception 'الصفقة اتعتمدت من الإدارة ومينفعش تتعدّل' using errcode = '42501';
      end if;
      new.broker_id := old.broker_id;
      new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at; new.review_note := old.review_note;
      -- Companies can only submit for review (pending) or keep a draft; editing after rejection resubmits.
      if new.review_status not in ('draft','pending') then new.review_status := old.review_status; end if;
      if new.review_status = 'pending' and old.review_status <> 'pending' then
        if new.sale_date is null or new.sale_value is null then
          raise exception 'اكتب تاريخ وقيمة البيع قبل الإرسال للمراجعة' using errcode = '23514';
        end if;
        if not exists (select 1 from public.deal_documents d where d.deal_id = new.id and d.kind = 'sale') then
          raise exception 'ارفع مستند البيع (العقد النهائي أو إيصال السداد) قبل الإرسال للمراجعة' using errcode = '23514';
        end if;
        new.sale_requested_at := now();
      else
        new.sale_requested_at := old.sale_requested_at;
      end if;
    elsif new.review_status is distinct from old.review_status and new.review_status in ('approved','rejected','needs_info') then
      if new.review_status <> 'approved' and coalesce(new.review_note, '') = '' then
        raise exception 'اكتب سبب الرفض أو البيانات المطلوبة' using errcode = '23514';
      end if;
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.deals_guard() from public, anon, authenticated;
create trigger deals_guard before insert or update on public.deals for each row execute function public.deals_guard();

-- 3) Documents (private storage bucket, files under deal-docs/<deal id>/...).
create table public.deal_documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete restrict,
  kind text not null check (kind in ('reservation','contract','sale','payment','other')),
  file_path text not null unique check (char_length(file_path) <= 300),
  file_name text not null check (char_length(file_name) <= 200),
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index deal_documents_deal_idx on public.deal_documents (deal_id);
grant select, insert, delete on public.deal_documents to authenticated;
grant all on public.deal_documents to service_role;
alter table public.deal_documents enable row level security;
create policy "documents visible with their deal" on public.deal_documents for select to authenticated
  using (exists (select 1 from public.deals d where d.id = deal_id));
create policy "documents added to an open deal" on public.deal_documents for insert to authenticated
  with check (uploaded_by = auth.uid() and file_path like deal_id::text || '/%'
    and exists (select 1 from public.deals d where d.id = deal_id and d.review_status <> 'approved'));
create policy "uploader removes own document from an open deal" on public.deal_documents for delete to authenticated
  using (uploaded_by = auth.uid() and exists (select 1 from public.deals d where d.id = deal_id and d.review_status in ('draft','rejected','needs_info')));

insert into storage.buckets (id, name, public) values ('deal-docs', 'deal-docs', false) on conflict (id) do nothing;
create policy "deal docs readable with their deal" on storage.objects for select to authenticated
  using (bucket_id = 'deal-docs' and exists (select 1 from public.deals d where d.id::text = (storage.foldername(name))[1]));
create policy "deal docs uploaded to an open deal" on storage.objects for insert to authenticated
  with check (bucket_id = 'deal-docs' and exists (select 1 from public.deals d where d.id::text = (storage.foldername(name))[1] and d.review_status <> 'approved'));

-- 4) Stage rules.
create or replace function public.lead_stage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare d public.deals%rowtype;
begin
  if new.stage is not distinct from old.stage then return new; end if;
  new.stage_changed_at := now();
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if old.stage = 'sold' and not public.has_role(auth.uid(), 'admin') then
    raise exception 'البيع المؤكَّد مايتغيّرش غير من الإدارة' using errcode = '42501';
  end if;
  select * into d from public.deals where lead_id = new.id;
  case new.stage
    when 'lost' then
      if coalesce(trim(new.lost_reason), '') = '' then raise exception 'اكتب سبب عدم الاكتمال' using errcode = '23514'; end if;
    when 'postponed' then
      if new.follow_up_at is null or new.follow_up_at < now() then raise exception 'حدد ميعاد متابعة جاي للعميل المؤجَّل' using errcode = '23514'; end if;
    when 'visit_scheduled' then
      if new.visit_at is null then raise exception 'حدد ميعاد الزيارة' using errcode = '23514'; end if;
    when 'reserved' then
      if d.id is null or d.reservation_date is null or d.reservation_amount is null
         or not exists (select 1 from public.deal_documents x where x.deal_id = d.id and x.kind = 'reservation') then
        raise exception 'الحجز محتاج: تاريخ الحجز ومبلغه ومستند الحجز' using errcode = '23514';
      end if;
    when 'contracted' then
      if d.id is null or d.contract_date is null or d.contract_value is null
         or not exists (select 1 from public.deal_documents x where x.deal_id = d.id and x.kind = 'contract') then
        raise exception 'العقد محتاج: تاريخ العقد وقيمته ومستند العقد' using errcode = '23514';
      end if;
    when 'sold' then
      if d.id is null or d.review_status <> 'approved' then
        raise exception 'البيع بيتأكد بعد مراجعة الإدارة للصفقة' using errcode = '23514';
      end if;
    else null;
  end case;
  return new;
end $$;
revoke execute on function public.lead_stage_guard() from public, anon, authenticated;
create trigger lead_stage_guard before update on public.leads for each row execute function public.lead_stage_guard();

-- Approving a sale confirms the lead; a sale request notifies the admins.
create or replace function public.deals_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare l public.leads%rowtype;
begin
  select * into l from public.leads where id = new.lead_id;
  if new.review_status = 'approved' and old.review_status is distinct from 'approved' then
    update public.leads set stage = 'sold' where id = new.lead_id and stage <> 'sold';
  end if;
  if new.review_status = 'pending' and old.review_status is distinct from 'pending' then
    perform public.notify_admins('admin', 'صفقة بانتظار المراجعة',
      'طلب تأكيد بيع للعميل ' || l.name || ' (VA-' || lpad(l.lead_no::text, 6, '0') || ')', new.lead_id, '/leads/' || new.lead_id);
  end if;
  return new;
end $$;
revoke execute on function public.deals_after() from public, anon, authenticated;
create trigger deals_after after update on public.deals for each row execute function public.deals_after();

-- Pipeline history in the lead's log.
alter table public.lead_activities drop constraint if exists lead_activities_kind_check;
alter table public.lead_activities add constraint lead_activities_kind_check
  check (kind in ('call','whatsapp','status','note','follow_up','assign','source','deal'));

create or replace function public.log_deal_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.lead_id, auth.uid(), 'deal', 'فتح صفقة D-' || lpad(new.deal_no::text, 6, '0'));
  elsif new.review_status is distinct from old.review_status then
    insert into public.lead_activities(lead_id, actor_id, kind, summary)
    values (new.lead_id, auth.uid(), 'deal', 'حالة المراجعة: ' || new.review_status || coalesce(' — ' || new.review_note, ''));
  end if;
  return new;
end $$;
revoke execute on function public.log_deal_changes() from public, anon, authenticated;
create trigger deals_log after insert or update on public.deals for each row execute function public.log_deal_changes();


-- ================= 20261011190000_referral-proof.sql =================
-- Item 13: proof of where a customer came from (protects Value Aqar's commission).
-- Every lead keeps the first company it was referred to and when, plus a full assignment history;
-- admins and staff get a report of suspicious patterns to review.

alter table public.leads
  add column if not exists first_broker_id uuid references public.brokers(id) on delete set null,
  add column if not exists first_referred_at timestamptz,
  add column if not exists referred_at timestamptz;
update public.leads set first_broker_id = assigned_broker_id, first_referred_at = created_at, referred_at = created_at
where assigned_broker_id is not null and first_referred_at is null;

-- Runs after leads_guard (triggers fire in name order), so it sees the final assignment.
create or replace function public.leads_referral_track()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- The first referral is permanent evidence.
    new.first_broker_id := old.first_broker_id;
    new.first_referred_at := old.first_referred_at;
    if new.assigned_broker_id is distinct from old.assigned_broker_id then
      new.referred_at := case when new.assigned_broker_id is null then null else now() end;
    else
      new.referred_at := old.referred_at;
    end if;
  else
    new.referred_at := case when new.assigned_broker_id is null then null else now() end;
  end if;
  if new.first_broker_id is null and new.assigned_broker_id is not null then
    new.first_broker_id := new.assigned_broker_id;
    new.first_referred_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.leads_referral_track() from public, anon, authenticated;
create trigger leads_referral_track before insert or update on public.leads for each row execute function public.leads_referral_track();

-- Assignment history (who had the lead, from when, changed by whom). Admin and staff only.
create table public.lead_assignments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  broker_id uuid references public.brokers(id) on delete set null,
  member_id uuid references public.company_members(id) on delete set null,
  staff_id uuid,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index lead_assignments_lead_idx on public.lead_assignments (lead_id, created_at);
grant select on public.lead_assignments to authenticated;
grant all on public.lead_assignments to service_role;
alter table public.lead_assignments enable row level security;
create policy "admin and staff read assignment history" on public.lead_assignments for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.is_staff());

insert into public.lead_assignments (lead_id, broker_id, member_id, staff_id, created_at)
select id, assigned_broker_id, assigned_member_id, assigned_staff_id, coalesce(first_referred_at, created_at)
from public.leads where assigned_broker_id is not null or assigned_staff_id is not null;

create or replace function public.log_lead_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_broker_id is null and new.assigned_staff_id is null then return new; end if;
  elsif new.assigned_broker_id is not distinct from old.assigned_broker_id
    and new.assigned_member_id is not distinct from old.assigned_member_id
    and new.assigned_staff_id is not distinct from old.assigned_staff_id then
    return new;
  end if;
  insert into public.lead_assignments (lead_id, broker_id, member_id, staff_id, changed_by)
  values (new.id, new.assigned_broker_id, new.assigned_member_id, new.assigned_staff_id, auth.uid());
  return new;
end $$;
revoke execute on function public.log_lead_assignment() from public, anon, authenticated;
create trigger leads_assignment_log after insert or update on public.leads for each row execute function public.log_lead_assignment();

-- Review report. Thresholds: 7 days without follow-up, 3 days for a "quick" sale or loss.
create or replace function public.lead_alerts()
returns table (kind text, lead_id uuid, lead_no bigint, lead_name text, broker_name text, detail text, happened_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or public.is_staff()) then
    raise exception 'غير مصرح لك بهذا التقرير' using errcode = '42501';
  end if;
  return query
  -- 1) Referred lead left without follow-up.
  select 'stale'::text, l.id, l.lead_no, l.name, b.name,
    'اتحال للشركة من ' || (current_date - l.referred_at::date) || ' يوم ومفيش نشاط من ' ||
      (current_date - greatest(l.referred_at, coalesce((select max(a.created_at) from public.lead_activities a where a.lead_id = l.id), l.referred_at))::date) || ' يوم',
    greatest(l.referred_at, coalesce((select max(a.created_at) from public.lead_activities a where a.lead_id = l.id), l.referred_at))
  from public.leads l join public.brokers b on b.id = l.assigned_broker_id
  where l.stage in ('new','contacted','qualified')
    and l.referred_at < now() - interval '7 days'
    and coalesce(l.follow_up_at, '-infinity') < now()
    and not exists (select 1 from public.lead_activities a where a.lead_id = l.id and a.created_at > now() - interval '7 days')
  union all
  -- 2) Sale with no visit and no reservation, or within 3 days of the referral.
  select 'sudden_sale', l.id, l.lead_no, l.name, b.name,
    case when l.visit_at is null and d.reservation_date is null then 'بيع من غير زيارة ولا حجز متسجلين'
         else 'البيع اتسجل بعد ' || (d.sale_date - l.referred_at::date) || ' يوم بس من الإحالة' end,
    coalesce(d.sale_requested_at, d.updated_at)
  from public.deals d join public.leads l on l.id = d.lead_id left join public.brokers b on b.id = d.broker_id
  where d.review_status in ('pending','approved') and d.sale_date is not null
    and ((l.visit_at is null and d.reservation_date is null) or (l.referred_at is not null and d.sale_date - l.referred_at::date < 3))
  union all
  -- 3) The company changed after the first referral.
  select 'company_changed', l.id, l.lead_no, l.name, b.name,
    'اتحال الأول لـ ' || coalesce(f.name, '—') || ' يوم ' || to_char(l.first_referred_at at time zone 'Africa/Cairo', 'YYYY-MM-DD') ||
      case when exists (select 1 from public.deals d where d.lead_id = l.id) then ' — وعليه صفقة' else '' end,
    l.referred_at
  from public.leads l left join public.brokers b on b.id = l.assigned_broker_id left join public.brokers f on f.id = l.first_broker_id
  where l.first_broker_id is not null and l.assigned_broker_id is distinct from l.first_broker_id
  union all
  -- 4) Dates out of order: deal dates before the lead existed or before the referral.
  select 'bad_dates', l.id, l.lead_no, l.name, b.name,
    concat_ws(' · ',
      case when d.reservation_date < l.created_at::date then 'الحجز قبل تسجيل العميل' end,
      case when d.sale_date < l.created_at::date then 'البيع قبل تسجيل العميل' end,
      case when l.first_referred_at is not null and d.reservation_date < l.first_referred_at::date then 'الحجز قبل الإحالة' end,
      case when l.first_referred_at is not null and d.sale_date < l.first_referred_at::date then 'البيع قبل الإحالة' end),
    d.updated_at
  from public.deals d join public.leads l on l.id = d.lead_id left join public.brokers b on b.id = d.broker_id
  where d.reservation_date < l.created_at::date or d.sale_date < l.created_at::date
     or (l.first_referred_at is not null and (d.reservation_date < l.first_referred_at::date or d.sale_date < l.first_referred_at::date))
  union all
  -- 5) Same customer phone held by more than one company.
  select 'dup_companies', l.id, l.lead_no, l.name, b.name,
    'نفس الرقم عند ' || x.n || ' شركات',
    l.created_at
  from public.leads l join public.brokers b on b.id = l.assigned_broker_id
  join (select phone_norm, count(distinct assigned_broker_id) n from public.leads
        where assigned_broker_id is not null and phone_norm is not null group by phone_norm having count(distinct assigned_broker_id) > 1) x
    on x.phone_norm = l.phone_norm
  union all
  -- 6) Closed as "lost" within 3 days of the referral — worth a call to the customer.
  select 'quick_lost', l.id, l.lead_no, l.name, b.name,
    'اتقفل «لم يكتمل» بعد ' || extract(day from (l.stage_changed_at - l.referred_at))::int || ' يوم من الإحالة — السبب: ' || coalesce(l.lost_reason, '—'),
    l.stage_changed_at
  from public.leads l join public.brokers b on b.id = l.assigned_broker_id
  where l.stage = 'lost' and l.referred_at is not null and l.stage_changed_at is not null
    and l.stage_changed_at - l.referred_at < interval '3 days';
end $$;
revoke execute on function public.lead_alerts() from public, anon;
grant execute on function public.lead_alerts() to authenticated;


-- ================= 20261011191000_team-notifications.sql =================
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


commit;

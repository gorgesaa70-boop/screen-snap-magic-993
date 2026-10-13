-- Compounds: a section of their own, separate from projects and malls. A compound belongs to its developer;
-- Value Aqar can run a compound for a developer who has no account yet and hand it over later with one change.
-- Each compound has its own units, a team assigned to it, and an activity log (the compound dashboard).
-- Malls can now belong to a developer too.
--
-- The base compounds table already exists on the live database (added from Lovable as drizzle 0030, empty).
-- Everything here is additive and safe to re-run: no column types change, nothing is dropped except
-- Lovable's open read policy and the global unique name (two developers may use the same compound name).

-- 0) Base table, same as the live one, so a fresh database matches.
create table if not exists public.compounds (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  logo_url text,
  description text check (description is null or length(description) <= 2000),
  location text check (location is null or length(location) <= 300),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.compounds to anon, authenticated;
grant insert, update, delete on public.compounds to authenticated;
grant all on public.compounds to service_role;
alter table public.compounds enable row level security;
alter table public.compounds drop constraint if exists compounds_name_key;

-- Resale listings by brokers inside a compound (kept from the Lovable version).
alter table public.properties add column if not exists compound_id uuid references public.compounds(id) on delete set null;
create index if not exists properties_compound_idx on public.properties (compound_id);
grant insert (compound_id), update (compound_id) on public.properties to authenticated;

create or replace function public.compound_units_take_location()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.compound_id is not null and (new.lat is null or new.lng is null) then
    select c.lat, c.lng into new.lat, new.lng from public.compounds c where c.id = new.compound_id and c.lat is not null and c.lng is not null;
  end if;
  return new;
end $$;
revoke execute on function public.compound_units_take_location() from public, anon, authenticated;
drop trigger if exists properties_compound_location on public.properties;
create trigger properties_compound_location before insert or update of compound_id, lat, lng on public.properties
  for each row execute function public.compound_units_take_location();

create or replace function public.compounds_move_units()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.lat, new.lng) is distinct from (old.lat, old.lng) and new.lat is not null and new.lng is not null then
    update public.properties set lat = new.lat, lng = new.lng
    where compound_id = new.id
      and ((lat is null or lng is null) or (lat = old.lat and lng = old.lng));
  end if;
  return new;
end $$;
revoke execute on function public.compounds_move_units() from public, anon, authenticated;
drop trigger if exists compounds_move_units on public.compounds;
create trigger compounds_move_units after update of lat, lng on public.compounds for each row execute function public.compounds_move_units();

-- 1) Compound details. developer_id null = run by Value Aqar (developer_name shows who the developer is).
alter table public.compounds
  add column if not exists developer_id uuid references public.brokers(id) on delete set null,
  add column if not exists developer_name text check (developer_name is null or char_length(developer_name) <= 150),
  add column if not exists city text check (city is null or char_length(city) <= 100),
  add column if not exists area text check (area is null or char_length(area) <= 100),
  add column if not exists images text[] not null default '{}' check (cardinality(images) <= 12),
  add column if not exists payment_plans text check (payment_plans is null or char_length(payment_plans) <= 2000),
  add column if not exists down_payment_pct numeric check (down_payment_pct is null or down_payment_pct between 0 and 100),
  add column if not exists installment_years integer check (installment_years is null or installment_years between 0 and 30),
  add column if not exists delivery_date text check (delivery_date is null or char_length(delivery_date) <= 100),
  add column if not exists delivery_year integer check (delivery_year is null or delivery_year between 2000 and 2100),
  add column if not exists amenities text[] not null default '{}' check (cardinality(amenities) <= 30),
  add column if not exists review_status public.review_status not null default 'approved',
  add column if not exists review_note text check (review_note is null or char_length(review_note) <= 500),
  add column if not exists is_featured boolean not null default false,
  add column if not exists created_by uuid,
  add column if not exists handed_over_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists compounds_developer_idx on public.compounds (developer_id);

-- 2) Malls can belong to a developer (set by the admin).
alter table public.malls add column if not exists developer_id uuid references public.brokers(id) on delete set null;
create index if not exists malls_developer_idx on public.malls (developer_id);

-- 3) Team assigned to a compound: the developer's team members, or Value Aqar staff while Value Aqar runs it.
create table if not exists public.compound_members (
  id uuid primary key default gen_random_uuid(),
  compound_id uuid not null references public.compounds(id) on delete cascade,
  member_id uuid references public.company_members(id) on delete cascade,
  staff_user_id uuid,
  role text not null default 'sales' check (role in ('manager','sales')),
  added_by uuid,
  created_at timestamptz not null default now(),
  constraint compound_members_one_person check ((member_id is null) <> (staff_user_id is null)),
  unique (compound_id, member_id),
  unique (compound_id, staff_user_id)
);
create index if not exists compound_members_member_idx on public.compound_members (member_id);
create index if not exists compound_members_staff_idx on public.compound_members (staff_user_id);
grant select, insert, update, delete on public.compound_members to authenticated;
grant all on public.compound_members to service_role;
alter table public.compound_members enable row level security;

-- 4) Who am I in this compound? admin / owner / manager / sales, or null.
--    The developer's account holder and company managers run every compound of the developer;
--    other team members only the compounds they are assigned to.
create or replace function public.compound_role(_compound uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when public.has_role(auth.uid(), 'admin') then 'admin'
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
revoke execute on function public.compound_role(uuid) from public, anon;
grant execute on function public.compound_role(uuid) to authenticated;

-- Edits the compound and its units.
create or replace function public.can_edit_compound(_compound uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.compound_role(_compound) in ('admin','owner','manager'), false)
$$;
revoke execute on function public.can_edit_compound(uuid) from public, anon;
grant execute on function public.can_edit_compound(uuid) to authenticated;

-- Assigns the team: the admin, or the developer's account holder and company managers.
create or replace function public.can_staff_compound(_compound uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin')
    or exists (select 1 from public.compounds c where c.id = _compound and c.developer_id is not null and c.developer_id = public.current_developer_id())
$$;
revoke execute on function public.can_staff_compound(uuid) from public, anon;
grant execute on function public.can_staff_compound(uuid) to authenticated;

-- Compounds the signed-in user works on, with their role (for the dashboard list).
create or replace function public.my_compounds()
returns table (compound_id uuid, role text)
language sql stable security definer set search_path = public as $$
  select c.id, public.compound_role(c.id) from public.compounds c
  where public.compound_role(c.id) is not null
$$;
revoke execute on function public.my_compounds() from public, anon;
grant execute on function public.my_compounds() to authenticated;

-- 5) Compound policies (Lovable's version was readable by everyone, including hidden ones).
drop policy if exists "compounds public read" on public.compounds;
drop policy if exists "admin manages compounds" on public.compounds;
drop policy if exists "visible compounds public" on public.compounds;
drop policy if exists "compound team reads" on public.compounds;
drop policy if exists "developer adds compounds" on public.compounds;
drop policy if exists "compound editors update" on public.compounds;
drop policy if exists "developer owner deletes compounds" on public.compounds;
create policy "visible compounds public" on public.compounds for select to anon, authenticated
  using (is_active and review_status = 'approved'
    and (developer_id is null or exists (select 1 from public.brokers b where b.id = developer_id and b.is_active and b.suspended_at is null)));
create policy "compound team reads" on public.compounds for select to authenticated
  using (public.compound_role(id) is not null);
create policy "developer adds compounds" on public.compounds for insert to authenticated
  with check (developer_id is not null and developer_id = public.current_developer_id());
create policy "compound editors update" on public.compounds for update to authenticated
  using (public.can_edit_compound(id)) with check (public.can_edit_compound(id));
create policy "developer owner deletes compounds" on public.compounds for delete to authenticated
  using (developer_id is not null and developer_id = public.current_developer_id() and public.current_member_role() = 'owner');
create policy "admin manages compounds" on public.compounds for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Only the admin changes owner, review and featuring. A compound the admin hid goes back to review when edited.
create or replace function public.compounds_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare privileged boolean := public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null;
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if not privileged then
      new.review_status := 'approved'; new.review_note := null; new.is_featured := false; new.handed_over_at := null;
    end if;
  else
    new.created_by := old.created_by;
    if not privileged then
      new.developer_id := old.developer_id;
      new.review_status := case when old.review_status = 'rejected' then 'pending' else old.review_status end;
      new.review_note := old.review_note;
      new.is_featured := old.is_featured;
      new.sort_order := old.sort_order;
      new.handed_over_at := old.handed_over_at;
    elsif new.developer_id is distinct from old.developer_id and new.developer_id is not null then
      new.handed_over_at := now();
    end if;
  end if;
  if new.developer_id is not null and not exists (select 1 from public.brokers b where b.id = new.developer_id and b.account_type = 'developer') then
    raise exception 'الكمبوند لازم يتربط بحساب مطور' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.compounds_guard() from public, anon, authenticated;
drop trigger if exists compounds_guard on public.compounds;
create trigger compounds_guard before insert or update on public.compounds for each row execute function public.compounds_guard();

-- 6) Units inside a compound.
create table if not exists public.compound_units (
  id uuid primary key default gen_random_uuid(),
  compound_id uuid not null references public.compounds(id) on delete cascade,
  code text check (code is null or char_length(code) <= 50),
  building text check (building is null or char_length(building) <= 50),
  floor text check (floor is null or char_length(floor) <= 50),
  unit_type text not null check (char_length(unit_type) between 2 and 50),
  size numeric not null default 0 check (size >= 0),
  rooms integer check (rooms is null or rooms between 0 and 50),
  baths integer check (baths is null or baths between 0 and 50),
  price numeric check (price is null or price >= 0),
  finishing text check (finishing is null or char_length(finishing) <= 50),
  status text not null default 'available' check (status in ('available','reserved','sold','unavailable')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (compound_id, code)
);
create index if not exists compound_units_compound_idx on public.compound_units (compound_id);
grant select on public.compound_units to anon, authenticated;
grant insert, update, delete on public.compound_units to authenticated;
grant all on public.compound_units to service_role;
alter table public.compound_units enable row level security;

drop policy if exists "units of visible compounds" on public.compound_units;
drop policy if exists "compound editors add units" on public.compound_units;
drop policy if exists "compound team updates units" on public.compound_units;
drop policy if exists "compound editors delete units" on public.compound_units;
-- Visible when the compound is visible to the reader (public compounds, or the reader's own compounds).
create policy "units of visible compounds" on public.compound_units for select to anon, authenticated
  using (exists (select 1 from public.compounds c where c.id = compound_id));
create policy "compound editors add units" on public.compound_units for insert to authenticated
  with check (public.can_edit_compound(compound_id));
-- Sales on the compound may update a unit, but only its status and notes (see the guard).
create policy "compound team updates units" on public.compound_units for update to authenticated
  using (public.compound_role(compound_id) is not null) with check (public.compound_role(compound_id) is not null);
create policy "compound editors delete units" on public.compound_units for delete to authenticated
  using (public.can_edit_compound(compound_id));

create or replace function public.compound_units_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.compound_id := old.compound_id;
    if not (public.can_edit_compound(old.compound_id) or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null) then
      new := jsonb_populate_record(old, jsonb_build_object('status', new.status, 'notes', new.notes));
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.compound_units_guard() from public, anon, authenticated;
drop trigger if exists compound_units_guard on public.compound_units;
create trigger compound_units_guard before insert or update on public.compound_units for each row execute function public.compound_units_guard();

-- 7) Activity log of the compound (readable by its team; written only by triggers).
create table if not exists public.compound_activity (
  id bigint generated always as identity primary key,
  compound_id uuid not null references public.compounds(id) on delete cascade,
  unit_id uuid,
  actor uuid,
  actor_label text,
  kind text not null check (kind in ('created','details','unit_added','unit_removed','unit_status','unit_price','team','handover','lead')),
  summary text not null check (char_length(summary) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists compound_activity_compound_idx on public.compound_activity (compound_id, created_at desc);
revoke all on public.compound_activity from anon, authenticated;
grant select on public.compound_activity to authenticated;
grant all on public.compound_activity to service_role;
alter table public.compound_activity enable row level security;
drop policy if exists "compound team reads activity" on public.compound_activity;
create policy "compound team reads activity" on public.compound_activity for select to authenticated
  using (public.compound_role(compound_id) is not null);

create or replace function public.log_compound(_compound uuid, _unit uuid, _kind text, _summary text)
returns void language sql security definer set search_path = public as $$
  insert into public.compound_activity (compound_id, unit_id, actor, actor_label, kind, summary)
  values (_compound, _unit, auth.uid(), public.actor_label(), _kind, left(_summary, 500))
$$;
revoke execute on function public.log_compound(uuid, uuid, text, text) from public, anon, authenticated;

-- Everyone who should hear about the compound: the developer (account holder + company managers),
-- the compound managers, and Value Aqar staff/admins while Value Aqar runs it.
create or replace function public.notify_compound(_compound uuid, _type text, _title text, _msg text, _url text, _include_sales boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare c public.compounds; uid uuid;
begin
  select * into c from public.compounds where id = _compound;
  if c.id is null then return; end if;
  if c.developer_id is null then
    perform public.notify_team('admin', _title, _msg, _compound, _url);
  else
    perform public.notify_company(c.developer_id, _type, _title, _msg, _compound, _url);
  end if;
  for uid in
    select coalesce(m.staff_user_id, public.member_user_id(m.member_id)) from public.compound_members m
    where m.compound_id = _compound and (m.role = 'manager' or _include_sales)
      and (c.developer_id is not null or m.staff_user_id is not null)
  loop
    if uid is not null and uid is distinct from auth.uid() and not exists (
      select 1 from public.notifications n where n.user_id = uid and n.related_id = _compound and n.title = _title and n.created_at > now() - interval '5 seconds')
    then
      perform public.notify_user(uid, _type, _title, _msg, _compound, _url);
    end if;
  end loop;
end $$;
revoke execute on function public.notify_compound(uuid, text, text, text, text, boolean) from public, anon, authenticated;

create or replace function public.unit_label(_u public.compound_units)
returns text language sql immutable as $$
  select _u.unit_type || coalesce(' ' || _u.code, '') || coalesce(' — عمارة ' || _u.building, '')
$$;

create or replace function public.compound_units_track()
returns trigger language plpgsql security definer set search_path = public as $$
declare cname text; status_ar jsonb := '{"available":"متاحة","reserved":"محجوزة","sold":"مباعة","unavailable":"غير متاحة"}';
begin
  select name into cname from public.compounds where id = coalesce(new.compound_id, old.compound_id);
  if cname is null then return null; end if;  -- compound being deleted
  if tg_op = 'INSERT' then
    perform public.log_compound(new.compound_id, new.id, 'unit_added', 'إضافة وحدة: ' || public.unit_label(new));
  elsif tg_op = 'DELETE' then
    perform public.log_compound(old.compound_id, old.id, 'unit_removed', 'حذف وحدة: ' || public.unit_label(old));
  else
    if new.status is distinct from old.status then
      perform public.log_compound(new.compound_id, new.id, 'unit_status',
        public.unit_label(new) || ': ' || coalesce(status_ar->>old.status, old.status) || ' ← ' || coalesce(status_ar->>new.status, new.status));
      if new.status in ('reserved','sold') then
        perform public.notify_compound(new.compound_id, 'request_status',
          case when new.status = 'sold' then 'وحدة اتباعت في ' else 'وحدة اتحجزت في ' end || cname,
          public.unit_label(new) || coalesce(' — ' || to_char(new.price, 'FM999,999,999,999') || ' ج.م', ''),
          '/my-compounds/' || new.compound_id, true);
      end if;
    end if;
    if new.price is distinct from old.price then
      perform public.log_compound(new.compound_id, new.id, 'unit_price',
        public.unit_label(new) || ': السعر ' || coalesce(to_char(old.price, 'FM999,999,999,999'), '—') || ' ← ' || coalesce(to_char(new.price, 'FM999,999,999,999'), '—'));
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.compound_units_track() from public, anon, authenticated;
drop trigger if exists compound_units_track on public.compound_units;
create trigger compound_units_track after insert or update or delete on public.compound_units for each row execute function public.compound_units_track();

-- New compound, edits, and handover to the developer.
create or replace function public.compounds_track()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_compound(new.id, null, 'created', 'إنشاء الكمبوند' || coalesce(' — ' || (select name from public.brokers where id = new.developer_id), ' — تديره فاليو عقار'));
    if new.developer_id is not null and not public.has_role(auth.uid(), 'admin') then
      perform public.notify_team('admin', 'كمبوند جديد', new.name || ' — ' || coalesce((select name from public.brokers where id = new.developer_id), ''), new.id, '/compounds/' || new.id);
    end if;
    return new;
  end if;
  if new.developer_id is distinct from old.developer_id then
    -- The old team belonged to the old owner.
    delete from public.compound_members where compound_id = new.id;
    perform public.log_compound(new.id, null, 'handover',
      case when new.developer_id is null then 'الكمبوند رجع لإدارة فاليو عقار'
           else 'تسليم الكمبوند لحساب المطور: ' || coalesce((select name from public.brokers where id = new.developer_id), '') end);
    if new.developer_id is not null then
      perform public.notify_company(new.developer_id, 'request_status', 'الكمبوند بقى في حسابك',
        new.name || ' — تقدر تديره وتوزّع فريقك عليه من «كمبونداتي».', new.id, '/my-compounds/' || new.id);
    end if;
  elsif (new.name, new.description, new.city, new.area, new.payment_plans, new.down_payment_pct, new.installment_years,
         new.delivery_date, new.delivery_year, new.amenities, new.images, new.logo_url, new.location, new.lat, new.lng, new.developer_name)
     is distinct from
        (old.name, old.description, old.city, old.area, old.payment_plans, old.down_payment_pct, old.installment_years,
         old.delivery_date, old.delivery_year, old.amenities, old.images, old.logo_url, old.location, old.lat, old.lng, old.developer_name) then
    perform public.log_compound(new.id, null, 'details', 'تعديل بيانات الكمبوند');
  end if;
  if new.review_status is distinct from old.review_status or new.is_active is distinct from old.is_active then
    perform public.log_compound(new.id, null, 'details',
      case when new.is_active and new.review_status = 'approved' then 'الكمبوند ظاهر على الموقع'
           when new.review_status = 'rejected' then 'الإدارة خفت الكمبوند' || coalesce(': ' || new.review_note, '')
           when new.review_status = 'pending' then 'الكمبوند رجع للمراجعة'
           else 'الكمبوند مخفي من الموقع' end);
    if new.review_status = 'rejected' and old.review_status is distinct from 'rejected' and new.developer_id is not null then
      perform public.notify_company(new.developer_id, 'request_status', 'الإدارة خفت كمبوند', new.name || coalesce(' — ' || new.review_note, ''), new.id, '/my-compounds/' || new.id);
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.compounds_track() from public, anon, authenticated;
drop trigger if exists compounds_track on public.compounds;
create trigger compounds_track after insert or update on public.compounds for each row execute function public.compounds_track();

-- 8) Team assignment rules and notifications.
drop policy if exists "compound team reads members" on public.compound_members;
drop policy if exists "compound staffers manage members" on public.compound_members;
create policy "compound team reads members" on public.compound_members for select to authenticated
  using (public.compound_role(compound_id) is not null);
create policy "compound staffers manage members" on public.compound_members for all to authenticated
  using (public.can_staff_compound(compound_id)) with check (public.can_staff_compound(compound_id));

create or replace function public.compound_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare dev uuid;
begin
  select developer_id into dev from public.compounds where id = new.compound_id;
  if tg_op = 'UPDATE' then
    new.compound_id := old.compound_id; new.member_id := old.member_id; new.staff_user_id := old.staff_user_id; new.added_by := old.added_by;
  else
    new.added_by := auth.uid();
  end if;
  if new.member_id is not null and (dev is null or not exists (
      select 1 from public.company_members m where m.id = new.member_id and m.company_id = dev and m.is_active)) then
    raise exception 'العضو ده مش من فريق المطور صاحب الكمبوند' using errcode = 'P0001';
  end if;
  if new.staff_user_id is not null and (dev is not null or not exists (
      select 1 from public.user_roles r where r.user_id = new.staff_user_id and r.role::text in ('staff','admin'))) then
    raise exception 'موظفين فاليو عقار بيتعينوا بس على الكمبوندات اللي فاليو عقار بتديرها' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.compound_members_guard() from public, anon, authenticated;
drop trigger if exists compound_members_guard on public.compound_members;
create trigger compound_members_guard before insert or update on public.compound_members for each row execute function public.compound_members_guard();

create or replace function public.compound_members_track()
returns trigger language plpgsql security definer set search_path = public as $$
declare cname text; who text; uid uuid; role_ar text; r public.compound_members;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  role_ar := case when r.role = 'manager' then 'مدير كمبوند' else 'مبيعات' end;
  select name into cname from public.compounds where id = r.compound_id;
  if cname is null then return r; end if;  -- compound being deleted
  who := coalesce((select name from public.company_members where id = r.member_id),
                  (select coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), '+' || u.phone, 'موظف') from auth.users u where u.id = r.staff_user_id),
                  'عضو');
  uid := coalesce(r.staff_user_id, public.member_user_id(r.member_id));
  if tg_op = 'INSERT' then
    perform public.log_compound(r.compound_id, null, 'team', 'تعيين ' || who || ' (' || role_ar || ')');
    if uid is not null and uid is distinct from auth.uid() then
      perform public.notify_user(uid, 'request_status', 'اتعينت على كمبوند', cname || ' — ' || role_ar, r.compound_id, '/my-compounds/' || r.compound_id);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.log_compound(r.compound_id, null, 'team', 'شيل ' || who || ' من فريق الكمبوند');
  elsif new.role is distinct from old.role then
    perform public.log_compound(r.compound_id, null, 'team', who || ' بقى ' || role_ar);
  end if;
  return r;
end $$;
revoke execute on function public.compound_members_track() from public, anon, authenticated;
drop trigger if exists compound_members_track on public.compound_members;
create trigger compound_members_track after insert or update or delete on public.compound_members for each row execute function public.compound_members_track();

-- 9) Leads linked to a compound and unit (inquiries from the compound page go to Value Aqar like any request).
alter table public.leads
  add column if not exists compound_id uuid references public.compounds(id) on delete set null,
  add column if not exists compound_unit_id uuid references public.compound_units(id) on delete set null;
create index if not exists leads_compound_idx on public.leads (compound_id);

create or replace function public.leads_compound_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare privileged boolean := public.has_role(auth.uid(), 'admin') or public.is_staff() or coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'UPDATE' and not privileged then
    new.compound_id := old.compound_id; new.compound_unit_id := old.compound_unit_id;
    return new;
  end if;
  if new.compound_unit_id is not null then
    select u.compound_id into new.compound_id from public.compound_units u where u.id = new.compound_unit_id;
  end if;
  -- Public forms may only point at published compounds.
  if new.compound_id is not null and not privileged and not exists (
      select 1 from public.compounds c where c.id = new.compound_id and c.is_active and c.review_status = 'approved') then
    new.compound_id := null; new.compound_unit_id := null;
  end if;
  return new;
end $$;
revoke execute on function public.leads_compound_link() from public, anon, authenticated;
drop trigger if exists leads_compound_link on public.leads;
create trigger leads_compound_link before insert or update of compound_id, compound_unit_id on public.leads
  for each row execute function public.leads_compound_link();

-- The compound team hears about requests on its compound: Value Aqar staff on the compound when it comes in;
-- the developer's compound team once the request is handed to the developer.
create or replace function public.notify_compound_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.compounds; uid uuid; msg text;
begin
  if new.compound_id is null then return new; end if;
  select * into c from public.compounds where id = new.compound_id;
  if c.id is null then return new; end if;
  msg := c.name || ' — ' || new.name || coalesce(' — ' || new.property_type, '');
  if tg_op = 'INSERT' then
    perform public.log_compound(c.id, new.compound_unit_id, 'lead', 'طلب جديد VA-' || lpad(new.lead_no::text, 6, '0'));
  end if;
  if c.developer_id is null then
    if tg_op = 'INSERT' then
      for uid in select m.staff_user_id from public.compound_members m where m.compound_id = c.id and m.staff_user_id is not null loop
        if uid is distinct from auth.uid() then
          perform public.notify_user(uid, 'new_request', 'طلب جديد على كمبوند', msg, new.id, '/leads/' || new.id);
        end if;
      end loop;
    end if;
  elsif new.assigned_broker_id = c.developer_id and (tg_op = 'INSERT' or old.assigned_broker_id is distinct from new.assigned_broker_id) then
    perform public.log_compound(c.id, new.compound_unit_id, 'lead', 'طلب VA-' || lpad(new.lead_no::text, 6, '0') || ' وصل للمطور');
    for uid in select public.member_user_id(m.member_id) from public.compound_members m where m.compound_id = c.id and m.role = 'manager' and m.member_id is not null loop
      if uid is not null and uid is distinct from auth.uid() then
        perform public.notify_user(uid, 'new_request', 'طلب جديد على كمبوند', msg, new.id, '/leads/' || new.id);
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke execute on function public.notify_compound_lead() from public, anon, authenticated;
drop trigger if exists notify_compound_lead on public.leads;
create trigger notify_compound_lead after insert or update of assigned_broker_id on public.leads
  for each row execute function public.notify_compound_lead();

-- Compound managers (assigned to the compound) follow every request of their compound handed to the developer.
drop policy if exists "compound managers read compound leads" on public.leads;
create policy "compound managers read compound leads" on public.leads for select to authenticated
  using (compound_id is not null and assigned_broker_id = public.current_broker_id() and public.compound_role(compound_id) = 'manager');

-- 10) Admin audit log for the new tables too.
do $$
declare t text;
begin
  foreach t in array array['compounds','compound_units','compound_members','malls'] loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

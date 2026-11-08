-- Shared housing (release 52): units by bed or room, booking requests through the platform, residents and their monthly rent.
-- Visitors never read the tables directly: shared_units_public() returns the safe columns, without the owner's contacts.
-- Re-runnable.

create table if not exists public.shared_units (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  kind text not null default 'bed' check (kind in ('bed','room','group')),
  gender text not null check (gender in ('men','women')),
  area text check (area is null or char_length(area) <= 100),
  near text check (near is null or char_length(near) <= 120),
  address text check (address is null or char_length(address) <= 300),
  description text check (description is null or char_length(description) <= 2000),
  monthly_price numeric not null check (monthly_price >= 0),
  total_places integer not null default 1 check (total_places between 1 and 500),
  photos text[] not null default '{}' check (cardinality(photos) <= 12),
  owner_name text check (owner_name is null or char_length(owner_name) <= 100),
  owner_phone text check (owner_phone is null or char_length(owner_phone) <= 20),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_requests (
  id uuid primary key default gen_random_uuid(),
  request_no bigint generated always as identity,
  unit_id uuid references public.shared_units(id) on delete set null,
  who text not null default 'worker' check (who in ('worker','student','company','owner')),
  gender text check (gender is null or gender in ('men','women')),
  name text not null check (char_length(name) between 2 and 100),
  phone text not null check (char_length(phone) between 8 and 20),
  people integer check (people is null or people between 1 and 500),
  near text check (near is null or char_length(near) <= 120),
  budget numeric check (budget is null or budget >= 0),
  stage text not null default 'new' check (stage in ('new','contacted','viewing','reserved','moved_in','left','cancelled')),
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 2000),
  customer_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shared_requests_stage on public.shared_requests (stage, created_at desc);

create table if not exists public.shared_residents (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.shared_units(id) on delete restrict,
  request_id uuid references public.shared_requests(id) on delete set null,
  name text not null check (char_length(name) between 2 and 100),
  phone text check (phone is null or char_length(phone) <= 20),
  place_label text check (place_label is null or char_length(place_label) <= 40),
  monthly_rent numeric not null check (monthly_rent >= 0),
  starts_on date not null default current_date,
  paid_until date,
  left_on date,
  created_at timestamptz not null default now()
);
create index if not exists shared_residents_unit on public.shared_residents (unit_id) where left_on is null;

create table if not exists public.shared_rent_payments (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.shared_residents(id) on delete cascade,
  months integer not null check (months between 1 and 24),
  amount numeric not null check (amount >= 0),
  method text check (method is null or char_length(method) <= 30),
  paid_until date not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists shared_rent_payments_resident on public.shared_rent_payments (resident_id, created_at desc);

alter table public.shared_units enable row level security;
alter table public.shared_requests enable row level security;
alter table public.shared_residents enable row level security;
alter table public.shared_rent_payments enable row level security;
grant select, insert, update, delete on public.shared_units, public.shared_requests, public.shared_residents to authenticated;
grant select on public.shared_rent_payments to authenticated;
grant insert on public.shared_requests to anon;
grant all on public.shared_units, public.shared_requests, public.shared_residents, public.shared_rent_payments to service_role;

do $$
declare t text;
begin
  foreach t in array array['shared_units','shared_requests','shared_residents','shared_rent_payments'] loop
    execute format('drop policy if exists %I on public.%I', 'staff reads (shared)', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.staff_can(''shared'', ''view''))', 'staff reads (shared)', t);
  end loop;
  foreach t in array array['shared_units','shared_requests','shared_residents'] loop
    execute format('drop policy if exists %I on public.%I', 'staff edits (shared)', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.staff_can(''shared'', ''edit'')) with check (public.staff_can(''shared'', ''edit''))', 'staff edits (shared)', t);
  end loop;
end $$;
drop policy if exists "anyone asks for shared housing" on public.shared_requests;
create policy "anyone asks for shared housing" on public.shared_requests for insert to anon, authenticated with check (stage = 'new' and admin_notes is null);
drop policy if exists "customer reads own shared request" on public.shared_requests;
create policy "customer reads own shared request" on public.shared_requests for select to authenticated using (customer_id = auth.uid());

-- Visitors' rows start clean and are tied to the signed-in account; every new request and stage change is announced.
create or replace function public.shared_requests_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.phone := coalesce(public.normalize_phone(new.phone), new.phone);
  if tg_op = 'INSERT' and not public.staff_can('shared', 'edit') then
    new.stage := 'new'; new.admin_notes := null; new.customer_id := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.shared_requests_guard() from public, anon, authenticated;
drop trigger if exists shared_requests_guard on public.shared_requests;
create trigger shared_requests_guard before insert or update on public.shared_requests for each row execute function public.shared_requests_guard();

create or replace function public.notify_shared_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare cust uuid; no text := 'H-' || lpad(new.request_no::text, 6, '0'); title text;
begin
  if tg_op = 'INSERT' then
    perform public.notify_team('admin', 'طلب سكن مشترك جديد', no || ' — ' || new.name, new.id, '/admin?tab=shared_requests');
    return null;
  end if;
  if new.stage is distinct from old.stage then
    cust := coalesce(new.customer_id, public.phone_user_id(new.phone));
    title := case new.stage when 'contacted' then 'فاليو عقار بتتابع طلب السكن' when 'viewing' then 'اتحددت معاينة للسكن' when 'reserved' then 'مكانك في السكن اتحجز ✓' when 'moved_in' then 'أهلًا بيك في السكن' when 'cancelled' then 'طلب السكن اتقفل' end;
    if cust is not null and cust is distinct from auth.uid() and title is not null then
      perform public.notify_user(cust, 'request_status', title, no, new.id, '/my-requests');
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.notify_shared_request() from public, anon, authenticated;
drop trigger if exists notify_shared_request on public.shared_requests;
create trigger notify_shared_request after insert or update on public.shared_requests for each row execute function public.notify_shared_request();

-- What visitors see: no address and no owner, and how many places are free.
create or replace function public.shared_units_public()
returns table (id uuid, title text, kind text, gender text, area text, near text, description text, monthly_price numeric, total_places integer, free_places integer, photos text[])
language sql stable security definer set search_path = public as $$
  select u.id, u.title, u.kind, u.gender, u.area, u.near, u.description, u.monthly_price, u.total_places,
    greatest(u.total_places - (select count(*)::int from public.shared_residents r where r.unit_id = u.id and r.left_on is null), 0), u.photos
  from public.shared_units u where u.is_active order by u.created_at desc limit 200
$$;
revoke execute on function public.shared_units_public() from public;
grant execute on function public.shared_units_public() to anon, authenticated;

-- The customer's own housing requests.
create or replace function public.my_shared_requests()
returns table (id uuid, request_no bigint, stage text, unit_title text, near text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.request_no, r.stage, u.title, r.near, r.created_at
  from public.shared_requests r left join public.shared_units u on u.id = r.unit_id
  where auth.uid() is not null and (r.customer_id = auth.uid() or (public.my_phone() is not null and r.phone = public.my_phone()))
  order by r.created_at desc limit 50
$$;
revoke execute on function public.my_shared_requests() from public, anon;
grant execute on function public.my_shared_requests() to authenticated;

-- A resident pays: the paid-until date moves forward from where it was (or from today if they were behind).
create or replace function public.admin_record_shared_rent(_resident uuid, _months integer, _amount numeric, _method text default null)
returns date language plpgsql security definer set search_path = public as $$
declare r public.shared_residents; base date; until date;
begin
  if not public.staff_can('shared', 'edit') then raise exception 'غير مسموح' using errcode = '42501'; end if;
  if _months is null or _months not between 1 and 24 then raise exception 'عدد الشهور من 1 لـ 24' using errcode = '22023'; end if;
  if _amount is null or _amount < 0 then raise exception 'اكتب المبلغ صح' using errcode = '22023'; end if;
  select * into r from public.shared_residents where id = _resident for update;
  if r.id is null then raise exception 'الساكن مش موجود' using errcode = 'P0001'; end if;
  base := greatest(coalesce(r.paid_until, r.starts_on), r.starts_on);
  if r.paid_until is not null and r.paid_until < current_date - 31 then base := current_date; end if;
  until := (base + make_interval(months => _months))::date;
  update public.shared_residents set paid_until = until where id = _resident;
  insert into public.shared_rent_payments (resident_id, months, amount, method, paid_until) values (_resident, _months, _amount, left(_method, 30), until);
  return until;
end $$;
revoke execute on function public.admin_record_shared_rent(uuid, integer, numeric, text) from public, anon;
grant execute on function public.admin_record_shared_rent(uuid, integer, numeric, text) to authenticated;

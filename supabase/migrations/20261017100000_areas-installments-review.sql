-- Release 25: new areas, installments on sale listings, and review for every listing.
-- * Areas: cities and areas move from the code to public.locations. Anyone listing a unit in a place we don't have
--   yet types it in; the listing keeps that place, and the place waits for the admin (approve / merge / reject).
--   Only approved places show in filters and pickers.
-- * Installments: a sale listing may be cash, installments, or both, with a down payment, years and a monthly amount.
-- * Listing code: every listing gets a short number (VA-1234) for visitors and WhatsApp messages.
-- * Review: a broker's (or company's) new listing waits for the admin, and so does an edit to anything a visitor sees.
-- Independent of releases 20–24; safe to run more than once.

-- 1) Places.
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  city text not null check (char_length(btrim(city)) between 2 and 60),
  -- null = a city without areas (its listings store the city name as the area).
  area text check (area is null or char_length(btrim(area)) between 2 and 60),
  city_en text check (city_en is null or char_length(city_en) <= 60),
  area_en text check (area_en is null or char_length(area_en) <= 60),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  sort integer not null default 1000,
  source text check (source is null or char_length(source) <= 30),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index if not exists locations_key on public.locations (btrim(city), coalesce(btrim(area), ''));
create index if not exists locations_status_idx on public.locations (status);

grant select on public.locations to anon, authenticated;
grant insert, update, delete on public.locations to authenticated;
grant all on public.locations to service_role;
alter table public.locations enable row level security;
drop policy if exists "approved locations public" on public.locations;
create policy "approved locations public" on public.locations for select to anon, authenticated using (status = 'approved');
drop policy if exists "admin manages locations" on public.locations;
create policy "admin manages locations" on public.locations for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- The places that were in the code until now (same order).
insert into public.locations (city, area, city_en, area_en, status, sort, source) values
  ('برج العرب الجديدة', 'الحي الأول', 'New Borg El Arab', '1st District', 'approved', 101, 'seed'),
  ('برج العرب الجديدة', 'الحي الثاني', 'New Borg El Arab', '2nd District', 'approved', 102, 'seed'),
  ('برج العرب الجديدة', 'الحي الثالث', 'New Borg El Arab', '3rd District', 'approved', 103, 'seed'),
  ('برج العرب الجديدة', 'الحي الرابع', 'New Borg El Arab', '4th District', 'approved', 104, 'seed'),
  ('برج العرب الجديدة', 'الحي الخامس', 'New Borg El Arab', '5th District', 'approved', 105, 'seed'),
  ('برج العرب الجديدة', 'الحي السادس', 'New Borg El Arab', '6th District', 'approved', 106, 'seed'),
  ('برج العرب الجديدة', 'الحي السابع', 'New Borg El Arab', '7th District', 'approved', 107, 'seed'),
  ('برج العرب الجديدة', 'الحي الثامن', 'New Borg El Arab', '8th District', 'approved', 108, 'seed'),
  ('برج العرب الجديدة', 'الحي التاسع', 'New Borg El Arab', '9th District', 'approved', 109, 'seed'),
  ('كينج مريوط', null, 'King Mariout', null, 'approved', 200, 'seed'),
  ('مدينة العلمين', 'العلمين الجديدة', 'El Alamein City', 'New Alamein', 'approved', 301, 'seed'),
  ('مدينة العلمين', 'الحي اللاتيني', 'El Alamein City', 'Latin District', 'approved', 302, 'seed'),
  ('مدينة العلمين', 'داون تاون', 'El Alamein City', 'Downtown', 'approved', 303, 'seed'),
  ('مدينة العلمين', 'الأبراج الشاطئية', 'El Alamein City', 'Beach Towers', 'approved', 304, 'seed'),
  ('مدينة العلمين', 'الحي السكني', 'El Alamein City', 'Residential District', 'approved', 305, 'seed'),
  ('الساحل الشمالي', 'سيدي عبد الرحمن', 'North Coast', 'Sidi Abdel Rahman', 'approved', 401, 'seed'),
  ('الساحل الشمالي', 'رأس الحكمة', 'North Coast', 'Ras El Hekma', 'approved', 402, 'seed'),
  ('الساحل الشمالي', 'الضبعة', 'North Coast', 'El Dabaa', 'approved', 403, 'seed'),
  ('الساحل الشمالي', 'مراسي', 'North Coast', 'Marassi', 'approved', 404, 'seed'),
  ('الساحل الشمالي', 'الحمام', 'North Coast', 'El Hammam', 'approved', 405, 'seed'),
  ('الساحل الشمالي', 'العلمين القديمة', 'North Coast', 'Old Alamein', 'approved', 406, 'seed'),
  ('الساحل الشمالي', 'مرسى مطروح', 'North Coast', 'Marsa Matrouh', 'approved', 407, 'seed')
on conflict do nothing;

-- Records a place someone used. Unknown places wait for the admin, who is told once.
create or replace function public.note_location(_city text, _area text, _source text)
returns void language plpgsql security definer set search_path = public as $$
declare c text := btrim(coalesce(_city, '')); a text := nullif(btrim(coalesce(_area, '')), '');
begin
  if char_length(c) < 2 or char_length(c) > 60 then return; end if;
  if a = c then a := null; end if;
  if a is not null and (char_length(a) < 2 or char_length(a) > 60) then return; end if;
  if exists (select 1 from public.locations l where btrim(l.city) = c and coalesce(btrim(l.area), '') = coalesce(a, '')) then return; end if;
  insert into public.locations (city, area, status, source) values (c, a, 'pending', _source) on conflict do nothing;
  if found then
    perform public.notify_admins('admin', 'منطقة جديدة مستنية اعتماد', coalesce(a || '، ', '') || c, null, '/admin?tab=locations');
  end if;
end $$;
revoke execute on function public.note_location(text, text, text) from public, anon, authenticated;

create or replace function public.track_location()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Mall and industrial units are placed by their mall / zone, not by area.
  if coalesce(to_jsonb(new)->>'category', 'residential') <> 'residential' then return new; end if;
  if tg_op = 'INSERT' or new.city is distinct from old.city or new.area is distinct from old.area then
    perform public.note_location(new.city, new.area, tg_table_name);
  end if;
  return new;
end $$;
revoke execute on function public.track_location() from public, anon, authenticated;
drop trigger if exists properties_track_location on public.properties;
create trigger properties_track_location after insert or update of city, area on public.properties for each row execute function public.track_location();
drop trigger if exists compounds_track_location on public.compounds;
create trigger compounds_track_location after insert or update of city, area on public.compounds for each row execute function public.track_location();
drop trigger if exists projects_track_location on public.projects;
create trigger projects_track_location after insert or update of city, area on public.projects for each row execute function public.track_location();

-- Admin: move everything from one place to an approved one (a misspelling, a duplicate), then drop the old place.
create or replace function public.merge_location(_from uuid, _to uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare f public.locations; t public.locations; fa text; ta text; n integer := 0; k integer;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'غير مسموح' using errcode = '42501'; end if;
  select * into f from public.locations where id = _from;
  select * into t from public.locations where id = _to and status = 'approved';
  if f.id is null or t.id is null or f.id = t.id then raise exception 'اختار منطقة معتمدة مختلفة' using errcode = 'P0001'; end if;
  fa := coalesce(f.area, f.city); ta := coalesce(t.area, t.city);
  update public.properties set city = t.city, area = ta where city = f.city and area = fa;
  get diagnostics k = row_count; n := n + k;
  update public.compounds set city = t.city, area = t.area where city = f.city and coalesce(area, city) = fa;
  get diagnostics k = row_count; n := n + k;
  update public.projects set city = t.city, area = ta where city = f.city and area = fa;
  get diagnostics k = row_count; n := n + k;
  -- Areas picked by brokers and service providers (names only).
  if f.area is not null or not exists (select 1 from public.locations x where x.city = f.city and x.id <> f.id) then
    update public.brokers set areas = array_replace(areas, fa, ta) where fa = any(areas);
    update public.service_providers set areas = array_replace(areas, fa, ta) where fa = any(areas);
  end if;
  delete from public.locations where id = f.id;
  return n;
end $$;
revoke execute on function public.merge_location(uuid, uuid) from public, anon;
grant execute on function public.merge_location(uuid, uuid) to authenticated;

-- Places of listings that are already saved (anything typed outside the old list shows up for the admin).
insert into public.locations (city, area, status, source)
select distinct btrim(p.city), nullif(btrim(p.area), btrim(p.city)), 'pending', 'existing'
from public.properties p
where p.category = 'residential' and char_length(btrim(coalesce(p.city, ''))) between 2 and 60 and char_length(btrim(coalesce(p.area, ''))) between 2 and 60
on conflict do nothing;

-- 2) Installments on sale listings.
alter table public.properties add column if not exists payment_method text check (payment_method is null or payment_method in ('cash','installment','both'));
alter table public.properties add column if not exists down_payment numeric check (down_payment is null or down_payment >= 0);
alter table public.properties add column if not exists installment_years smallint check (installment_years is null or installment_years between 1 and 30);
alter table public.properties add column if not exists monthly_installment numeric check (monthly_installment is null or monthly_installment > 0);
alter table public.properties add column if not exists installment_note text check (installment_note is null or char_length(installment_note) <= 500);

create or replace function public.properties_installment_normalize()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status <> 'بيع' then new.payment_method := null; end if;
  if new.payment_method is null or new.payment_method = 'cash' then
    new.down_payment := null; new.installment_years := null; new.monthly_installment := null; new.installment_note := null;
    return new;
  end if;
  if new.installment_years is null then
    raise exception 'اكتب عدد سنين التقسيط' using errcode = 'P0001';
  end if;
  if new.down_payment is not null and new.price > 0 and new.down_payment >= new.price then
    raise exception 'المقدم لازم يكون أقل من السعر' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.properties_installment_normalize() from public, anon, authenticated;
drop trigger if exists properties_installment_normalize on public.properties;
create trigger properties_installment_normalize before insert or update on public.properties for each row execute function public.properties_installment_normalize();

-- A short listing code shown to visitors (VA-1234) and sent in WhatsApp messages. Existing listings get numbers too.
alter table public.properties add column if not exists listing_no bigint generated by default as identity;
create unique index if not exists properties_listing_no_key on public.properties (listing_no);

-- 3) Every listing is reviewed. Runs right after properties_guard (triggers fire in name order), which used to
-- publish brokers' listings at once. A new listing waits; an approved one goes back to review only when something a
-- visitor sees changes (renewals, plan hiding, featuring and co-brokerage shares don't count).
create or replace function public.properties_review_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare skip text[] := array['review_status','review_note','updated_at','created_at','listed_until','listing_notice','hidden_by_plan',
  'is_featured','featured_until','is_highlight','highlight_reason','highlight_yield','highlight_requested_at',
  'verified_at','verified_note','co_broke_share','activity_id'];
begin
  if public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    return new;
  end if;
  if new.review_status = 'draft' then return new; end if;
  if tg_op = 'INSERT' then
    new.review_status := 'pending';
  elsif old.review_status = 'approved' and (to_jsonb(new) - skip) = (to_jsonb(old) - skip) then
    new.review_status := 'approved';
  else
    new.review_status := 'pending';
  end if;
  return new;
end $$;
revoke execute on function public.properties_review_guard() from public, anon, authenticated;
drop trigger if exists properties_guard_review on public.properties;
create trigger properties_guard_review before insert or update on public.properties for each row execute function public.properties_review_guard();

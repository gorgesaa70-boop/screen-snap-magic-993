-- Compounds: residential compounds, mirroring malls — a page per compound with its units inside.
create table public.compounds (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(name) between 2 and 120),
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
create policy "compounds public read" on public.compounds for select to anon, authenticated using (true);
create policy "admin manages compounds" on public.compounds for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

alter table public.properties add column if not exists compound_id uuid references public.compounds(id) on delete set null;
create index if not exists properties_compound_idx on public.properties (compound_id);
grant insert (compound_id), update (compound_id) on public.properties to authenticated;

-- Units inside a compound without their own pin follow the compound pin.
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

-- Moving a compound's pin moves the units that were sitting on the old pin (or had none).
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
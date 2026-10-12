-- Item 43: map locations where they were missing — malls (and the units inside them) and investment
-- opportunities (confidential). Owner listings already have properties.lat/lng; the form now fills them.

-- Malls: a pin per mall; units inside a mall without their own pin follow the mall.
alter table public.malls
  add column if not exists lat double precision check (lat is null or lat between -90 and 90),
  add column if not exists lng double precision check (lng is null or lng between -180 and 180);

create or replace function public.mall_units_take_location()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category = 'mall' and new.mall_id is not null and (new.lat is null or new.lng is null) then
    select m.lat, m.lng into new.lat, new.lng from public.malls m where m.id = new.mall_id and m.lat is not null and m.lng is not null;
  end if;
  return new;
end $$;
revoke execute on function public.mall_units_take_location() from public, anon, authenticated;
drop trigger if exists properties_mall_location on public.properties;
create trigger properties_mall_location before insert or update of mall_id, lat, lng, category on public.properties
  for each row execute function public.mall_units_take_location();

-- Moving a mall's pin moves the units that were sitting on the old pin (or had none).
create or replace function public.malls_move_units()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.lat, new.lng) is distinct from (old.lat, old.lng) and new.lat is not null and new.lng is not null then
    update public.properties set lat = new.lat, lng = new.lng
    where category = 'mall' and mall_id = new.id
      and ((lat is null or lng is null) or (lat = old.lat and lng = old.lng));
  end if;
  return new;
end $$;
revoke execute on function public.malls_move_units() from public, anon, authenticated;
drop trigger if exists malls_move_units on public.malls;
create trigger malls_move_units after update of lat, lng on public.malls for each row execute function public.malls_move_units();

-- Investment opportunities: exact pin is confidential (no public select grant on these columns).
alter table public.investment_opportunities
  add column if not exists lat double precision check (lat is null or lat between -90 and 90),
  add column if not exists lng double precision check (lng is null or lng between -180 and 180);
grant insert (lat, lng) on public.investment_opportunities to authenticated;

-- Same access rule as opportunity_private(): admins / staff, the submitter, investors with an approved request.
create or replace function public.opportunity_location(_id uuid)
returns table (lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  select o.lat, o.lng from public.investment_opportunities o
  where o.id = _id and o.lat is not null and o.lng is not null and (
    public.has_role(auth.uid(), 'admin') or public.is_staff() or o.submitted_by = auth.uid()
    or exists (select 1 from public.investment_requests r where r.opportunity_id = o.id and r.investor_id = auth.uid() and r.status = 'approved'))
$$;
revoke execute on function public.opportunity_location(uuid) from public, anon;
grant execute on function public.opportunity_location(uuid) to authenticated;
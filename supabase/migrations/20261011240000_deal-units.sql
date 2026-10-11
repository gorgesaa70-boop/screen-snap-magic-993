-- Deals can point at a project unit; the unit's status follows the deal
-- (reservation / contract → reserved, approved sale → sold, unit removed from deal → available again).

create or replace function public.deals_unit_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare u public.project_units%rowtype; target text;
begin
  if tg_op = 'UPDATE' and old.project_unit_id is not null and old.project_unit_id is distinct from new.project_unit_id then
    update public.project_units set status = 'available' where id = old.project_unit_id and status = 'reserved';
  end if;
  if new.project_unit_id is null then return new; end if;
  select * into u from public.project_units where id = new.project_unit_id;
  if u.id is null or not exists (select 1 from public.projects p where p.id = u.project_id and p.review_status = 'approved') then
    raise exception 'الوحدة دي مش متاحة على المنصة' using errcode = '23514';
  end if;
  if (tg_op = 'INSERT' or old.project_unit_id is distinct from new.project_unit_id) and u.status in ('sold','unavailable') then
    raise exception 'الوحدة دي % — اختار وحدة تانية', case u.status when 'sold' then 'مباعة' else 'غير متاحة' end using errcode = '23514';
  end if;
  target := case when new.review_status = 'approved' then 'sold'
                 when new.reservation_date is not null or new.contract_date is not null then 'reserved' end;
  if target is not null and u.status is distinct from target and u.status <> 'sold' then
    update public.project_units set status = target where id = u.id;
  end if;
  return new;
end $$;
revoke execute on function public.deals_unit_sync() from public, anon, authenticated;
create trigger deals_unit_sync after insert or update on public.deals for each row execute function public.deals_unit_sync();

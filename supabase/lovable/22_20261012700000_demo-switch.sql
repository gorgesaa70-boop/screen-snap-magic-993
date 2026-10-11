-- Value Aqar — Lovable apply file 22 of 26 (source: supabase/migrations/20261012700000_demo-switch.sql).
-- Apply this whole file as one migration, exactly as written.

-- Item 32: switch the demo brokers and listings off before launch (reversible), and delete them for good later.

alter table public.app_settings add column if not exists show_demo boolean not null default true;

create or replace function public.demo_visible()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select show_demo from public.app_settings where id = 1), true)
$$;
grant execute on function public.demo_visible() to anon, authenticated;

-- The public sees demo rows only while the switch is on; owners, staff and admins keep their own policies.
drop policy if exists "active brokers public" on public.brokers;
create policy "active brokers public" on public.brokers for select to anon, authenticated
  using (is_active and (not is_demo or public.demo_visible()));

drop policy if exists "approved properties public" on public.properties;
create policy "approved properties public" on public.properties for select to anon, authenticated
  using (review_status = 'approved' and (not is_demo or public.demo_visible())
    and (broker_id is null or exists (select 1 from public.brokers b where b.id = broker_id and b.is_active)));

-- Permanent cleanup (admins only): demo listings, and demo broker profiles that no real account uses.
-- Leads that pointed at a demo listing keep their data (property link set to null by the foreign key).
create or replace function public.delete_demo_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare np integer; nb integer;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'غير مصرح لك بهذا الإجراء' using errcode = '42501'; end if;
  delete from public.properties where is_demo;
  get diagnostics np = row_count;
  delete from public.brokers b where b.is_demo and b.user_id is null
    and not exists (select 1 from public.properties p where p.broker_id = b.id)
    and not exists (select 1 from public.leads l where l.assigned_broker_id = b.id);
  get diagnostics nb = row_count;
  update public.app_settings set show_demo = false where id = 1;
  return jsonb_build_object('properties', np, 'brokers', nb);
end $$;
revoke execute on function public.delete_demo_data() from public, anon;
grant execute on function public.delete_demo_data() to authenticated;

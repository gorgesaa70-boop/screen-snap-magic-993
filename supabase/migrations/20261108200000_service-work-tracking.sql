-- Following a service request from start to finish (release 51).
-- * status stays as it was (routing, offers and ratings depend on it); while it is 'assigned', work_stage says how far the work got.
-- * Value Aqar and the provider record the agreed price and the date; admin_notes stay inside Value Aqar.
-- * Every change of stage, provider, price or date is logged.
-- Re-runnable.

alter table public.service_requests
  add column if not exists work_stage text check (work_stage is null or work_stage in ('inspection','working')),
  add column if not exists agreed_price numeric check (agreed_price is null or agreed_price >= 0),
  add column if not exists scheduled_for date,
  add column if not exists admin_notes text check (admin_notes is null or char_length(admin_notes) <= 2000);

create or replace function public.service_work_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare team boolean := public.has_role(auth.uid(), 'admin') or public.is_staff() or coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'INSERT' then
    if not team then new.work_stage := null; new.agreed_price := null; new.scheduled_for := null; new.admin_notes := null; end if;
  elsif not team then
    new.admin_notes := old.admin_notes;
  end if;
  if new.status <> 'assigned' then new.work_stage := null; end if;
  return new;
end $$;
revoke execute on function public.service_work_fields() from public, anon, authenticated;
drop trigger if exists service_work_fields on public.service_requests;
create trigger service_work_fields before insert or update on public.service_requests for each row execute function public.service_work_fields();

create or replace function public.service_stage(_status text, _work text, _offered boolean)
returns text language sql immutable as $$
  select case
    when _status = 'closed' then 'cancelled'
    when _status = 'done' then 'done'
    when _status = 'assigned' then coalesce(_work, 'accepted')
    when _status = 'contacted' or _offered then 'routing'
    else 'new' end
$$;
revoke execute on function public.service_stage(text, text, boolean) from public, anon;
grant execute on function public.service_stage(text, text, boolean) to authenticated;

create table if not exists public.service_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  kind text not null check (kind in ('stage','provider','price','schedule')),
  old_value text,
  new_value text,
  actor_label text not null,
  created_at timestamptz not null default now()
);
create index if not exists service_request_events_request on public.service_request_events (request_id, created_at desc);
alter table public.service_request_events enable row level security;
grant select on public.service_request_events to authenticated;
grant all on public.service_request_events to service_role;
drop policy if exists "team reads service history" on public.service_request_events;
create policy "team reads service history" on public.service_request_events for select to authenticated using (public.staff_can('svc_requests', 'view'));
drop policy if exists "provider reads own service history" on public.service_request_events;
create policy "provider reads own service history" on public.service_request_events for select to authenticated
  using (exists (select 1 from public.service_requests r where r.id = request_id and r.assigned_provider_id = public.my_service_provider_id()));

-- The log, and the customer's notifications for the steps that didn't have one.
create or replace function public.service_work_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text; a text; b text; cust uuid; no text := 'S-' || lpad(new.request_no::text, 6, '0'); pname text;
begin
  who := case
    when auth.uid() is null then 'النظام'
    when public.has_role(auth.uid(), 'admin') or public.is_staff() then 'فاليو عقار'
    when new.assigned_provider_id is not null and new.assigned_provider_id = public.my_service_provider_id() then 'مقدم الخدمة'
    else 'العميل' end;
  a := public.service_stage(old.status, old.work_stage, old.offer_provider_id is not null);
  b := public.service_stage(new.status, new.work_stage, new.offer_provider_id is not null);
  if a is distinct from b then insert into public.service_request_events (request_id, kind, old_value, new_value, actor_label) values (new.id, 'stage', a, b, who); end if;
  if new.assigned_provider_id is distinct from old.assigned_provider_id then
    select name into pname from public.service_providers where id = new.assigned_provider_id;
    insert into public.service_request_events (request_id, kind, new_value, actor_label) values (new.id, 'provider', coalesce(pname, 'من غير مقدم خدمة'), who);
  end if;
  if new.agreed_price is distinct from old.agreed_price then
    insert into public.service_request_events (request_id, kind, old_value, new_value, actor_label) values (new.id, 'price', old.agreed_price::text, new.agreed_price::text, who);
  end if;
  if new.scheduled_for is distinct from old.scheduled_for then
    insert into public.service_request_events (request_id, kind, old_value, new_value, actor_label) values (new.id, 'schedule', old.scheduled_for::text, new.scheduled_for::text, who);
  end if;
  cust := coalesce(new.customer_id, public.phone_user_id(new.phone));
  if cust is not null and cust is distinct from auth.uid() then
    if a is distinct from b and b in ('inspection','working') then
      perform public.notify_user(cust, 'request_status', case b when 'inspection' then 'طلبك في مرحلة المعاينة' else 'بدأ الشغل في طلبك' end, no, new.id, '/my-requests');
    end if;
    if new.scheduled_for is not null and new.scheduled_for is distinct from old.scheduled_for then
      perform public.notify_user(cust, 'request_status', 'اتحدد ميعاد لطلبك', no || ' — ' || to_char(new.scheduled_for, 'YYYY-MM-DD'), new.id, '/my-requests');
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.service_work_log() from public, anon, authenticated;
drop trigger if exists service_work_log on public.service_requests;
create trigger service_work_log after update on public.service_requests for each row execute function public.service_work_log();

-- How far the customer's own requests got (next to my_service_requests, whose columns older clients rely on).
create or replace function public.my_service_work()
returns table (id uuid, work_stage text, scheduled_for date, agreed_price numeric)
language sql stable security definer set search_path = public as $$
  select r.id, r.work_stage, r.scheduled_for, r.agreed_price
  from public.service_requests r
  where auth.uid() is not null and (r.customer_id = auth.uid() or (public.my_phone() is not null and r.phone = public.my_phone()))
$$;
revoke execute on function public.my_service_work() from public, anon;
grant execute on function public.my_service_work() to authenticated;

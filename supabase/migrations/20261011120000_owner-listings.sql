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

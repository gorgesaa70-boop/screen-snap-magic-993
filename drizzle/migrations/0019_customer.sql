-- Items 33–35 (customer experience): "verified" badge, favourites, "notify me" alerts, and "my requests".

-- 34. Verified by the Value Aqar team (on-site check). Only admins set it.
alter table public.properties
  add column if not exists verified_at timestamptz,
  add column if not exists verified_note text check (verified_note is null or char_length(verified_note) <= 160);

create or replace function public.properties_verified_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null) then
    if tg_op = 'INSERT' then
      new.verified_at := null; new.verified_note := null;
    else
      new.verified_at := old.verified_at; new.verified_note := old.verified_note;
    end if;
  elsif new.verified_at is null then
    new.verified_note := null;
  end if;
  return new;
end $$;
revoke execute on function public.properties_verified_guard() from public, anon, authenticated;
drop trigger if exists properties_verified_guard on public.properties;
create trigger properties_verified_guard before insert or update on public.properties
  for each row execute function public.properties_verified_guard();

-- 35a. Favourites: each signed-in user keeps their own list.
create table public.favorites (
  user_id uuid not null default auth.uid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);
grant select, insert, delete on public.favorites to authenticated;
grant all on public.favorites to service_role;
alter table public.favorites enable row level security;
create policy "own favorites" on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 35b. "Notify me when a property like this is listed". Empty filter = any.
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  label text check (label is null or char_length(label) <= 120),
  status text check (status is null or status in ('بيع','إيجار','مصيف')),
  types text[] not null default '{}' check (cardinality(types) <= 12),
  city text check (city is null or char_length(city) <= 60),
  area text check (area is null or char_length(area) <= 60),
  price_min numeric check (price_min is null or price_min >= 0),
  price_max numeric check (price_max is null or price_max >= 0),
  notify boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.saved_searches (user_id);
grant select, insert, update, delete on public.saved_searches to authenticated;
grant all on public.saved_searches to service_role;
alter table public.saved_searches enable row level security;
create policy "own saved searches" on public.saved_searches for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- At most 10 alerts per person (keeps the matching trigger cheap).
create or replace function public.saved_searches_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.saved_searches where user_id = new.user_id) >= 10 then
    raise exception 'وصلت للحد الأقصى (10 تنبيهات). امسح تنبيه قديم الأول.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.saved_searches_limit() from public, anon, authenticated;
create trigger saved_searches_limit before insert on public.saved_searches
  for each row execute function public.saved_searches_limit();

-- A residential listing that becomes public notifies everyone whose alert matches (bell + WhatsApp copy).
create or replace function public.notify_saved_searches()
returns trigger language plpgsql security definer set search_path = public as $$
declare s record; owner uuid;
begin
  if new.review_status = 'approved' and new.category = 'residential' and not new.is_demo
     and (tg_op = 'INSERT' or old.review_status is distinct from 'approved') then
    select b.user_id into owner from public.brokers b where b.id = new.broker_id;
    for s in select distinct ss.user_id from public.saved_searches ss
      where ss.notify and ss.user_id is distinct from owner
        and (ss.status is null or ss.status = new.status)
        and (cardinality(ss.types) = 0 or new.type = any(ss.types))
        and (ss.city is null or ss.city = new.city)
        and (ss.area is null or ss.area = new.area)
        and (ss.price_min is null or new.price >= ss.price_min)
        and (ss.price_max is null or new.price <= ss.price_max) loop
      perform public.notify_user(s.user_id, 'saved_search_match', 'نزل عقار مطابق لبحثك', new.title || ' — ' || new.area, new.id, '/properties/' || new.id);
    end loop;
  end if;
  return new;
end $$;
revoke execute on function public.notify_saved_searches() from public, anon, authenticated;
create trigger properties_notify_saved_searches after insert or update of review_status on public.properties
  for each row execute function public.notify_saved_searches();

-- 35c. "My requests": a signed-in customer's own requests/inquiries, without internal data.
alter table public.leads add column if not exists customer_id uuid;
create index if not exists leads_customer_id_idx on public.leads (customer_id);

-- Set only for public submissions by a signed-in customer (not team, company or admin), and never changed later.
create or replace function public.leads_customer_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.customer_id := case
      when auth.uid() is not null and not public.has_role(auth.uid(), 'admin') and not public.is_staff()
        and public.current_broker_id() is null then auth.uid() end;
  elsif coalesce(auth.role(), '') <> 'service_role' then
    new.customer_id := old.customer_id;
  end if;
  return new;
end $$;
revoke execute on function public.leads_customer_link() from public, anon, authenticated;
create trigger leads_customer_link before insert or update on public.leads
  for each row execute function public.leads_customer_link();

create or replace function public.my_requests()
returns table (id uuid, lead_no bigint, kind text, stage text, purpose text, property_id uuid, property_title text,
  property_type text, area text, budget numeric, details text, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.lead_no, l.kind, l.stage::text, l.purpose, l.property_id, p.title, l.property_type, l.area, l.budget, l.details, l.created_at, l.updated_at
  from public.leads l left join public.properties p on p.id = l.property_id
  where auth.uid() is not null
    and (l.customer_id = auth.uid()
      -- requests sent before signing in, from the phone number the account was verified with
      or (l.customer_id is null and l.phone_norm is not null
          and l.phone_norm = (select public.normalize_phone(u.phone) from auth.users u where u.id = auth.uid() and u.phone is not null and u.phone <> '')))
  order by l.created_at desc
  limit 100
$$;
revoke execute on function public.my_requests() from public, anon;
grant execute on function public.my_requests() to authenticated;

-- The customer hears when their request moves forward (only the steps that matter to them).
create or replace function public.notify_customer_stage()
returns trigger language plpgsql security definer set search_path = public as $$
declare msg text;
begin
  if new.customer_id is null or new.stage::text = old.stage::text or new.customer_id = auth.uid() then return new; end if;
  msg := case new.stage::text
    when 'contacted' then 'فريق فاليو عقار بدأ يتابع طلبك'
    when 'visit_scheduled' then 'اتحدد ميعاد معاينة لطلبك'
    when 'reserved' then 'تم الحجز ✓'
    when 'sold' then case when new.purpose in ('rent','summer') then 'تم الإيجار ✓ مبروك' else 'تم البيع ✓ مبروك' end
  end;
  if msg is not null then
    perform public.notify_user(new.customer_id, 'request_status', msg, 'VA-' || lpad(new.lead_no::text, 6, '0'), new.id, '/my-requests');
  end if;
  return new;
end $$;
revoke execute on function public.notify_customer_stage() from public, anon, authenticated;
create trigger leads_notify_customer after update of stage on public.leads
  for each row execute function public.notify_customer_stage();
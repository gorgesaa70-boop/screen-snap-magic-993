-- Plans for everyone and a real services directory:
-- 1) Listings by plan for everyone: brokers and companies (existing plans) and owners (new owner plans, by phone).
--    A plan sets how many listings can be up at once, how long each stays up, and featured slots. A listing's term
--    starts when it's approved; when it ends the listing is hidden (never deleted) until it's renewed. Listings already
--    up get 30 days from this release, so nothing disappears suddenly.
-- 2) Service-provider plans get limits: requests per month, priority in routing and in the directory, work photos.
-- 3) Service requests are routed automatically: offered to the best matching provider (service, area, plan, rating),
--    who accepts or declines within 2 hours; no reply or a decline moves it to the next one; nobody left → Value Aqar
--    assigns by hand. The customer's name and phone show only after accepting.
-- 4) Public provider profiles: work photos and ratings (only by the customer whose request was done, once per request;
--    the provider may reply once; the admin may hide a review). The directory lists approved providers.
-- Additive only: new tables, new columns and functions. The public listing rule gains "not expired".

-- ───────────────────────── 1) Listing plans ─────────────────────────
alter table public.plans
  add column if not exists audience text not null default 'broker' check (audience in ('broker','owner')),
  add column if not exists listing_days smallint check (listing_days is null or listing_days between 1 and 365),
  add column if not exists features text[] not null default '{}' check (cardinality(features) <= 15),
  add column if not exists sort_order integer not null default 0;

alter table public.properties
  add column if not exists listed_until timestamptz,
  -- 0 none, 1 week-before reminder sent, 2 day-before reminder sent, 3 expiry notice sent.
  add column if not exists listing_notice smallint not null default 0 check (listing_notice between 0 and 3);
create index if not exists properties_listed_until_idx on public.properties (listed_until) where listed_until is not null;

-- Owners on a paid plan (activated by the admin, by phone, until online payment opens).
create table if not exists public.owner_plan_grants (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (char_length(phone) between 8 and 20),
  plan_id uuid not null references public.plans(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active','cancelled')),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists owner_plan_grants_phone_idx on public.owner_plan_grants (phone, ends_at desc);
grant select, insert, update on public.owner_plan_grants to authenticated;
grant all on public.owner_plan_grants to service_role;
alter table public.owner_plan_grants enable row level security;
drop policy if exists "owner reads own plan grants" on public.owner_plan_grants;
drop policy if exists "admin manages owner plan grants" on public.owner_plan_grants;
create policy "owner reads own plan grants" on public.owner_plan_grants for select to authenticated using (phone = public.my_phone());
create policy "admin manages owner plan grants" on public.owner_plan_grants for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- First run only: owner plans, durations, the smaller free plan, and 30 days for listings already up.
do $$
begin
  if not exists (select 1 from public.plans where code = 'owner_free') then
    update public.plans set listing_days = case code when 'pro' then 60 when 'business' then 90 else 30 end,
      sort_order = case code when 'free' then 1 when 'pro' then 2 when 'business' then 3 else 4 end;
    update public.plans set max_properties = 2 where code = 'free';
    update public.plans set features = array['ملف عام في دليل الوسطاء'] where code = 'free' and cardinality(features) = 0;
    update public.plans set features = array['ملف عام في دليل الوسطاء', 'العملاء بيوصلوك على لوحتك ومعاهم إشعار'] where code = 'pro' and cardinality(features) = 0;
    update public.plans set features = array['ملف عام في دليل الوسطاء', 'فريق: مديرين ومبيعات بأرقامهم', 'رفع العقارات من Excel'] where code = 'business' and cardinality(features) = 0;
    insert into public.plans (code, name, audience, max_properties, featured_slots, monthly_price, listing_days, sort_order, features) values
      ('owner_free', 'مالك — مجانية', 'owner', 2, 0, 0, 30, 1, array['بياناتك مش بتظهر للعامة', 'فريق فاليو عقار بيتابع معاك']),
      ('owner_plus', 'مالك — بلس', 'owner', 5, 1, 0, 60, 2, array['بياناتك مش بتظهر للعامة', 'متابعة بأولوية من فريق فاليو عقار']);
    -- Without the triggers: no audit rows, no notifications, updated_at untouched.
    alter table public.properties disable trigger user;
    update public.properties set listed_until = now() + interval '30 days'
    where review_status = 'approved' and listed_until is null and (broker_id is not null or owner_lead_id is not null);
    alter table public.properties enable trigger user;
  end if;
end $$;

-- Owner plans are for owners only; broker accounts can't be put on one (by the admin or a payment).
create or replace function public.brokers_plan_audience()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.plan_id is not null and exists (select 1 from public.plans where id = new.plan_id and audience <> 'broker') then
    raise exception 'دي باقة ملاك، مش للوسطاء والشركات' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.brokers_plan_audience() from public, anon, authenticated;
drop trigger if exists brokers_plan_audience on public.brokers;
create trigger brokers_plan_audience before insert or update of plan_id on public.brokers for each row execute function public.brokers_plan_audience();

create or replace function public.owner_plan_grants_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.phone := coalesce(public.normalize_phone(new.phone), new.phone);
  if not exists (select 1 from public.plans where id = new.plan_id and audience = 'owner') then
    raise exception 'اختار باقة من باقات الملاك' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.owner_plan_grants_guard() from public, anon, authenticated;
drop trigger if exists owner_plan_grants_guard on public.owner_plan_grants;
create trigger owner_plan_grants_guard before insert or update on public.owner_plan_grants for each row execute function public.owner_plan_grants_guard();

-- Sign-in account that uses a phone number (owners and service customers have no other link to an account).
create or replace function public.phone_user_id(_phone text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select u.id from auth.users u where _phone is not null and public.normalize_phone(u.phone) = public.normalize_phone(_phone) limit 1
$$;
revoke execute on function public.phone_user_id(text) from public, anon, authenticated;

-- The plan in force: a broker's plan (none = free), an owner's latest running grant (none = owner_free).
create or replace function public.broker_plan(_broker uuid)
returns public.plans language sql stable security definer set search_path = public as $$
  select pl.* from public.plans pl
  where pl.id = coalesce((select plan_id from public.brokers where id = _broker), (select id from public.plans where code = 'free'))
$$;
revoke execute on function public.broker_plan(uuid) from public, anon, authenticated;

create or replace function public.owner_plan(_phone text)
returns public.plans language sql stable security definer set search_path = public as $$
  select pl.* from public.plans pl
  where pl.id = coalesce(
    (select g.plan_id from public.owner_plan_grants g where g.phone = public.normalize_phone(_phone) and g.status = 'active'
       and g.starts_at <= now() and g.ends_at > now() order by g.ends_at desc limit 1),
    (select id from public.plans where code = 'owner_free'))
$$;
revoke execute on function public.owner_plan(text) from public, anon, authenticated;

-- Listings that count against a plan: approved or waiting for review, not hidden, not expired.
create or replace function public.live_listings_of_broker(_broker uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.properties
  where broker_id = _broker and review_status in ('approved','pending') and not hidden_by_plan and (listed_until is null or listed_until > now())
$$;
revoke execute on function public.live_listings_of_broker(uuid) from public, anon, authenticated;

create or replace function public.live_listings_of_phone(_phone text)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.properties p join public.leads l on l.id = p.owner_lead_id
  where p.broker_id is null and l.phone_norm = public.normalize_phone(_phone)
    and p.review_status in ('approved','pending') and not p.hidden_by_plan and (p.listed_until is null or p.listed_until > now())
$$;
revoke execute on function public.live_listings_of_phone(text) from public, anon, authenticated;

create or replace function public.listing_days_for(_broker uuid, _owner_lead uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when _broker is not null then (select bp.listing_days from public.broker_plan(_broker) bp)::int
    else (select op.listing_days from public.leads l cross join lateral public.owner_plan(l.phone_norm) op where l.id = _owner_lead)::int end
$$;
revoke execute on function public.listing_days_for(uuid, uuid) from public, anon, authenticated;

-- Same rules as before for brokers' own listings; the plan limit now counts live listings only (an expired or
-- hidden listing doesn't block a new one), and a draft sent for publishing is checked too.
create or replace function public.properties_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim integer;
begin
  if public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    new.updated_at := now();
    return new;
  end if;
  if public.current_member_role() in ('sales','broker') then
    raise exception 'صلاحيتك في الشركة لا تسمح بإدارة العقارات' using errcode = '42501';
  end if;
  new.is_featured := coalesce(case when tg_op = 'UPDATE' then old.is_featured end, false);
  new.featured_until := case when tg_op = 'UPDATE' then old.featured_until end;
  new.is_demo := false;
  new.owner_lead_id := case when tg_op = 'UPDATE' then old.owner_lead_id end;
  if new.review_status <> 'draft' then
    if tg_op = 'UPDATE' and old.review_status = 'rejected' then
      new.review_status := 'pending';
    else
      new.review_status := 'approved';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.broker_id := old.broker_id;
    new.review_note := old.review_note;
  end if;
  if new.review_status <> 'draft' and (tg_op = 'INSERT' or old.review_status = 'draft') then
    select bp.max_properties into lim from public.broker_plan(new.broker_id) bp;
    if public.live_listings_of_broker(new.broker_id) >= coalesce(lim, 2) then
      raise exception 'وصلت لحد باقتك (% إعلان ظاهر في نفس الوقت). جدّد أو احذف إعلان قديم، أو اطلب باقة أكبر من «باقتي».', coalesce(lim, 2) using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.properties_guard() from public, anon, authenticated;

-- The listing's term: set on approval from the account's plan; only renew_listing() (or the admin) changes it.
-- Owners: the number of live listings per phone follows the owner plan (checked for everyone but the admin).
create or replace function public.properties_listing_term()
returns trigger language plpgsql security definer set search_path = public as $$
declare privileged boolean := public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null;
  renewing boolean := coalesce(current_setting('va.listing_renew', true), '') = '1';
  days integer; lim integer; ph text;
begin
  if not privileged and not renewing then
    new.listed_until := case when tg_op = 'UPDATE' then old.listed_until end;
    new.listing_notice := case when tg_op = 'UPDATE' then old.listing_notice else 0 end;
  end if;
  if tg_op = 'INSERT' and new.owner_lead_id is not null and new.broker_id is null and not public.has_role(auth.uid(), 'admin') then
    select l.phone_norm into ph from public.leads l where l.id = new.owner_lead_id;
    if ph is not null then
      select op.max_properties into lim from public.owner_plan(ph) op;
      if public.live_listings_of_phone(ph) >= coalesce(lim, 2) then
        raise exception 'plan_limit: وصلت لحد باقتك (% إعلان ظاهر في نفس الوقت)', coalesce(lim, 2) using errcode = 'P0001';
      end if;
    end if;
  end if;
  if new.review_status = 'approved' and (tg_op = 'INSERT' or old.review_status is distinct from 'approved')
     and (new.broker_id is not null or new.owner_lead_id is not null)
     and (new.listed_until is null or new.listed_until <= now()) then
    days := public.listing_days_for(new.broker_id, new.owner_lead_id);
    new.listed_until := case when days is null then null else now() + make_interval(days => days) end;
    new.listing_notice := 0;
  end if;
  return new;
end $$;
revoke execute on function public.properties_listing_term() from public, anon, authenticated;
drop trigger if exists properties_listing_term on public.properties;
create trigger properties_listing_term before insert or update on public.properties for each row execute function public.properties_listing_term();

-- Visitors see approved listings that are not hidden and not expired.
drop policy if exists "approved properties public" on public.properties;
create policy "approved properties public" on public.properties for select to anon, authenticated
  using (review_status = 'approved' and not hidden_by_plan and (listed_until is null or listed_until > now())
    and (not is_demo or public.demo_visible())
    and (broker_id is null or exists (select 1 from public.brokers b where b.id = broker_id and b.is_active)));

-- Renew a listing (its account holder / manager, the owner by phone, or the admin): opens in the last 7 days of the
-- term or after it ended; an ended one comes back only if the plan has room.
create or replace function public.renew_listing(_property uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare p public.properties; ph text; mine boolean; days integer; lim integer; res timestamptz;
begin
  select * into p from public.properties where id = _property;
  if p.id is null then raise exception 'الإعلان مش موجود' using errcode = 'P0001'; end if;
  if p.broker_id is not null then
    mine := p.broker_id = public.current_broker_id() and public.current_member_role() in ('owner','manager');
    select bp.listing_days, bp.max_properties into days, lim from public.broker_plan(p.broker_id) bp;
  else
    select l.phone_norm into ph from public.leads l where l.id = p.owner_lead_id;
    mine := ph is not null and ph = public.my_phone();
    select op.listing_days, op.max_properties into days, lim from public.owner_plan(ph) op;
  end if;
  if not (coalesce(mine, false) or public.has_role(auth.uid(), 'admin')) then
    raise exception 'مش من حقك تجدّد الإعلان ده' using errcode = '42501';
  end if;
  if p.review_status <> 'approved' then raise exception 'الإعلان لازم يكون معتمد عشان يتجدّد' using errcode = 'P0001'; end if;
  if p.hidden_by_plan then raise exception 'الإعلان ده مخفي لحد ما تجدّد باقتك' using errcode = 'P0001'; end if;
  if p.listed_until is null then raise exception 'الإعلان ده ظاهر من غير مدة' using errcode = 'P0001'; end if;
  if p.listed_until > now() + interval '7 days' then
    raise exception 'التجديد بيفتح في آخر أسبوع من مدة الإعلان (بيخلص %)', to_char(p.listed_until at time zone 'Africa/Cairo', 'YYYY-MM-DD') using errcode = 'P0001';
  end if;
  if p.listed_until <= now()
     and (case when p.broker_id is not null then public.live_listings_of_broker(p.broker_id) else public.live_listings_of_phone(ph) end) >= coalesce(lim, 2) then
    raise exception 'وصلت لحد باقتك (% إعلان ظاهر في نفس الوقت). اطلب باقة أكبر من «باقتي»، أو جدّد بعد ما إعلان تاني يخلص.', coalesce(lim, 2) using errcode = 'P0001';
  end if;
  res := case when days is null then null else greatest(now(), p.listed_until) + make_interval(days => days) end;
  perform set_config('va.listing_renew', '1', true);
  update public.properties set listed_until = res, listing_notice = 0 where id = _property;
  perform set_config('va.listing_renew', '', true);
  return res;
end $$;
revoke execute on function public.renew_listing(uuid) from public, anon;
grant execute on function public.renew_listing(uuid) to authenticated;

-- «باقتي»: the plan in force for the signed-in broker account or owner, with what's used.
create or replace function public.my_listing_plan()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b uuid := public.current_broker_id(); ph text := public.my_phone(); pl public.plans; ends timestamptz;
begin
  if b is not null then
    select * into pl from public.broker_plan(b);
    select max(ends_at) into ends from public.subscriptions where broker_id = b and status in ('active','trial') and ends_at > now();
    return jsonb_build_object('audience', 'broker', 'plan_id', pl.id, 'code', pl.code, 'name', pl.name, 'max', pl.max_properties,
      'days', pl.listing_days, 'featured', pl.featured_slots, 'ends_at', ends, 'used', public.live_listings_of_broker(b),
      'featured_used', (select count(*) from public.properties where broker_id = b and is_featured));
  elsif ph is not null then
    select * into pl from public.owner_plan(ph);
    select max(ends_at) into ends from public.owner_plan_grants where phone = ph and status = 'active' and starts_at <= now() and ends_at > now();
    return jsonb_build_object('audience', 'owner', 'plan_id', pl.id, 'code', pl.code, 'name', pl.name, 'max', pl.max_properties,
      'days', pl.listing_days, 'featured', pl.featured_slots, 'ends_at', ends, 'used', public.live_listings_of_phone(ph),
      'total', (select count(*) from public.properties p join public.leads l on l.id = p.owner_lead_id where p.broker_id is null and l.phone_norm = ph));
  end if;
  return null;
end $$;
revoke execute on function public.my_listing_plan() from public, anon;
grant execute on function public.my_listing_plan() to authenticated;

-- An owner's listings (sent from «اعرض عقارك» with the phone they signed in with).
create or replace function public.my_owner_listings()
returns table (id uuid, title text, review_status text, image_url text, price numeric, status text, type text, area text, city text,
  listed_until timestamptz, hidden_by_plan boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.title, p.review_status::text, p.image_url, p.price, p.status, p.type, p.area, p.city, p.listed_until, p.hidden_by_plan, p.created_at
  from public.properties p join public.leads l on l.id = p.owner_lead_id
  where p.broker_id is null and public.my_phone() is not null and l.phone_norm = public.my_phone()
  order by p.created_at desc limit 100
$$;
revoke execute on function public.my_owner_listings() from public, anon;
grant execute on function public.my_owner_listings() to authenticated;

-- Server-side check before an owner sends a new listing.
create or replace function public.owner_listing_quota(_phone text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('used', public.live_listings_of_phone(_phone), 'max', (select op.max_properties from public.owner_plan(_phone) op))
$$;
revoke execute on function public.owner_listing_quota(text) from public, anon, authenticated;
grant execute on function public.owner_listing_quota(text) to service_role;

-- Ask Value Aqar for a listing plan (activated by the admin until online payment opens).
create or replace function public.request_listing_plan(_plan uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare pl public.plans; b uuid := public.current_broker_id(); ph text := public.my_phone(); who text;
begin
  select * into pl from public.plans where id = _plan and is_active;
  if pl.id is null then raise exception 'الباقة مش متاحة' using errcode = 'P0001'; end if;
  if b is not null then
    if public.current_member_role() <> 'owner' then raise exception 'صاحب الحساب بس اللي يطلب باقة' using errcode = '42501'; end if;
    if pl.audience <> 'broker' then raise exception 'دي باقة ملاك' using errcode = 'P0001'; end if;
    select name || coalesce(' — ' || phone, '') into who from public.brokers where id = b;
  elsif ph is not null and pl.audience = 'owner' then
    who := 'مالك — ' || ph;
  else
    raise exception 'الباقة دي مش لحسابك' using errcode = 'P0001';
  end if;
  perform public.notify_team('admin', 'طلب باقة إعلانات — ' || pl.name, who, coalesce(b, auth.uid()), '/admin');
  return true;
end $$;
revoke execute on function public.request_listing_plan(uuid) from public, anon;
grant execute on function public.request_listing_plan(uuid) to authenticated;

-- Scheduled: a week before, a day before and at the end of a listing's term, one notification per account.
create or replace function public.run_listing_expiry()
returns jsonb language plpgsql security definer set search_path = public as $$
declare st integer; ids uuid[]; r record; uid uuid; title text; msg text; counts integer[] := array[0,0,0];
begin
  for st in 1..3 loop
    select coalesce(array_agg(p.id), '{}') into ids from public.properties p
    where p.review_status = 'approved' and p.listed_until is not null and p.listing_notice < st and not p.hidden_by_plan
      and (p.broker_id is not null or p.owner_lead_id is not null)
      and case st when 1 then p.listed_until > now() + interval '1 day' and p.listed_until <= now() + interval '7 days'
                  when 2 then p.listed_until > now() and p.listed_until <= now() + interval '1 day'
                  else p.listed_until <= now() end;
    for r in
      select p.broker_id, case when p.broker_id is null then l.phone_norm end phone, count(*)::int n, min(p.title) t, (array_agg(p.id))[1] pid
      from public.properties p left join public.leads l on l.id = p.owner_lead_id
      where p.id = any(ids) group by 1, 2
    loop
      title := case st when 1 then case when r.n = 1 then 'إعلانك هيخلص خلال أسبوع' else r.n || ' إعلانات هتخلص خلال أسبوع' end
                       when 2 then case when r.n = 1 then 'إعلانك بيخلص بكرة' else r.n || ' إعلانات بتخلص بكرة' end
                       else case when r.n = 1 then 'إعلانك خلص واستخبى' else r.n || ' إعلانات خلصت واستخبت' end end;
      msg := '«' || r.t || '»' || case when r.n > 1 then ' وغيره' else '' end || ' — جدّده من «' || case when r.broker_id is null then 'إعلاناتي' else 'عقاراتي' end || '»';
      if r.broker_id is not null then
        perform public.notify_company(r.broker_id, 'request_status', title, msg, r.pid, '/dashboard');
      else
        uid := public.phone_user_id(r.phone);
        if uid is not null then perform public.notify_user(uid, 'request_status', title, msg, r.pid, '/my-listings'); end if;
      end if;
    end loop;
    update public.properties set listing_notice = st where id = any(ids);
    counts[st] := cardinality(ids);
  end loop;
  return jsonb_build_object('week', counts[1], 'day', counts[2], 'expired', counts[3]);
end $$;
revoke execute on function public.run_listing_expiry() from public, anon, authenticated;
grant execute on function public.run_listing_expiry() to service_role;

-- ───────────────────────── 2) Service plan limits ─────────────────────────
alter table public.service_plans
  add column if not exists monthly_requests integer check (monthly_requests is null or monthly_requests >= 0),
  add column if not exists priority smallint not null default 0 check (priority between 0 and 100),
  add column if not exists max_photos smallint not null default 6 check (max_photos between 0 and 100);
update public.service_plans set monthly_requests = 5 where code = 'free' and monthly_requests is null and priority = 0;
update public.service_plans set monthly_requests = 20, priority = 1, max_photos = 20 where code = 'basic' and priority = 0 and monthly_requests is null;
update public.service_plans set priority = 2, max_photos = 50 where code = 'featured' and priority = 0;
update public.service_plans set features = array['ملف عام في دليل الخدمات بصور شغلك وتقييماتك', 'الطلبات بتوصلك لوحدها حسب تخصصك ومنطقتك']
where code = 'free' and features = array['ملف في دليل الخدمات بعد الاعتماد', 'استقبال الطلبات اللي فاليو عقار بتحولها ليك'];

-- ───────────────────────── 3) Routing service requests ─────────────────────────
alter table public.service_requests
  add column if not exists target_provider_id uuid references public.service_providers(id) on delete set null,
  add column if not exists offer_provider_id uuid references public.service_providers(id) on delete set null,
  add column if not exists offered_at timestamptz,
  add column if not exists offer_expires_at timestamptz,
  add column if not exists declined_provider_ids uuid[] not null default '{}',
  add column if not exists accepted_at timestamptz,
  add column if not exists done_at timestamptz,
  add column if not exists needs_manual boolean not null default false;
create index if not exists service_requests_offer_idx on public.service_requests (offer_provider_id) where offer_provider_id is not null;
create index if not exists service_requests_offer_expiry_idx on public.service_requests (offer_expires_at) where offer_provider_id is not null;

-- Customers choose the provider (from the directory) and ask; only Value Aqar or the routing assigns. Routing updates
-- (va.service_routing) skip these checks; they're made inside the routing functions.
create or replace function public.service_requests_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare team boolean := public.has_role(auth.uid(), 'admin') or public.is_staff() or coalesce(auth.role(), '') = 'service_role';
  routing boolean := coalesce(current_setting('va.service_routing', true), '') = '1';
  tp public.service_providers;
begin
  new.phone := coalesce(public.normalize_phone(new.phone), new.phone);
  if tg_op = 'UPDATE' and routing then
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not team then new.status := 'new'; new.assigned_provider_id := null; new.notes := null; new.customer_id := auth.uid(); end if;
    new.offer_provider_id := null; new.offered_at := null; new.offer_expires_at := null; new.declined_provider_ids := '{}';
    new.accepted_at := null; new.done_at := null; new.needs_manual := false;
    if new.target_provider_id is not null then
      select * into tp from public.service_providers where id = new.target_provider_id;
      if tp.id is null or tp.status <> 'approved' then raise exception 'مقدم الخدمة ده مش متاح دلوقتي' using errcode = 'P0001'; end if;
      new.category := tp.category;
    end if;
  else
    new.created_at := old.created_at; new.request_no := old.request_no;
    new.target_provider_id := old.target_provider_id; new.offer_provider_id := old.offer_provider_id; new.offered_at := old.offered_at;
    new.offer_expires_at := old.offer_expires_at; new.declined_provider_ids := old.declined_provider_ids;
    new.accepted_at := old.accepted_at; new.done_at := old.done_at;
    if not team then
      new.name := old.name; new.phone := old.phone; new.category := old.category; new.details := old.details; new.area := old.area;
      new.assigned_provider_id := old.assigned_provider_id; new.customer_id := old.customer_id; new.source := old.source;
      new.needs_manual := old.needs_manual;
      if new.status not in ('assigned','done','closed') then new.status := old.status; end if;
    end if;
    if new.status = 'done' and old.status is distinct from 'done' then new.done_at := now(); end if;
  end if;
  if new.assigned_provider_id is not null and new.assigned_provider_id is distinct from (case when tg_op = 'UPDATE' then old.assigned_provider_id end) then
    if not exists (select 1 from public.service_providers p where p.id = new.assigned_provider_id and p.status = 'approved' and p.category = new.category) then
      raise exception 'مقدم الخدمة لازم يكون معتمد ومن نفس الخدمة' using errcode = 'P0001';
    end if;
    if new.status in ('new','contacted') then new.status := 'assigned'; end if;
    -- Assigned by hand: any open offer ends.
    new.accepted_at := now(); new.offer_provider_id := null; new.offered_at := null; new.offer_expires_at := null; new.needs_manual := false;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.service_requests_guard() from public, anon, authenticated;

create or replace function public.service_plan_of(_provider uuid)
returns public.service_plans language sql stable security definer set search_path = public as $$
  select sp.* from public.service_plans sp
  where sp.id = coalesce((select plan_id from public.service_providers where id = _provider), (select id from public.service_plans where code = 'free'))
$$;
revoke execute on function public.service_plan_of(uuid) from public, anon, authenticated;

-- Requests a provider took this calendar month (Cairo time).
create or replace function public.service_requests_this_month(_provider uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.service_requests
  where assigned_provider_id = _provider and accepted_at >= (date_trunc('month', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo')
$$;
revoke execute on function public.service_requests_this_month(uuid) from public, anon, authenticated;

-- ───────────────────────── 4) Work photos and ratings ─────────────────────────
create table if not exists public.service_provider_photos (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  url text not null check (url ~ '^https://' and char_length(url) <= 2000),
  caption text check (caption is null or char_length(caption) <= 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists service_provider_photos_provider_idx on public.service_provider_photos (provider_id, sort_order);
grant select, insert, update, delete on public.service_provider_photos to authenticated;
grant all on public.service_provider_photos to service_role;
alter table public.service_provider_photos enable row level security;
drop policy if exists "provider manages own photos" on public.service_provider_photos;
drop policy if exists "admin manages provider photos" on public.service_provider_photos;
create policy "provider manages own photos" on public.service_provider_photos for all to authenticated
  using (provider_id = public.my_service_provider_id()) with check (provider_id = public.my_service_provider_id());
create policy "admin manages provider photos" on public.service_provider_photos for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.service_provider_photos_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim integer;
begin
  if public.has_role(auth.uid(), 'admin') then return new; end if;
  select sp.max_photos into lim from public.service_plan_of(new.provider_id) sp;
  if (select count(*) from public.service_provider_photos where provider_id = new.provider_id) >= coalesce(lim, 6) then
    raise exception 'باقتك بتسمح بـ % صورة. اطلب باقة أكبر من «باقتي» عشان تضيف أكتر.', coalesce(lim, 6) using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.service_provider_photos_limit() from public, anon, authenticated;
drop trigger if exists service_provider_photos_limit on public.service_provider_photos;
create trigger service_provider_photos_limit before insert on public.service_provider_photos for each row execute function public.service_provider_photos_limit();

create table if not exists public.service_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests(id) on delete cascade,
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  customer_name text not null check (char_length(customer_name) between 1 and 60),
  reply text check (reply is null or char_length(reply) <= 1000),
  replied_at timestamptz,
  hidden boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists service_reviews_provider_idx on public.service_reviews (provider_id, created_at desc);
grant select, update, delete on public.service_reviews to authenticated;
grant all on public.service_reviews to service_role;
alter table public.service_reviews enable row level security;
drop policy if exists "provider reads own reviews" on public.service_reviews;
drop policy if exists "staff reads reviews" on public.service_reviews;
drop policy if exists "admin manages reviews" on public.service_reviews;
create policy "provider reads own reviews" on public.service_reviews for select to authenticated using (provider_id = public.my_service_provider_id());
create policy "staff reads reviews" on public.service_reviews for select to authenticated using (public.is_staff());
create policy "admin manages reviews" on public.service_reviews for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.service_provider_rating(_provider uuid, out rating numeric, out reviews integer)
language sql stable security definer set search_path = public as $$
  select round(avg(stars)::numeric, 1), count(*)::int from public.service_reviews where provider_id = _provider and not hidden
$$;
revoke execute on function public.service_provider_rating(uuid) from public, anon, authenticated;

-- ───────────────────────── 3b) Offer / accept / decline ─────────────────────────
-- Offer the request to the best match: approved, same service, works in the area (or everywhere), hasn't declined it,
-- has room in this month's plan limit and can sign in. The provider the customer chose comes first; then plan
-- priority, rating, and fewer open requests. Nobody → Value Aqar assigns by hand.
create or replace function public.offer_service_request(_req uuid, _first boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.service_requests; pick uuid; pname text; uid uuid; no text; msg text;
  cat jsonb := '{"engineering":"مكاتب هندسية","contracting":"مقاولات وتشطيبات","crafts":"صنايعية","media":"تصوير وميديا"}';
begin
  select * into r from public.service_requests where id = _req for update;
  if r.id is null or r.assigned_provider_id is not null or r.status in ('done','closed') then return null; end if;
  select p.id, p.name into pick, pname from public.service_providers p
  cross join lateral public.service_plan_of(p.id) sp
  cross join lateral public.service_provider_rating(p.id) rt
  where p.status = 'approved' and p.category = r.category
    and not (p.id = any(r.declined_provider_ids))
    and (r.area is null or cardinality(p.areas) = 0 or r.area = any(p.areas))
    and (sp.monthly_requests is null or public.service_requests_this_month(p.id) < sp.monthly_requests)
    and public.service_provider_user_id(p.id) is not null
  order by (p.id = r.target_provider_id) desc nulls last, sp.priority desc, rt.rating desc nulls last,
    (select count(*) from public.service_requests x where x.assigned_provider_id = p.id and x.status = 'assigned'), random()
  limit 1;
  no := 'S-' || lpad(r.request_no::text, 6, '0');
  msg := (cat->>r.category) || coalesce(' — ' || r.area, '') || coalesce(' — ' || left(r.details, 120), '');
  perform set_config('va.service_routing', '1', true);
  if pick is null then
    update public.service_requests set offer_provider_id = null, offered_at = null, offer_expires_at = null, needs_manual = true where id = _req;
  else
    update public.service_requests set offer_provider_id = pick, offered_at = now(), offer_expires_at = now() + interval '2 hours', needs_manual = false where id = _req;
  end if;
  perform set_config('va.service_routing', '', true);
  if pick is null then
    perform public.notify_team('admin', case when _first then 'طلب خدمة جديد — ' || (cat->>r.category) else 'طلب خدمة محتاج توزيع يدوي — ' || (cat->>r.category) end,
      no || ' — ' || r.name || coalesce(' — ' || left(r.details, 120), '') || ' — مفيش مقدم خدمة متاح في التخصص والمنطقة، حوّله بإيدك', r.id, '/admin');
    return null;
  end if;
  uid := public.service_provider_user_id(pick);
  if uid is not null and uid is distinct from auth.uid() then
    perform public.notify_user(uid, 'new_request', 'طلب خدمة جديد ليك — رد خلال ساعتين', msg, r.id, '/dashboard');
  end if;
  perform public.notify_team('admin', case when _first then 'طلب خدمة جديد — ' || (cat->>r.category) else 'طلب خدمة اتعرض على ' || pname end,
    no || ' — ' || r.name || coalesce(' — ' || left(r.details, 120), '') || ' — اتعرض على ' || pname, r.id, '/admin');
  return pick;
end $$;
revoke execute on function public.offer_service_request(uuid, boolean) from public, anon, authenticated;

create or replace function public.service_requests_route()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_provider_id is null and new.status = 'new' then perform public.offer_service_request(new.id, true); end if;
  return null;
end $$;
revoke execute on function public.service_requests_route() from public, anon, authenticated;
drop trigger if exists service_requests_route on public.service_requests;
create trigger service_requests_route after insert on public.service_requests for each row execute function public.service_requests_route();

-- Offers nobody answered within 2 hours move on (scheduled, and also checked whenever a provider opens their offers).
create or replace function public.run_service_offers()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; uid uuid;
begin
  for r in select id, request_no, offer_provider_id from public.service_requests
           where offer_provider_id is not null and assigned_provider_id is null and offer_expires_at <= now() for update skip locked loop
    perform set_config('va.service_routing', '1', true);
    update public.service_requests set declined_provider_ids = array_append(declined_provider_ids, r.offer_provider_id),
      offer_provider_id = null, offered_at = null, offer_expires_at = null where id = r.id;
    perform set_config('va.service_routing', '', true);
    uid := public.service_provider_user_id(r.offer_provider_id);
    if uid is not null and uid is distinct from auth.uid() then
      perform public.notify_user(uid, 'request_status', 'طلب خدمة اتحوّل لغيرك', 'S-' || lpad(r.request_no::text, 6, '0') || ' — عدّى ساعتين من غير رد', r.id, '/dashboard');
    end if;
    perform public.offer_service_request(r.id, false);
    n := n + 1;
  end loop;
  return n;
end $$;
-- Safe for anyone signed in: it only moves offers whose 2 hours are over (the admin page runs it too, in case the
-- scheduler is off).
revoke execute on function public.run_service_offers() from public, anon;
grant execute on function public.run_service_offers() to authenticated, service_role;

-- The provider's open offers (no customer name or phone before accepting).
create or replace function public.my_service_offers()
returns table (id uuid, request_no bigint, category text, area text, details text, created_at timestamptz, offer_expires_at timestamptz, chosen boolean)
language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_service_provider_id();
begin
  if me is null then return; end if;
  perform public.run_service_offers();
  return query select r.id, r.request_no, r.category, r.area, r.details, r.created_at, r.offer_expires_at, r.target_provider_id is not distinct from me
    from public.service_requests r where r.offer_provider_id = me and r.assigned_provider_id is null order by r.offer_expires_at;
end $$;
revoke execute on function public.my_service_offers() from public, anon;
grant execute on function public.my_service_offers() to authenticated;

create or replace function public.accept_service_offer(_req uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_service_provider_id(); r public.service_requests; sp public.service_plans;
begin
  if me is null then raise exception 'مش مسجل كمقدم خدمة' using errcode = 'P0001'; end if;
  select * into r from public.service_requests where id = _req for update;
  if r.id is null or r.offer_provider_id is distinct from me or r.assigned_provider_id is not null then
    raise exception 'الطلب ده مبقاش معروض عليك' using errcode = 'P0001';
  end if;
  if r.offer_expires_at <= now() then raise exception 'وقت الرد على الطلب ده خلص' using errcode = 'P0001'; end if;
  select * into sp from public.service_plan_of(me);
  if sp.monthly_requests is not null and public.service_requests_this_month(me) >= sp.monthly_requests then
    raise exception 'وصلت لحد طلبات باقتك الشهر ده (%). اطلب باقة أكبر من «باقتي».', sp.monthly_requests using errcode = 'P0001';
  end if;
  perform set_config('va.service_routing', '1', true);
  update public.service_requests set assigned_provider_id = me, status = 'assigned', accepted_at = now(),
    offer_provider_id = null, offered_at = null, offer_expires_at = null, needs_manual = false where id = _req;
  perform set_config('va.service_routing', '', true);
  return true;
end $$;
revoke execute on function public.accept_service_offer(uuid) from public, anon;
grant execute on function public.accept_service_offer(uuid) to authenticated;

create or replace function public.decline_service_offer(_req uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_service_provider_id(); r public.service_requests;
begin
  if me is null then raise exception 'مش مسجل كمقدم خدمة' using errcode = 'P0001'; end if;
  select * into r from public.service_requests where id = _req for update;
  if r.id is null or r.offer_provider_id is distinct from me or r.assigned_provider_id is not null then
    raise exception 'الطلب ده مبقاش معروض عليك' using errcode = 'P0001';
  end if;
  perform set_config('va.service_routing', '1', true);
  update public.service_requests set declined_provider_ids = array_append(declined_provider_ids, me),
    offer_provider_id = null, offered_at = null, offer_expires_at = null where id = _req;
  perform set_config('va.service_routing', '', true);
  perform public.offer_service_request(_req, false);
  return true;
end $$;
revoke execute on function public.decline_service_offer(uuid) from public, anon;
grant execute on function public.decline_service_offer(uuid) to authenticated;

-- Value Aqar starts the automatic routing over (everyone who declined gets another chance).
create or replace function public.reroute_service_request(_req uuid)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or public.is_staff()) then raise exception 'للإدارة بس' using errcode = '42501'; end if;
  if exists (select 1 from public.service_requests where id = _req and (assigned_provider_id is not null or status in ('done','closed'))) then
    raise exception 'الطلب ده اتحوّل أو اتقفل' using errcode = 'P0001';
  end if;
  perform set_config('va.service_routing', '1', true);
  update public.service_requests set declined_provider_ids = '{}', offer_provider_id = null, offered_at = null, offer_expires_at = null where id = _req;
  perform set_config('va.service_routing', '', true);
  return public.offer_service_request(_req, false);
end $$;
revoke execute on function public.reroute_service_request(uuid) from public, anon;
grant execute on function public.reroute_service_request(uuid) to authenticated;

-- Numbers on the provider's dashboard.
create or replace function public.my_service_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.id is null then null else jsonb_build_object(
    'month', public.service_requests_this_month(p.id), 'limit', sp.monthly_requests, 'max_photos', sp.max_photos,
    'photos', (select count(*) from public.service_provider_photos where provider_id = p.id),
    'rating', rt.rating, 'reviews', rt.reviews,
    'done', (select count(*) from public.service_requests where assigned_provider_id = p.id and status = 'done')) end
  from (select public.my_service_provider_id() id) p
  left join lateral public.service_plan_of(p.id) sp on true
  left join lateral public.service_provider_rating(p.id) rt on true
$$;
revoke execute on function public.my_service_stats() from public, anon;
grant execute on function public.my_service_stats() to authenticated;

-- Notifications: provider, Value Aqar and the customer at each step (the new request itself is announced by the routing).
create or replace function public.notify_on_service_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare cat jsonb := '{"engineering":"مكاتب هندسية","contracting":"مقاولات وتشطيبات","crafts":"صنايعية","media":"تصوير وميديا"}';
  uid uuid; cust uuid; pname text; no text := 'S-' || lpad(new.request_no::text, 6, '0');
  msg text := (cat->>new.category) || ' — ' || new.name || coalesce(' — ' || left(new.details, 120), '');
  newly_assigned boolean := new.assigned_provider_id is not null and (tg_op = 'INSERT' or new.assigned_provider_id is distinct from old.assigned_provider_id);
begin
  if new.assigned_provider_id is not null then select name into pname from public.service_providers where id = new.assigned_provider_id; end if;
  cust := coalesce(new.customer_id, public.phone_user_id(new.phone));
  if newly_assigned then
    uid := public.service_provider_user_id(new.assigned_provider_id);
    if uid is not null and uid is distinct from auth.uid() then
      perform public.notify_user(uid, 'new_request', 'طلب خدمة جديد ليك', msg, new.id, '/dashboard');
    end if;
    perform public.notify_team('admin',
      case when uid is not null and uid = auth.uid() then coalesce(pname, 'مقدم خدمة') || ' قبل طلب خدمة' else 'طلب خدمة اتحوّل لـ ' || coalesce(pname, 'مقدم خدمة') end,
      no || ' — ' || msg, new.id, '/admin');
    if cust is not null and cust is distinct from auth.uid() then
      perform public.notify_user(cust, 'request_status', coalesce(pname, 'مقدم خدمة') || ' هيتواصل معاك', no || ' — ' || (cat->>new.category), new.id, '/my-requests');
    end if;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('done','closed') then
    if not (public.has_role(auth.uid(), 'admin') or public.is_staff()) then
      perform public.notify_team('admin', case when new.status = 'done' then 'مقدم خدمة خلّص طلب' else 'مقدم خدمة قفل طلب' end, no || ' — ' || new.name, new.id, '/admin');
    end if;
    if new.status = 'done' and new.assigned_provider_id is not null and cust is not null and cust is distinct from auth.uid() then
      perform public.notify_user(cust, 'request_status', 'قيّم الخدمة ★', coalesce(pname, 'مقدم الخدمة') || ' خلّص طلبك ' || no || ' — قولّنا رأيك', new.id, '/my-requests');
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.notify_on_service_request() from public, anon, authenticated;

-- The customer's service requests (by account or by the phone they signed in with).
create or replace function public.my_service_requests()
returns table (id uuid, request_no bigint, category text, details text, area text, status text, created_at timestamptz,
  provider_id uuid, provider_name text, waiting boolean, stars smallint)
language sql stable security definer set search_path = public as $$
  select r.id, r.request_no, r.category, r.details, r.area, r.status, r.created_at, r.assigned_provider_id, p.name,
    r.assigned_provider_id is null and r.status not in ('done','closed'), v.stars
  from public.service_requests r
  left join public.service_providers p on p.id = r.assigned_provider_id
  left join public.service_reviews v on v.request_id = r.id
  where auth.uid() is not null and (r.customer_id = auth.uid() or (public.my_phone() is not null and r.phone = public.my_phone()))
  order by r.created_at desc limit 100
$$;
revoke execute on function public.my_service_requests() from public, anon;
grant execute on function public.my_service_requests() to authenticated;

-- Rate a done request: its customer only, once.
create or replace function public.rate_service_request(_req uuid, _stars integer, _comment text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.service_requests; ph text := public.my_phone(); rid uuid; uid uuid; pname text; who text;
begin
  if auth.uid() is null then raise exception 'سجّل دخول الأول' using errcode = '42501'; end if;
  select * into r from public.service_requests where id = _req;
  if r.id is null or not (coalesce(r.customer_id = auth.uid(), false) or coalesce(r.phone = ph, false)) then
    raise exception 'الطلب ده مش بتاعك' using errcode = '42501';
  end if;
  if r.status <> 'done' or r.assigned_provider_id is null then raise exception 'تقدر تقيّم بعد ما الخدمة تتنفّذ' using errcode = 'P0001'; end if;
  if _stars is null or _stars not between 1 and 5 then raise exception 'التقييم من 1 لـ 5 نجوم' using errcode = 'P0001'; end if;
  who := left(coalesce(nullif(split_part(btrim(r.name), ' ', 1), ''), 'عميل'), 60);
  insert into public.service_reviews (request_id, provider_id, stars, comment, customer_name)
  values (_req, r.assigned_provider_id, _stars, nullif(left(btrim(coalesce(_comment, '')), 1000), ''), who)
  on conflict (request_id) do nothing returning id into rid;
  if rid is null then raise exception 'قيّمت الطلب ده قبل كده' using errcode = 'P0001'; end if;
  select name into pname from public.service_providers where id = r.assigned_provider_id;
  uid := public.service_provider_user_id(r.assigned_provider_id);
  if uid is not null and uid is distinct from auth.uid() then
    perform public.notify_user(uid, 'request_status', 'تقييم جديد ' || repeat('★', _stars), who || coalesce(' — ' || left(btrim(_comment), 120), ''), r.assigned_provider_id, '/dashboard');
  end if;
  perform public.notify_team('admin', 'تقييم مقدم خدمة — ' || coalesce(pname, '') || ' ' || _stars || '★', 'S-' || lpad(r.request_no::text, 6, '0') || ' — ' || who || coalesce(' — ' || left(btrim(_comment), 120), ''), r.assigned_provider_id, '/admin');
  return rid;
end $$;
revoke execute on function public.rate_service_request(uuid, integer, text) from public, anon;
grant execute on function public.rate_service_request(uuid, integer, text) to authenticated;

-- The provider answers a review once.
create or replace function public.reply_service_review(_review uuid, _reply text)
returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_service_provider_id();
begin
  if me is null then raise exception 'مش مسجل كمقدم خدمة' using errcode = 'P0001'; end if;
  if nullif(btrim(coalesce(_reply, '')), '') is null then raise exception 'اكتب الرد' using errcode = 'P0001'; end if;
  update public.service_reviews set reply = left(btrim(_reply), 1000), replied_at = now()
  where id = _review and provider_id = me and reply is null;
  if not found then raise exception 'رديت على التقييم ده قبل كده' using errcode = 'P0001'; end if;
  return true;
end $$;
revoke execute on function public.reply_service_review(uuid, text) from public, anon;
grant execute on function public.reply_service_review(uuid, text) to authenticated;

-- ───────────────────────── 5) Public directory ─────────────────────────
-- Approved providers only, without phone numbers (customers ask through Value Aqar).
create or replace function public.service_directory(_category text default null, _kind text default null, _area text default null)
returns table (id uuid, kind text, category text, name text, specialty text, areas text[], bio text, photo_url text, verified boolean,
  priority smallint, rating numeric, reviews integer, done integer, photos integer)
language sql stable security definer set search_path = public as $$
  select p.id, p.kind, p.category, p.name, p.specialty, p.areas, left(p.bio, 220), p.photo_url, p.verified, sp.priority, rt.rating, rt.reviews,
    (select count(*)::int from public.service_requests x where x.assigned_provider_id = p.id and x.status = 'done'),
    (select count(*)::int from public.service_provider_photos f where f.provider_id = p.id)
  from public.service_providers p
  cross join lateral public.service_plan_of(p.id) sp
  cross join lateral public.service_provider_rating(p.id) rt
  where p.status = 'approved' and (_category is null or p.category = _category) and (_kind is null or p.kind = _kind)
    and (_area is null or cardinality(p.areas) = 0 or _area = any(p.areas))
  order by sp.priority desc, p.verified desc, rt.rating desc nulls last, rt.reviews desc, p.created_at
  limit 300
$$;
revoke execute on function public.service_directory(text, text, text) from public;
grant execute on function public.service_directory(text, text, text) to anon, authenticated;

create or replace function public.service_provider_profile(_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'kind', p.kind, 'category', p.category, 'name', p.name, 'specialty', p.specialty, 'areas', p.areas,
    'bio', p.bio, 'photo_url', p.photo_url, 'verified', p.verified, 'priority', sp.priority, 'since', p.created_at,
    'rating', rt.rating, 'reviews_count', rt.reviews,
    'done', (select count(*) from public.service_requests x where x.assigned_provider_id = p.id and x.status = 'done'),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('url', f.url, 'caption', f.caption) order by f.sort_order, f.created_at)
                        from public.service_provider_photos f where f.provider_id = p.id), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('stars', v.stars, 'comment', v.comment, 'name', v.customer_name, 'reply', v.reply, 'at', v.created_at) order by v.created_at desc)
                         from (select * from public.service_reviews v where v.provider_id = p.id and not v.hidden order by v.created_at desc limit 50) v), '[]'::jsonb))
  from public.service_providers p
  cross join lateral public.service_plan_of(p.id) sp
  cross join lateral public.service_provider_rating(p.id) rt
  where p.id = _id and p.status = 'approved'
$$;
revoke execute on function public.service_provider_profile(uuid) from public;
grant execute on function public.service_provider_profile(uuid) to anon, authenticated;

-- Admin audit log for the new tables.
do $$
declare t text;
begin
  foreach t in array array['owner_plan_grants','service_provider_photos','service_reviews'] loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- فاليو عقار — إصدار 19: قسم الخدمات (طلبات، مقدمين خدمة بحسابات، باقات) + إشعارات كل طلب باسمه للجهة المقصودة والإدارة.
-- مرة واحدة، كله أو مفيش. بيضيف بس (جداول ودوال جديدة)، ومبيغيّرش نوع أي خانة. لو اتشغل تاني بالغلط مفيش ضرر.
--   20261013700000_services.sql
--   20261013710000_request-notifications.sql

begin;
-- Services: a section of its own, separate from real-estate leads. Customers ask for a service (engineering office,
-- contracting & finishing, craftsmen, photography & media); companies and technicians register as providers, get approved
-- by the admin, sign in with their phone to their own dashboard, and get plans (subscriptions activated by the admin
-- until online payment opens). Service requests never enter the leads pipeline or the automatic broker routing.
-- Additive only: new tables and functions; no existing column changes.

-- 1) Plans for service providers (prices are set later by the admin; null = "السعر قريبًا").
create table if not exists public.service_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]{2,30}$'),
  name text not null check (char_length(name) between 2 and 60),
  monthly_price numeric check (monthly_price is null or monthly_price >= 0),
  yearly_price numeric check (yearly_price is null or yearly_price >= 0),
  features text[] not null default '{}' check (cardinality(features) <= 15),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.service_plans to anon, authenticated;
grant insert, update, delete on public.service_plans to authenticated;
grant all on public.service_plans to service_role;
alter table public.service_plans enable row level security;
drop policy if exists "service plans public" on public.service_plans;
drop policy if exists "admin manages service plans" on public.service_plans;
create policy "service plans public" on public.service_plans for select to anon, authenticated using (is_active);
create policy "admin manages service plans" on public.service_plans for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
insert into public.service_plans (code, name, features, sort_order) values
  ('free', 'مجانية', array['ملف في دليل الخدمات بعد الاعتماد', 'استقبال الطلبات اللي فاليو عقار بتحولها ليك'], 1),
  ('basic', 'أساسية', array['كل مميزات المجانية', 'أولوية في توزيع الطلبات', 'ظهور قبل الباقة المجانية في الدليل'], 2),
  ('featured', 'مميزة', array['كل مميزات الأساسية', 'شارة «موثّق من فاليو عقار»', 'أول الدليل في تخصصك ومنطقتك', 'ترشيح للمطورين والوسطاء على المنصة'], 3)
on conflict (code) do nothing;

-- 2) Providers: a company or a technician. Matched to a sign-in by phone (like company team members).
create table if not exists public.service_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  kind text not null default 'technician' check (kind in ('company','technician')),
  category text not null check (category in ('engineering','contracting','crafts','media')),
  name text not null check (char_length(name) between 2 and 100),
  contact_person text check (contact_person is null or char_length(contact_person) <= 100),
  phone text not null check (char_length(phone) between 8 and 20),
  whatsapp text check (whatsapp is null or char_length(whatsapp) <= 20),
  specialty text check (specialty is null or char_length(specialty) <= 120),
  areas text[] not null default '{}' check (cardinality(areas) <= 30),
  bio text check (bio is null or char_length(bio) <= 1000),
  photo_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  verified boolean not null default false,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  plan_id uuid references public.service_plans(id) on delete set null,
  plan_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists service_providers_phone_uidx on public.service_providers (public.normalize_phone(phone));
create index if not exists service_providers_category_idx on public.service_providers (category, status);
grant select, insert, update, delete on public.service_providers to authenticated;
grant insert on public.service_providers to anon;
grant all on public.service_providers to service_role;
alter table public.service_providers enable row level security;

-- The provider row of the signed-in user (by account or by the phone they signed in with).
create or replace function public.my_service_provider_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.service_providers
  where user_id = auth.uid() or (public.my_phone() is not null and public.normalize_phone(phone) = public.my_phone())
  order by (user_id = auth.uid()) desc nulls last limit 1
$$;
revoke execute on function public.my_service_provider_id() from public, anon;
grant execute on function public.my_service_provider_id() to authenticated;

-- Sign-in account of a provider (for notifications).
create or replace function public.service_provider_user_id(_provider uuid)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select coalesce(p.user_id, (select u.id from auth.users u where public.normalize_phone(u.phone) = public.normalize_phone(p.phone) limit 1))
  from public.service_providers p where p.id = _provider
$$;
revoke execute on function public.service_provider_user_id(uuid) from public, anon, authenticated;

drop policy if exists "anyone registers as provider" on public.service_providers;
drop policy if exists "provider reads own" on public.service_providers;
drop policy if exists "provider updates own" on public.service_providers;
drop policy if exists "staff reads providers" on public.service_providers;
drop policy if exists "admin manages providers" on public.service_providers;
create policy "anyone registers as provider" on public.service_providers for insert to anon, authenticated
  with check (status = 'pending' and not verified and plan_id is null and plan_ends_at is null and review_note is null);
create policy "provider reads own" on public.service_providers for select to authenticated using (id = public.my_service_provider_id());
create policy "provider updates own" on public.service_providers for update to authenticated
  using (id = public.my_service_provider_id()) with check (id = public.my_service_provider_id());
create policy "staff reads providers" on public.service_providers for select to authenticated using (public.is_staff());
create policy "admin manages providers" on public.service_providers for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Providers edit their profile only; status, approval, plan and phone belong to the admin.
create or replace function public.service_providers_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare admin boolean := public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role';
  -- Set only by refresh_service_plan(): the current plan follows the subscriptions.
  plan_refresh boolean := coalesce(current_setting('va.service_plan_refresh', true), '') = '1';
begin
  new.phone := coalesce(public.normalize_phone(new.phone), new.phone);
  if tg_op = 'UPDATE' and plan_refresh then
    new := jsonb_populate_record(old, jsonb_build_object('plan_id', new.plan_id, 'plan_ends_at', new.plan_ends_at, 'updated_at', now()));
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not admin then
      new.status := 'pending'; new.verified := false; new.plan_id := null; new.plan_ends_at := null; new.review_note := null;
      new.user_id := auth.uid();
    end if;
  elsif not admin then
    new.status := old.status; new.verified := old.verified; new.plan_id := old.plan_id; new.plan_ends_at := old.plan_ends_at;
    new.review_note := old.review_note; new.phone := old.phone; new.category := old.category; new.created_at := old.created_at;
    new.user_id := coalesce(old.user_id, auth.uid());
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.service_providers_guard() from public, anon, authenticated;
drop trigger if exists service_providers_guard on public.service_providers;
create trigger service_providers_guard before insert or update on public.service_providers for each row execute function public.service_providers_guard();

-- 3) Customer requests for a service.
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  request_no bigint generated always as identity,
  name text not null check (char_length(name) between 2 and 100),
  phone text not null check (char_length(phone) between 8 and 20),
  category text not null check (category in ('engineering','contracting','crafts','media')),
  details text check (details is null or char_length(details) <= 1000),
  area text check (area is null or char_length(area) <= 100),
  status text not null default 'new' check (status in ('new','contacted','assigned','done','closed')),
  assigned_provider_id uuid references public.service_providers(id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 1000),
  customer_id uuid,
  source text not null default 'website' check (char_length(source) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_requests_status_idx on public.service_requests (status, created_at desc);
create index if not exists service_requests_provider_idx on public.service_requests (assigned_provider_id);
grant select, insert, update on public.service_requests to authenticated;
grant insert on public.service_requests to anon;
grant all on public.service_requests to service_role;
alter table public.service_requests enable row level security;

drop policy if exists "anyone asks for a service" on public.service_requests;
drop policy if exists "team manages service requests" on public.service_requests;
drop policy if exists "provider reads assigned requests" on public.service_requests;
drop policy if exists "provider updates assigned requests" on public.service_requests;
drop policy if exists "customer reads own service requests" on public.service_requests;
create policy "anyone asks for a service" on public.service_requests for insert to anon, authenticated
  with check (status = 'new' and assigned_provider_id is null and notes is null);
create policy "team manages service requests" on public.service_requests for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.is_staff()) with check (public.has_role(auth.uid(), 'admin') or public.is_staff());
create policy "provider reads assigned requests" on public.service_requests for select to authenticated
  using (assigned_provider_id is not null and assigned_provider_id = public.my_service_provider_id());
create policy "provider updates assigned requests" on public.service_requests for update to authenticated
  using (assigned_provider_id is not null and assigned_provider_id = public.my_service_provider_id())
  with check (assigned_provider_id = public.my_service_provider_id());
create policy "customer reads own service requests" on public.service_requests for select to authenticated using (customer_id = auth.uid());

-- Only Value Aqar assigns; a provider moves their request to done/closed and writes notes. Assigning to an
-- unapproved provider, or one from another service, is refused.
create or replace function public.service_requests_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare team boolean := public.has_role(auth.uid(), 'admin') or public.is_staff() or coalesce(auth.role(), '') = 'service_role';
begin
  new.phone := coalesce(public.normalize_phone(new.phone), new.phone);
  if tg_op = 'INSERT' then
    if not team then new.status := 'new'; new.assigned_provider_id := null; new.notes := null; new.customer_id := auth.uid(); end if;
  else
    new.created_at := old.created_at; new.request_no := old.request_no;
    if not team then
      new.name := old.name; new.phone := old.phone; new.category := old.category; new.details := old.details; new.area := old.area;
      new.assigned_provider_id := old.assigned_provider_id; new.customer_id := old.customer_id; new.source := old.source;
      if new.status not in ('assigned','done','closed') then new.status := old.status; end if;
    end if;
  end if;
  if new.assigned_provider_id is not null and new.assigned_provider_id is distinct from (case when tg_op = 'UPDATE' then old.assigned_provider_id end) then
    if not exists (select 1 from public.service_providers p where p.id = new.assigned_provider_id and p.status = 'approved' and p.category = new.category) then
      raise exception 'مقدم الخدمة لازم يكون معتمد ومن نفس الخدمة' using errcode = 'P0001';
    end if;
    if new.status in ('new','contacted') then new.status := 'assigned'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.service_requests_guard() from public, anon, authenticated;
drop trigger if exists service_requests_guard on public.service_requests;
create trigger service_requests_guard before insert or update on public.service_requests for each row execute function public.service_requests_guard();

-- 4) Subscriptions (activated by the admin for now). The provider row keeps the current plan and end date.
create table if not exists public.service_subscriptions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_providers(id) on delete cascade,
  plan_id uuid not null references public.service_plans(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active','expired','cancelled')),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid(),
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists service_subscriptions_provider_idx on public.service_subscriptions (provider_id, ends_at desc);
grant select, insert, update on public.service_subscriptions to authenticated;
grant all on public.service_subscriptions to service_role;
alter table public.service_subscriptions enable row level security;
drop policy if exists "provider reads own subscriptions" on public.service_subscriptions;
drop policy if exists "admin manages service subscriptions" on public.service_subscriptions;
create policy "provider reads own subscriptions" on public.service_subscriptions for select to authenticated using (provider_id = public.my_service_provider_id());
create policy "admin manages service subscriptions" on public.service_subscriptions for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Recompute the provider's current plan from its subscriptions (latest active one that has started and not ended).
create or replace function public.refresh_service_plan(_provider uuid)
returns void language sql security definer set search_path = public as $$
  select set_config('va.service_plan_refresh', '1', true);
  update public.service_providers p set plan_id = s.plan_id, plan_ends_at = s.ends_at, updated_at = now()
  from (select (select plan_id from public.service_subscriptions where provider_id = _provider and status = 'active' and starts_at <= now() and ends_at > now() order by ends_at desc limit 1) plan_id,
               (select ends_at from public.service_subscriptions where provider_id = _provider and status = 'active' and starts_at <= now() and ends_at > now() order by ends_at desc limit 1) ends_at) s
  where p.id = _provider;
  select set_config('va.service_plan_refresh', '', true);
$$;
revoke execute on function public.refresh_service_plan(uuid) from public, anon, authenticated;

create or replace function public.service_subscriptions_track()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid; pname text; plan text;
begin
  perform public.refresh_service_plan(new.provider_id);
  if tg_op = 'INSERT' and new.status = 'active' then
    select name into pname from public.service_providers where id = new.provider_id;
    select name into plan from public.service_plans where id = new.plan_id;
    uid := public.service_provider_user_id(new.provider_id);
    if uid is not null and uid is distinct from auth.uid() then
      perform public.notify_user(uid, 'request_status', 'اشتراكك اتفعّل', 'باقة ' || plan || ' لحد ' || to_char(new.ends_at, 'YYYY-MM-DD'), new.provider_id, '/dashboard');
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.service_subscriptions_track() from public, anon, authenticated;
drop trigger if exists service_subscriptions_track on public.service_subscriptions;
create trigger service_subscriptions_track after insert or update on public.service_subscriptions for each row execute function public.service_subscriptions_track();

-- 5) Notifications: new request and new provider for the team; approval and assignment for the provider.
create or replace function public.notify_on_service_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare cat jsonb := '{"engineering":"مكاتب هندسية","contracting":"مقاولات وتشطيبات","crafts":"صنايعية","media":"تصوير وميديا"}';
  uid uuid; pname text; msg text := (cat->>new.category) || ' — ' || new.name || coalesce(' — ' || left(new.details, 120), '');
  newly_assigned boolean := new.assigned_provider_id is not null and (tg_op = 'INSERT' or new.assigned_provider_id is distinct from old.assigned_provider_id);
begin
  if tg_op = 'INSERT' then
    perform public.notify_team('admin', 'طلب خدمة جديد — ' || (cat->>new.category), new.name || coalesce(' — ' || left(new.details, 120), ''), new.id, '/admin');
  end if;
  -- Assigned to a provider: the provider and Value Aqar's admins hear about it at the same time.
  if newly_assigned then
    select name into pname from public.service_providers where id = new.assigned_provider_id;
    uid := public.service_provider_user_id(new.assigned_provider_id);
    if uid is not null and uid is distinct from auth.uid() then
      perform public.notify_user(uid, 'new_request', 'طلب خدمة جديد ليك', msg, new.id, '/dashboard');
    end if;
    perform public.notify_team('admin', 'طلب خدمة اتحوّل لـ ' || coalesce(pname, 'مقدم خدمة'), 'S-' || lpad(new.request_no::text, 6, '0') || ' — ' || msg, new.id, '/admin');
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('done','closed') and not (public.has_role(auth.uid(), 'admin') or public.is_staff()) then
    perform public.notify_team('admin', case when new.status = 'done' then 'مقدم خدمة خلّص طلب' else 'مقدم خدمة قفل طلب' end,
      'S-' || lpad(new.request_no::text, 6, '0') || ' — ' || new.name, new.id, '/admin');
  end if;
  return null;
end $$;
revoke execute on function public.notify_on_service_request() from public, anon, authenticated;
drop trigger if exists notify_on_service_request on public.service_requests;
create trigger notify_on_service_request after insert or update on public.service_requests for each row execute function public.notify_on_service_request();

create or replace function public.notify_on_service_provider()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.notify_team('admin', 'مقدم خدمة جديد مستني الموافقة', new.name || ' — ' || case new.kind when 'company' then 'شركة' else 'فني' end, new.id, '/admin');
    end if;
  elsif new.status is distinct from old.status then
    uid := public.service_provider_user_id(new.id);
    if uid is not null and uid is distinct from auth.uid() then
      perform public.notify_user(uid, 'request_status',
        case new.status when 'approved' then 'حسابك كمقدم خدمة اتفعّل' when 'rejected' then 'طلب انضمامك كمقدم خدمة اترفض' when 'suspended' then 'حسابك كمقدم خدمة اتوقف' else 'حسابك رجع للمراجعة' end,
        coalesce(new.review_note, new.name), new.id, '/dashboard');
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.notify_on_service_provider() from public, anon, authenticated;
drop trigger if exists notify_on_service_provider on public.service_providers;
create trigger notify_on_service_provider after insert or update of status on public.service_providers for each row execute function public.notify_on_service_provider();

-- A provider asks to subscribe to a plan: the admin is told and activates it (until online payment opens).
create or replace function public.request_service_plan(_plan uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_service_provider_id(); p public.service_providers; plan text;
begin
  if me is null then raise exception 'مش مسجل كمقدم خدمة' using errcode = 'P0001'; end if;
  select * into p from public.service_providers where id = me;
  select name into plan from public.service_plans where id = _plan and is_active;
  if plan is null then raise exception 'الباقة مش متاحة' using errcode = 'P0001'; end if;
  perform public.notify_team('admin', 'طلب اشتراك من مقدم خدمة', p.name || ' عايز باقة ' || plan, p.id, '/admin');
  return true;
end $$;
revoke execute on function public.request_service_plan(uuid) from public, anon;
grant execute on function public.request_service_plan(uuid) to authenticated;

-- 6) Daily: expire ended subscriptions (plan goes back to free) and remind 3 days before the end.
create or replace function public.run_service_subscriptions()
returns integer language plpgsql security definer set search_path = public as $$
declare s record; n integer := 0; uid uuid;
begin
  for s in select ss.*, p.name pname from public.service_subscriptions ss join public.service_providers p on p.id = ss.provider_id
           where ss.status = 'active' and ss.ends_at <= now() loop
    update public.service_subscriptions set status = 'expired' where id = s.id;
    perform public.refresh_service_plan(s.provider_id);
    uid := public.service_provider_user_id(s.provider_id);
    if uid is not null then perform public.notify_user(uid, 'request_status', 'اشتراكك خلص', 'رجعت للباقة المجانية. جدّد عشان مميزاتك ترجع.', s.provider_id, '/dashboard'); end if;
    n := n + 1;
  end loop;
  for s in select ss.*, p.name pname from public.service_subscriptions ss join public.service_providers p on p.id = ss.provider_id
           where ss.status = 'active' and ss.reminded_at is null and ss.ends_at > now() and ss.ends_at <= now() + interval '3 days' loop
    update public.service_subscriptions set reminded_at = now() where id = s.id;
    uid := public.service_provider_user_id(s.provider_id);
    if uid is not null then perform public.notify_user(uid, 'request_status', 'اشتراكك قرّب يخلص', 'باقي أقل من 3 أيام — كلّم فاليو عقار للتجديد.', s.provider_id, '/dashboard'); end if;
    perform public.notify_team('admin', 'اشتراك مقدم خدمة قرّب يخلص', s.pname || ' — ' || to_char(s.ends_at, 'YYYY-MM-DD'), s.provider_id, '/admin');
    n := n + 1;
  end loop;
  -- Subscriptions that start in the future become current on their day.
  for s in select distinct provider_id from public.service_subscriptions where status = 'active' and starts_at <= now() and starts_at > now() - interval '2 days' loop
    perform public.refresh_service_plan(s.provider_id);
  end loop;
  return n;
end $$;
revoke execute on function public.run_service_subscriptions() from public, anon, authenticated;

-- 7) Admin audit log for the new tables.
do $$
declare t text;
begin
  foreach t in array array['service_providers','service_requests','service_subscriptions','service_plans'] loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- 8) Requests sent from the services page before this release were saved as real-estate leads; copy them over
--    (the original leads stay as they were, nothing is deleted). Runs once: skipped when already copied.
--    No notifications for these old ones.
alter table public.service_requests disable trigger notify_on_service_request;
alter table public.service_providers disable trigger notify_on_service_provider;
insert into public.service_requests (name, phone, category, details, status, created_at, source)
select l.name, l.phone,
  case when split_part(l.details, ' — ', 3) like 'مكاتب هندسية%' then 'engineering'
       when split_part(l.details, ' — ', 3) like 'شركات مقاولات%' then 'contracting'
       when split_part(l.details, ' — ', 3) like 'شركات التصوير%' then 'media' else 'crafts' end,
  nullif(split_part(l.details, ' — ', 4), ''), 'new', l.created_at, 'website'
from public.leads l
where l.details like 'دليل الخدمات%' and split_part(l.details, ' — ', 2) <> 'مقدم خدمة'
  and not exists (select 1 from public.service_requests r where r.phone = coalesce(public.normalize_phone(l.phone), l.phone) and r.created_at = l.created_at);

insert into public.service_providers (name, phone, category, specialty, status, created_at)
select distinct on (coalesce(public.normalize_phone(l.phone), l.phone)) l.name, l.phone,
  case when split_part(l.details, ' — ', 3) like 'مكاتب هندسية%' then 'engineering'
       when split_part(l.details, ' — ', 3) like 'شركات مقاولات%' then 'contracting'
       when split_part(l.details, ' — ', 3) like 'شركات التصوير%' then 'media' else 'crafts' end,
  nullif(left(split_part(l.details, ' — ', 4), 120), ''), 'pending', l.created_at
from public.leads l
where l.details like 'دليل الخدمات%' and split_part(l.details, ' — ', 2) = 'مقدم خدمة'
  and length(coalesce(public.normalize_phone(l.phone), l.phone)) between 8 and 20
order by coalesce(public.normalize_phone(l.phone), l.phone), l.created_at desc
on conflict do nothing;
alter table public.service_requests enable trigger notify_on_service_request;
alter table public.service_providers enable trigger notify_on_service_provider;

-- Every request notifies Value Aqar's admins AND the party it is meant for, and the notification carries the
-- request's own name ("طلب وحدة في كمبوند النخيل", "استفسار عن شقة …", "طلب إيجار — شقة في الحي الأول" …)
-- instead of one generic "طلب عقاري جديد". Services have their own notifications (20261013700000_services.sql).

-- 1) The request's name, from what it is about.
create or replace function public.lead_title(_l public.leads)
returns text language sql stable security definer set search_path = public as $$
  select case
    when _l.details like 'دليل الخدمات%' then 'طلب خدمة'
    when _l.details like 'سكن مشترك%' then 'سكن مشترك'
    when _l.details like 'سوق الوسطاء%' then 'سوق الوسطاء'
    when _l.details like 'طلب تقييم%' then 'طلب تقييم عقار'
    when _l.compound_id is not null then 'طلب وحدة في ' || coalesce((select name from public.compounds where id = _l.compound_id), 'كمبوند')
    when _l.project_id is not null then 'طلب وحدة في ' || coalesce((select name from public.projects where id = _l.project_id), 'مشروع')
    when _l.kind = 'investment' then 'طلب استثمار' || coalesce(' — ' || (select title from public.investment_opportunities where id = _l.opportunity_id), '')
    when _l.kind = 'listing' then 'عرض عقار من مالك'
    when _l.kind = 'inquiry' then 'استفسار عن ' || coalesce(left((select title from public.properties where id = _l.property_id), 60), 'عقار')
    else case _l.purpose when 'rent' then 'طلب إيجار' when 'summer' then 'طلب مصيف' when 'sale' then 'طلب شراء' else 'طلب عقار' end
         || coalesce(' — ' || _l.property_type, '') || coalesce(' في ' || _l.area, '')
  end
$$;
revoke execute on function public.lead_title(public.leads) from public, anon, authenticated;

-- 2) Lead notifications with the request's name (same people as before: admins + the assigned account / member / staff).
create or replace function public.notify_on_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare t text; ttl text := public.lead_title(new); msg text; url text := '/leads/' || new.id; mu uuid;
begin
  msg := 'VA-' || lpad(new.lead_no::text, 6, '0') || ' — ' || new.name || coalesce(' — ' || new.property_type, '') || coalesce(' — ' || new.area, '');
  if tg_op = 'INSERT' then
    t := case when new.kind = 'inquiry' then 'new_inquiry' else 'new_request' end;
    perform public.notify_admins(t, ttl, msg, new.id, url);
    if new.assigned_broker_id is not null then
      perform public.notify_company(new.assigned_broker_id, t, ttl, msg, new.id, url);
    end if;
    if new.assigned_staff_id is not null and new.assigned_staff_id is distinct from auth.uid() then
      perform public.notify_user(new.assigned_staff_id, 'new_request', 'اتحوّل لك: ' || ttl, msg, new.id, url);
    end if;
    return new;
  end if;

  if new.assigned_broker_id is distinct from old.assigned_broker_id and new.assigned_broker_id is not null then
    perform public.notify_company(new.assigned_broker_id, 'new_request', 'اتحوّل لشركتك: ' || ttl, msg, new.id, url);
  end if;
  if new.assigned_member_id is distinct from old.assigned_member_id and new.assigned_member_id is not null then
    mu := public.member_user_id(new.assigned_member_id);
    if mu is not null and mu is distinct from auth.uid() then
      perform public.notify_user(mu, 'new_request', 'اتحوّل لك: ' || ttl, msg, new.id, url);
    end if;
  end if;
  if new.assigned_staff_id is distinct from old.assigned_staff_id and new.assigned_staff_id is not null and new.assigned_staff_id is distinct from auth.uid() then
    perform public.notify_user(new.assigned_staff_id, 'new_request', 'اتحوّل لك: ' || ttl, msg, new.id, url);
  end if;
  -- Suspicious events, flagged to admins and staff right away (the full list is in the review report).
  if new.stage = 'lost' and old.stage is distinct from 'lost' and new.referred_at is not null and now() - new.referred_at < interval '3 days' then
    perform public.notify_team('admin', 'تنبيه: عميل اتقفل بسرعة بعد إحالته', msg || ' — السبب: ' || coalesce(new.lost_reason, '—'), new.id, url);
  end if;
  if new.assigned_broker_id is distinct from old.assigned_broker_id and old.assigned_broker_id is not null
     and exists (select 1 from public.deals d where d.lead_id = new.id) then
    perform public.notify_team('admin', 'تنبيه: تغيير الشركة على عميل عليه صفقة', msg, new.id, url);
  end if;
  return new;
end $$;
revoke execute on function public.notify_on_lead() from public, anon, authenticated;

-- 3) A unit in a developer's compound or project: the developer hears at the same moment as the admins,
--    with the request's name and unit — never the customer's name or phone (the request stays with Value Aqar
--    until it is handed over, so the contact goes through the platform).
create or replace function public.notify_developer_unit_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare dev uuid; unit text; url text;
begin
  if new.compound_id is not null then
    select c.developer_id into dev from public.compounds c where c.id = new.compound_id;
    select u.unit_type || coalesce(' ' || u.code, '') into unit from public.compound_units u where u.id = new.compound_unit_id;
    url := '/my-compounds/' || new.compound_id;
  elsif new.project_id is not null then
    select p.developer_id into dev from public.projects p where p.id = new.project_id;
    select u.unit_type || coalesce(' ' || u.code, '') into unit from public.project_units u where u.id = new.project_unit_id;
    url := '/dashboard';
  end if;
  -- Already handed to the developer at insert: notify_on_lead() told them with the full request.
  if dev is null or new.assigned_broker_id is not distinct from dev then return null; end if;
  perform public.notify_company(dev, 'new_request', public.lead_title(new),
    coalesce('وحدة: ' || unit || ' — ', '') || 'فاليو عقار بتتواصل مع العميل وهتحوّله ليك.', coalesce(new.compound_id, new.project_id), url);
  return null;
end $$;
revoke execute on function public.notify_developer_unit_request() from public, anon, authenticated;
drop trigger if exists notify_developer_unit_request on public.leads;
create trigger notify_developer_unit_request after insert on public.leads
  for each row when (new.compound_id is not null or new.project_id is not null)
  execute function public.notify_developer_unit_request();

commit;

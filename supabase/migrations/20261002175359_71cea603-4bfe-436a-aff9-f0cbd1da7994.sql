-- Roles
create type public.app_role as enum ('admin', 'broker');
create type public.review_status as enum ('draft', 'pending', 'approved', 'rejected');
create type public.lead_stage as enum ('new', 'contacted', 'viewing', 'negotiating', 'won', 'lost');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own roles readable" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "admin manages roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.admin_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where role = 'admin')
$$;
create or replace function public.claim_first_admin()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform pg_advisory_xact_lock(4242);
  if exists (select 1 from public.user_roles where role = 'admin') then return false; end if;
  insert into public.user_roles (user_id, role) values (auth.uid(), 'admin');
  return true;
end $$;
revoke execute on function public.claim_first_admin() from anon, public;
grant execute on function public.claim_first_admin() to authenticated;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  max_properties integer not null default 5,
  featured_slots integer not null default 0,
  monthly_price numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.plans to anon, authenticated;
grant insert, update, delete on public.plans to authenticated;
grant all on public.plans to service_role;
alter table public.plans enable row level security;
create policy "plans public read" on public.plans for select to anon, authenticated using (true);
create policy "admin manages plans" on public.plans for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

insert into public.plans (code, name, max_properties, featured_slots, monthly_price) values
  ('free', 'الباقة المجانية', 5, 0, 0),
  ('pro', 'الباقة الاحترافية', 30, 3, 0),
  ('business', 'باقة المكاتب', 200, 15, 0);

create table public.brokers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  slug text not null unique,
  name text not null,
  specialty text,
  bio text,
  photo_url text,
  areas text[] not null default '{}',
  phone text,
  whatsapp text,
  email text,
  facebook text,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  plan_id uuid references public.plans(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.brokers to anon, authenticated;
grant insert, update, delete on public.brokers to authenticated;
grant all on public.brokers to service_role;
alter table public.brokers enable row level security;

create or replace function public.current_broker_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.brokers where user_id = auth.uid() and is_active limit 1
$$;

create policy "active brokers public" on public.brokers for select to anon, authenticated using (is_active);
create policy "broker reads self" on public.brokers for select to authenticated using (user_id = auth.uid());
create policy "broker updates self" on public.brokers for update to authenticated
  using (user_id = auth.uid() and is_active) with check (user_id = auth.uid());
create policy "admin manages brokers" on public.brokers for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.brokers_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') and coalesce(auth.role(), '') <> 'service_role' then
    new.is_active := old.is_active;
    new.plan_id := old.plan_id;
    new.user_id := old.user_id;
    new.slug := old.slug;
    new.is_demo := old.is_demo;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger brokers_guard before update on public.brokers for each row execute function public.brokers_guard();

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid references public.brokers(id) on delete cascade,
  title text not null,
  description text,
  image_url text,
  price numeric not null check (price >= 0),
  type text not null,
  area text not null,
  size numeric not null default 0,
  rooms integer,
  baths integer,
  status text not null check (status in ('بيع','إيجار')),
  review_status public.review_status not null default 'draft',
  review_note text,
  is_featured boolean not null default false,
  featured_until timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.properties (broker_id);
create index on public.properties (review_status);
grant select on public.properties to anon, authenticated;
grant insert, update, delete on public.properties to authenticated;
grant all on public.properties to service_role;
alter table public.properties enable row level security;

create policy "approved properties public" on public.properties for select to anon, authenticated
  using (review_status = 'approved' and (broker_id is null or exists (select 1 from public.brokers b where b.id = broker_id and b.is_active)));
create policy "broker reads own properties" on public.properties for select to authenticated
  using (broker_id = public.current_broker_id());
create policy "broker inserts own properties" on public.properties for insert to authenticated
  with check (broker_id = public.current_broker_id());
create policy "broker updates own properties" on public.properties for update to authenticated
  using (broker_id = public.current_broker_id()) with check (broker_id = public.current_broker_id());
create policy "broker deletes own properties" on public.properties for delete to authenticated
  using (broker_id = public.current_broker_id());
create policy "admin manages properties" on public.properties for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.properties_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim integer; cnt integer;
begin
  if public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    new.updated_at := now();
    return new;
  end if;
  new.is_featured := coalesce(case when tg_op = 'UPDATE' then old.is_featured end, false);
  new.featured_until := case when tg_op = 'UPDATE' then old.featured_until end;
  new.is_demo := false;
  if new.review_status not in ('draft','pending') then new.review_status := 'pending'; end if;
  if tg_op = 'UPDATE' then
    new.broker_id := old.broker_id;
    new.review_note := old.review_note;
    if old.review_status in ('approved','rejected') then new.review_status := 'pending'; end if;
  end if;
  if tg_op = 'INSERT' then
    select p.max_properties into lim from public.brokers b left join public.plans p on p.id = b.plan_id where b.id = new.broker_id;
    select count(*) into cnt from public.properties where broker_id = new.broker_id;
    if cnt >= coalesce(lim, 5) then raise exception 'تم الوصول للحد الأقصى من العقارات في باقتك (%)', coalesce(lim,5); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger properties_guard before insert or update on public.properties for each row execute function public.properties_guard();

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  phone text not null check (char_length(phone) between 6 and 20),
  kind text not null default 'request' check (kind in ('request','inquiry')),
  details text check (char_length(details) <= 1000),
  property_type text,
  area text,
  budget numeric,
  property_id uuid references public.properties(id) on delete set null,
  assigned_broker_id uuid references public.brokers(id) on delete set null,
  stage public.lead_stage not null default 'new',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.leads (assigned_broker_id);
grant insert on public.leads to anon;
grant select, insert, update, delete on public.leads to authenticated;
grant all on public.leads to service_role;
alter table public.leads enable row level security;

create policy "anyone submits leads" on public.leads for insert to anon, authenticated
  with check (stage = 'new' and notes is null);
create policy "broker reads assigned leads" on public.leads for select to authenticated
  using (assigned_broker_id = public.current_broker_id());
create policy "broker updates assigned leads" on public.leads for update to authenticated
  using (assigned_broker_id = public.current_broker_id()) with check (assigned_broker_id = public.current_broker_id());
create policy "admin manages leads" on public.leads for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.leads_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' then
    new.updated_at := now(); return new;
  end if;
  if tg_op = 'INSERT' then
    new.assigned_broker_id := null;
    if new.property_id is not null then
      select broker_id into new.assigned_broker_id from public.properties where id = new.property_id and review_status = 'approved';
      new.kind := 'inquiry';
    end if;
  else
    new.name := old.name; new.phone := old.phone; new.kind := old.kind; new.details := old.details;
    new.property_type := old.property_type; new.area := old.area; new.budget := old.budget;
    new.property_id := old.property_id; new.assigned_broker_id := old.assigned_broker_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger leads_guard before insert or update on public.leads for each row execute function public.leads_guard();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references public.brokers(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'active' check (status in ('trial','active','past_due','canceled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  provider text,
  provider_ref text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
create policy "broker reads own subscriptions" on public.subscriptions for select to authenticated
  using (broker_id = public.current_broker_id());
create policy "admin manages subscriptions" on public.subscriptions for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "users read own media" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users upload own media" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users update own media" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete own media" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

insert into public.brokers (id, slug, name, specialty, bio, areas, phone, whatsapp, is_demo, plan_id) values
  ('11111111-1111-1111-1111-111111111111', 'elnokhba', 'مكتب النخبة العقاري', 'شقق وفلل سكنية', 'مكتب عقاري متخصص في الوحدات السكنية (بيانات تجريبية).', array['الحي الأول','الحي الثاني'], '201000000000', '201000000000', true, (select id from public.plans where code='free')),
  ('22222222-2222-2222-2222-222222222222', 'ahmed-samy', 'أحمد سامي', 'أراضٍ ومشروعات استثمارية', 'وسيط متخصص في الأراضي والاستثمار (بيانات تجريبية).', array['الحي الرابع','الحي الخامس'], '201000000000', '201000000000', true, (select id from public.plans where code='free')),
  ('33333333-3333-3333-3333-333333333333', 'elreyada', 'دار الريادة للعقارات', 'محلات ومكاتب إدارية', 'متخصصون في العقارات التجارية والإدارية (بيانات تجريبية).', array['الحي الثالث'], '201000000000', '201000000000', true, (select id from public.plans where code='free'));

insert into public.properties (broker_id, title, image_url, price, type, area, size, rooms, baths, status, review_status, is_demo, is_featured) values
  ('11111111-1111-1111-1111-111111111111', 'شقة بإطلالة مفتوحة', '/demo/p1.jpg', 1850000, 'شقة', 'الحي الأول', 135, 3, 2, 'بيع', 'approved', true, true),
  ('11111111-1111-1111-1111-111111111111', 'فيلا مستقلة بحمام سباحة', '/demo/p2.jpg', 7200000, 'فيلا', 'الحي الثالث', 420, 5, 4, 'بيع', 'approved', true, true),
  ('11111111-1111-1111-1111-111111111111', 'دوبلكس بحديقة خاصة', '/demo/p3.jpg', 12000, 'دوبلكس', 'الحي الخامس', 210, 4, 3, 'إيجار', 'approved', true, true),
  ('11111111-1111-1111-1111-111111111111', 'شقة مفروشة قريبة من الخدمات', '/demo/p1.jpg', 6500, 'شقة', 'الحي الثاني', 110, 2, 1, 'إيجار', 'approved', true, false),
  ('33333333-3333-3333-3333-333333333333', 'محل تجاري على شارع رئيسي', '/demo/p3.jpg', 950000, 'محل', 'الحي الرابع', 45, null, null, 'بيع', 'approved', true, false),
  ('33333333-3333-3333-3333-333333333333', 'مكتب إداري بتشطيب كامل', '/demo/p1.jpg', 8000, 'مكتب', 'الحي الثالث', 80, null, 1, 'إيجار', 'approved', true, false),
  ('22222222-2222-2222-2222-222222222222', 'أرض سكنية بموقع مميز', '/demo/p2.jpg', 2400000, 'أرض', 'الحي الخامس', 300, null, null, 'بيع', 'approved', true, false),
  ('22222222-2222-2222-2222-222222222222', 'فيلا للإيجار بحديقة', '/demo/p2.jpg', 25000, 'فيلا', 'الحي الرابع', 380, 5, 4, 'إيجار', 'approved', true, false),
  ('11111111-1111-1111-1111-111111111111', 'شقة اقتصادية تشطيب حديث', '/demo/p3.jpg', 980000, 'شقة', 'الحي الثاني', 95, 2, 1, 'بيع', 'approved', true, false);
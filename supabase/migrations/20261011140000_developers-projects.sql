-- Developer accounts, projects (compounds) and their units.
-- A developer is a broker row with account_type = 'developer': approved once by an admin, then publishes instantly.

alter table public.brokers drop constraint if exists brokers_account_type_check;
alter table public.brokers add constraint brokers_account_type_check check (account_type in ('individual','office','owner','developer'));
drop policy if exists "user requests to join" on public.brokers;
create policy "user requests to join" on public.brokers for insert to authenticated
  with check (user_id = auth.uid() and is_active = false and is_demo = false and plan_id is null and account_type in ('individual','owner','developer'));

create or replace function public.current_developer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.brokers where user_id = auth.uid() and is_active and suspended_at is null and account_type = 'developer' limit 1
$$;
revoke execute on function public.current_developer_id() from public, anon;
grant execute on function public.current_developer_id() to authenticated;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.brokers(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 150),
  description text check (description is null or char_length(description) <= 5000),
  city text not null,
  area text not null,
  address text check (address is null or char_length(address) <= 300),
  lat double precision,
  lng double precision,
  images text[] not null default '{}' check (cardinality(images) <= 12),
  payment_plans text check (payment_plans is null or char_length(payment_plans) <= 2000),
  delivery_date text check (delivery_date is null or char_length(delivery_date) <= 100),
  amenities text[] not null default '{}' check (cardinality(amenities) <= 30),
  -- 'approved' = visible on the site; admins can set 'rejected' to hide a project.
  review_status public.review_status not null default 'approved',
  review_note text,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_developer_idx on public.projects (developer_id);
grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;

create policy "approved projects public" on public.projects for select to anon, authenticated
  using (review_status = 'approved' and exists (select 1 from public.brokers b where b.id = developer_id and b.is_active and b.suspended_at is null));
create policy "developer reads own projects" on public.projects for select to authenticated
  using (developer_id = public.current_developer_id());
create policy "developer inserts own projects" on public.projects for insert to authenticated
  with check (developer_id = public.current_developer_id());
create policy "developer updates own projects" on public.projects for update to authenticated
  using (developer_id = public.current_developer_id()) with check (developer_id = public.current_developer_id());
create policy "developer deletes own projects" on public.projects for delete to authenticated
  using (developer_id = public.current_developer_id());
create policy "admin manages projects" on public.projects for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.projects_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null) then
    if tg_op = 'INSERT' then
      new.review_status := 'approved';
      new.review_note := null;
      new.is_featured := false;
    else
      -- A project the admin hid goes back to review when the developer edits it.
      new.review_status := case when old.review_status = 'rejected' then 'pending' else old.review_status end;
      new.review_note := old.review_note;
      new.is_featured := old.is_featured;
      new.developer_id := old.developer_id;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.projects_guard() from public, anon, authenticated;
create trigger projects_guard before insert or update on public.projects for each row execute function public.projects_guard();

create table public.project_units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text check (code is null or char_length(code) <= 50),
  unit_type text not null check (char_length(unit_type) between 2 and 50),
  size numeric not null default 0 check (size >= 0),
  rooms integer check (rooms is null or rooms between 0 and 50),
  baths integer check (baths is null or baths between 0 and 50),
  floor text check (floor is null or char_length(floor) <= 50),
  price numeric check (price is null or price >= 0),
  status text not null default 'available' check (status in ('available','reserved','sold','unavailable')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);
create index project_units_project_idx on public.project_units (project_id);
grant select on public.project_units to anon, authenticated;
grant insert, update, delete on public.project_units to authenticated;
grant all on public.project_units to service_role;
alter table public.project_units enable row level security;

create policy "units of visible projects public" on public.project_units for select to anon, authenticated
  using (exists (select 1 from public.projects p where p.id = project_id));
create policy "developer manages own units" on public.project_units for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.developer_id = public.current_developer_id()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.developer_id = public.current_developer_id()));
create policy "admin manages units" on public.project_units for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- History of unit price/status changes (item 16).
create table public.project_unit_history (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.project_units(id) on delete cascade,
  changed_by uuid,
  old_price numeric,
  new_price numeric,
  old_status text,
  new_status text,
  created_at timestamptz not null default now()
);
create index project_unit_history_unit_idx on public.project_unit_history (unit_id, created_at desc);
grant select on public.project_unit_history to authenticated;
grant all on public.project_unit_history to service_role;
alter table public.project_unit_history enable row level security;
create policy "developer reads own unit history" on public.project_unit_history for select to authenticated
  using (exists (select 1 from public.project_units u join public.projects p on p.id = u.project_id where u.id = unit_id and p.developer_id = public.current_developer_id()));
create policy "admin reads unit history" on public.project_unit_history for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create or replace function public.project_units_track()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.project_id := old.project_id;
    if new.price is distinct from old.price or new.status is distinct from old.status then
      insert into public.project_unit_history (unit_id, changed_by, old_price, new_price, old_status, new_status)
      values (new.id, auth.uid(), old.price, new.price, old.status, new.status);
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.project_units_track() from public, anon, authenticated;
create trigger project_units_track before update on public.project_units for each row execute function public.project_units_track();

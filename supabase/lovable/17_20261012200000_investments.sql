-- Value Aqar — Lovable apply file 17 of 26 (source: supabase/migrations/20261012200000_investments.sql).
-- The storage bucket insert was removed on purpose: the bucket is created with Lovable's storage tool.
-- Apply this whole file as one migration, exactly as written.

-- Items 40–42: investment opportunities (confidential big deals), curated "special price" listings, medical malls.

-- ===================== 40) Investment opportunities =====================
create table public.investment_opportunities (
  id uuid primary key default gen_random_uuid(),
  opp_no bigint generated always as identity unique,
  title text not null check (char_length(title) between 5 and 150),
  kind text not null check (kind in ('development_land','running_business','partnership','usufruct','leased_asset')),
  activity text not null check (char_length(activity) between 2 and 60),        -- mall, hotel, gas station, compound…
  deal_kind text not null check (deal_kind in ('full_sale','share_sale','partnership','usufruct','funding')),
  city text not null,
  area text not null,
  land_area numeric check (land_area is null or land_area > 0),
  built_area numeric check (built_area is null or built_area > 0),
  investment_min numeric check (investment_min is null or investment_min > 0),   -- null = price on request
  investment_max numeric check (investment_max is null or investment_max > 0),
  offered_share numeric check (offered_share is null or (offered_share > 0 and offered_share <= 100)),
  expected_return numeric check (expected_return is null or (expected_return > 0 and expected_return < 200)),  -- % a year, approximate
  teaser text not null check (char_length(teaser) between 20 and 800),          -- public summary
  images text[] not null default '{}' check (cardinality(images) <= 8),
  -- Confidential: shown only to admins/staff, the submitter and investors granted access.
  details text check (details is null or char_length(details) <= 8000),
  location_note text check (location_note is null or char_length(location_note) <= 300),
  licenses text check (licenses is null or char_length(licenses) <= 1000),
  submitted_by uuid default auth.uid(),
  broker_id uuid references public.brokers(id) on delete set null,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected','closed')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (investment_max is null or investment_min is null or investment_max >= investment_min)
);
create index investment_opps_status_idx on public.investment_opportunities (review_status, is_featured desc, created_at desc);
alter table public.investment_opportunities enable row level security;
-- Column-level access: the public part only; confidential columns via opportunity_private().
revoke all on public.investment_opportunities from anon, authenticated;
grant select (id, opp_no, title, kind, activity, deal_kind, city, area, land_area, built_area, investment_min, investment_max,
              offered_share, expected_return, teaser, images, review_status, is_featured, created_at, updated_at)
  on public.investment_opportunities to anon, authenticated;
grant insert (title, kind, activity, deal_kind, city, area, land_area, built_area, investment_min, investment_max, offered_share,
              expected_return, teaser, images, details, location_note, licenses)
  on public.investment_opportunities to authenticated;
grant update on public.investment_opportunities to authenticated;
grant all on public.investment_opportunities to service_role;

create policy "approved opportunities are public" on public.investment_opportunities for select to anon, authenticated
  using (review_status = 'approved');
create policy "submitter sees own opportunities" on public.investment_opportunities for select to authenticated
  using (submitted_by = auth.uid());
create policy "admin and staff see all opportunities" on public.investment_opportunities for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.is_staff());
create policy "signed-in users submit opportunities" on public.investment_opportunities for insert to authenticated
  with check (auth.uid() is not null);
create policy "submitter edits own opportunity" on public.investment_opportunities for update to authenticated
  using (submitted_by = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (submitted_by = auth.uid() or public.has_role(auth.uid(), 'admin'));

create or replace function public.investment_opportunities_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare is_admin boolean := public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'INSERT' then
    new.submitted_by := auth.uid();
    new.broker_id := public.current_broker_id();
    if not is_admin then new.review_status := 'pending'; new.review_note := null; new.is_featured := false; end if;
  else
    new.submitted_by := old.submitted_by; new.broker_id := old.broker_id;
    if not is_admin then
      new.is_featured := old.is_featured; new.review_note := old.review_note;
      -- Every change by the submitter goes back to review (except closing it).
      new.review_status := case when new.review_status = 'closed' then 'closed' else 'pending' end;
    elsif new.review_status = 'rejected' and coalesce(trim(new.review_note), '') = '' then
      raise exception 'اكتب سبب الرفض' using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.investment_opportunities_guard() from public, anon, authenticated;
create trigger investment_opportunities_guard before insert or update on public.investment_opportunities
  for each row execute function public.investment_opportunities_guard();

-- Full rows (incl. review note and confidential fields) for admins / staff, and for submitters' own opportunities.
create or replace function public.admin_opportunities()
returns setof public.investment_opportunities language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or public.is_staff()) then raise exception 'غير مصرح لك' using errcode = '42501'; end if;
  return query select * from public.investment_opportunities order by created_at desc;
end $$;
revoke execute on function public.admin_opportunities() from public, anon;
grant execute on function public.admin_opportunities() to authenticated;
create or replace function public.my_opportunities()
returns setof public.investment_opportunities language sql stable security definer set search_path = public as $$
  select * from public.investment_opportunities where submitted_by = auth.uid() order by created_at desc
$$;
revoke execute on function public.my_opportunities() from public, anon;
grant execute on function public.my_opportunities() to authenticated;

-- Who asked for full details, and whether access was granted.
create table public.investment_requests (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.investment_opportunities(id) on delete cascade,
  investor_id uuid not null default auth.uid(),
  name text not null check (char_length(name) between 2 and 100),
  budget numeric check (budget is null or budget > 0),
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  lead_id uuid references public.leads(id) on delete set null,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (opportunity_id, investor_id)
);
grant select, insert on public.investment_requests to authenticated;
grant update on public.investment_requests to authenticated;
grant all on public.investment_requests to service_role;
alter table public.investment_requests enable row level security;
create policy "investor requests details of a public opportunity" on public.investment_requests for insert to authenticated
  with check (investor_id = auth.uid() and status = 'pending'
    and exists (select 1 from public.investment_opportunities o where o.id = opportunity_id and o.review_status = 'approved'));
create policy "investor sees own requests" on public.investment_requests for select to authenticated using (investor_id = auth.uid());
create policy "admin and staff manage requests" on public.investment_requests for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.is_staff()) with check (public.has_role(auth.uid(), 'admin') or public.is_staff());

-- Confidential part: admins/staff, the submitter, and investors whose request was approved.
create or replace function public.opportunity_private(_id uuid)
returns table (details text, location_note text, licenses text)
language sql stable security definer set search_path = public as $$
  select o.details, o.location_note, o.licenses from public.investment_opportunities o
  where o.id = _id and (
    public.has_role(auth.uid(), 'admin') or public.is_staff() or o.submitted_by = auth.uid()
    or exists (select 1 from public.investment_requests r where r.opportunity_id = o.id and r.investor_id = auth.uid() and r.status = 'approved'))
$$;
revoke execute on function public.opportunity_private(uuid) from public, anon;
grant execute on function public.opportunity_private(uuid) to authenticated;

-- Private documents: investment-docs/<opportunity id>/... — same access as the confidential part.
create policy "investment docs for people with access" on storage.objects for select to authenticated
  using (bucket_id = 'investment-docs' and exists (select 1 from public.opportunity_private(((storage.foldername(name))[1])::uuid)));
create policy "submitter or admin uploads investment docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'investment-docs' and exists (
    select 1 from public.investment_opportunities o where o.id::text = (storage.foldername(name))[1]
      and (o.submitted_by = auth.uid() or public.has_role(auth.uid(), 'admin'))));

-- Investors register their budget and interests to hear about new opportunities.
create table public.investor_profiles (
  user_id uuid primary key default auth.uid(),
  name text not null check (char_length(name) between 2 and 100),
  budget_min numeric check (budget_min is null or budget_min > 0),
  budget_max numeric check (budget_max is null or budget_max > 0),
  kinds text[] not null default '{}',
  areas text[] not null default '{}',
  notify boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.investor_profiles to authenticated;
grant all on public.investor_profiles to service_role;
alter table public.investor_profiles enable row level security;
create policy "investor manages own profile" on public.investor_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admin and staff read investors" on public.investor_profiles for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.is_staff());

-- Leads: investment requests are their own kind, linked to the opportunity, handled by Value Aqar (never auto-routed).
alter table public.leads drop constraint if exists leads_kind_check;
alter table public.leads add constraint leads_kind_check check (kind in ('request','inquiry','listing','investment'));
alter table public.leads add column if not exists opportunity_id uuid references public.investment_opportunities(id) on delete set null;

create or replace function public.leads_pick_company()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.routing_rules%rowtype; pick uuid;
begin
  if new.assigned_broker_id is not null or new.assigned_staff_id is not null or new.kind = 'investment' then return new; end if;
  for r in select * from public.routing_rules where is_active order by priority, created_at loop
    continue when r.areas is not null and not (coalesce(new.area, '') = any(r.areas));
    continue when r.property_types is not null and not (coalesce(new.property_type, '') = any(r.property_types));
    continue when r.kinds is not null and not (new.kind = any(r.kinds));
    continue when r.sources is not null and not (new.source = any(r.sources));
    select b.id into pick
    from unnest(r.broker_ids) as x(id) join public.brokers b on b.id = x.id
    where b.is_active and b.suspended_at is null
    order by (select max(a.created_at) from public.lead_assignments a where a.broker_id = b.id) nulls first, b.created_at
    limit 1;
    if pick is not null then
      new.assigned_broker_id := pick;
      new.routed_rule_id := r.id;
      return new;
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.leads_pick_company() from public, anon, authenticated;

create or replace function public.investment_requests_flow()
returns trigger language plpgsql security definer set search_path = public as $$
declare o public.investment_opportunities%rowtype; ph text; lid uuid;
begin
  select * into o from public.investment_opportunities where id = new.opportunity_id;
  if tg_op = 'INSERT' then
    select public.normalize_phone(phone) into ph from auth.users where id = new.investor_id;
    -- A normal website lead (kind 'investment'): never auto-routed, handled by Value Aqar.
    insert into public.leads (name, phone, kind, budget, details, opportunity_id)
    values (new.name, coalesce(ph, '0000000000'), 'investment', new.budget,
            left('طلب تفاصيل الفرصة INV-' || lpad(o.opp_no::text, 6, '0') || ' — ' || o.title || coalesce(E'\n' || new.message, ''), 1000), o.id)
    returning id into lid;
    update public.investment_requests set lead_id = lid where id = new.id;
    perform public.notify_team('admin', 'مستثمر طالب تفاصيل فرصة',
      new.name || ' — INV-' || lpad(o.opp_no::text, 6, '0') || ' ' || o.title, lid, '/leads/' || lid);
  elsif new.status is distinct from old.status and new.status in ('approved','rejected') then
    perform public.notify_user(new.investor_id, 'request_status',
      case new.status when 'approved' then 'اتفتحت لك تفاصيل الفرصة الاستثمارية' else 'طلب تفاصيل الفرصة ما اتقبلش' end,
      'INV-' || lpad(o.opp_no::text, 6, '0') || ' — ' || o.title, o.id, '/investments/' || o.id);
  end if;
  return new;
end $$;
revoke execute on function public.investment_requests_flow() from public, anon, authenticated;
create trigger investment_requests_flow after insert or update on public.investment_requests
  for each row execute function public.investment_requests_flow();

create or replace function public.investment_requests_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.opportunity_id := old.opportunity_id; new.investor_id := old.investor_id; new.lead_id := coalesce(new.lead_id, old.lead_id);
    if new.status is distinct from old.status then new.decided_by := auth.uid(); new.decided_at := now(); end if;
  end if;
  return new;
end $$;
revoke execute on function public.investment_requests_guard() from public, anon, authenticated;
create trigger investment_requests_guard before update on public.investment_requests for each row execute function public.investment_requests_guard();

-- New submissions reach admins/staff; an approved opportunity reaches matching investors and the submitter.
create or replace function public.notify_on_opportunity()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv record; tag text := 'INV-' || lpad(new.opp_no::text, 6, '0') || ' — ' || new.title;
begin
  if tg_op = 'INSERT' or (new.review_status = 'pending' and old.review_status is distinct from 'pending') then
    perform public.notify_team('admin', 'فرصة استثمارية مستنية مراجعة', tag, new.id, '/admin');
  end if;
  if new.review_status in ('approved','rejected') and (tg_op = 'INSERT' or old.review_status is distinct from new.review_status) and new.submitted_by is not null then
    perform public.notify_user(new.submitted_by, 'request_status',
      case new.review_status when 'approved' then 'فرصتك الاستثمارية اتنشرت' else 'فرصتك الاستثمارية ما اتقبلتش' end,
      tag || coalesce(' — ' || new.review_note, ''), new.id, '/investments/' || new.id);
  end if;
  if new.review_status = 'approved' and (tg_op = 'INSERT' or old.review_status is distinct from 'approved') then
    for inv in select p.user_id from public.investor_profiles p
      where p.notify and p.user_id is distinct from new.submitted_by
        and (cardinality(p.kinds) = 0 or new.kind = any(p.kinds))
        and (cardinality(p.areas) = 0 or new.city = any(p.areas) or new.area = any(p.areas))
        and (p.budget_max is null or new.investment_min is null or new.investment_min <= p.budget_max)
        and (p.budget_min is null or new.investment_max is null or new.investment_max >= p.budget_min) loop
      perform public.notify_user(inv.user_id, 'saved_search_match', 'فرصة استثمارية جديدة تناسبك', tag, new.id, '/investments/' || new.id);
    end loop;
  end if;
  return new;
end $$;
revoke execute on function public.notify_on_opportunity() from public, anon, authenticated;
create trigger investment_opportunities_notify after insert or update on public.investment_opportunities
  for each row execute function public.notify_on_opportunity();

do $$
declare t text;
begin
  foreach t in array array['investment_opportunities','investment_requests','investor_profiles'] loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- ===================== 41) Curated "special price" listings =====================
alter table public.properties
  add column if not exists is_highlight boolean not null default false,
  add column if not exists highlight_reason text check (highlight_reason is null or char_length(highlight_reason) <= 160),
  add column if not exists highlight_yield numeric check (highlight_yield is null or (highlight_yield > 0 and highlight_yield < 100)),
  add column if not exists highlight_requested_at timestamptz;

-- Only admins pick highlights; a company can only ask (request time), which notifies admins.
create or replace function public.properties_highlight_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null) then
    if tg_op = 'INSERT' then
      new.is_highlight := false; new.highlight_reason := null; new.highlight_yield := null; new.highlight_requested_at := null;
    else
      new.is_highlight := old.is_highlight; new.highlight_reason := old.highlight_reason; new.highlight_yield := old.highlight_yield;
      if new.highlight_requested_at is distinct from old.highlight_requested_at then
        new.highlight_requested_at := case when new.highlight_requested_at is null then null else now() end;
        if new.highlight_requested_at is not null then
          perform public.notify_admins('admin', 'طلب ترشيح عرض بسعر مميز', new.title, new.id, '/admin');
        end if;
      end if;
    end if;
  elsif new.is_highlight and coalesce(trim(new.highlight_reason), '') = '' then
    raise exception 'اكتب سبب إن العرض ده مميز (سطر واحد)' using errcode = '23514';
  end if;
  if new.is_highlight then new.highlight_requested_at := null; end if;
  return new;
end $$;
revoke execute on function public.properties_highlight_guard() from public, anon, authenticated;
drop trigger if exists properties_highlight_guard on public.properties;
create trigger properties_highlight_guard before insert or update on public.properties for each row execute function public.properties_highlight_guard();

-- ===================== 42) Medical malls =====================
alter table public.malls add column if not exists kind text not null default 'commercial'
  check (kind in ('commercial','medical','administrative','mixed'));

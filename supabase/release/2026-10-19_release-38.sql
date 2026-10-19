-- فاليو عقار — إصدار 38: صلاحيات الموظفين (لكل موظف، لكل قسم: مخفي / يشوف / يعدّل).
-- * جدول staff_permissions، ودوال staff_can و my_permissions.
-- * العملاء (بتوعه بس / الكل)، العمولات والاتفاقيات والصفقات (عرض بس)، ومحادثات الواتساب.
-- * كل قسم بيشتغل في قاعدة البيانات: «يعدّل» بيفتح الكتابة على جداوله، و«يشوف» القراءة، والإعدادات كل موظف يغيّر أعمدة قسمه بس.
-- ⚠️ الموظفين الحاليين بيبدأوا من غير أي صلاحيات لحد ما الأدمن يحددها من «فريق فاليو عقار».
-- إضافة وتغيير صلاحيات بس، مفيش بيانات بتتمسح. ينفع يتشغل تاني. بعد إصدار 36 و37.
--   20261019300000_staff-permissions.sql
--   20261019400000_staff-permissions-sections.sql

begin;
-- Staff permissions, per employee and per section (phase 1).
-- * staff_permissions: one row per employee; perms = {"<section>": "view" | "edit", "leads_scope": "mine" | "all"}.
--   Sections are the admin tabs and staff pages (leads, wa_inbox, deals, commissions, review, svc_requests, …).
--   No row / missing section = hidden. Only the admin edits them; an employee reads their own.
-- * staff_can(section, 'view' | 'edit'): true for the admin; for staff, what the admin granted.
-- * my_permissions(): what the signed-in user may open (the admin gets {"*": "edit"}).
-- Phase 1 also enforces the sensitive areas in the database: customer leads (scope mine / all), commissions and
-- agreements (view only), deals (staff never create or change them), and the WhatsApp inbox.
-- Existing employees start with NO permissions until the admin grants them. Additive; re-runnable.

create table if not exists public.staff_permissions (
  user_id uuid primary key,
  perms jsonb not null default '{}'::jsonb check (jsonb_typeof(perms) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.staff_permissions enable row level security;
drop policy if exists "admin manages staff permissions" on public.staff_permissions;
create policy "admin manages staff permissions" on public.staff_permissions for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "staff reads own permissions" on public.staff_permissions;
create policy "staff reads own permissions" on public.staff_permissions for select to authenticated using (user_id = auth.uid());
revoke all on public.staff_permissions from anon;
grant select, insert, update, delete on public.staff_permissions to authenticated;

create or replace function public.staff_can(_section text, _need text default 'view')
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when public.has_role(auth.uid(), 'admin') then true
    when not public.is_staff() then false
    else coalesce((
      select case _need when 'edit' then p.perms ->> _section = 'edit' else p.perms ->> _section in ('view', 'edit') end
      from public.staff_permissions p where p.user_id = auth.uid()), false)
  end
$$;
revoke execute on function public.staff_can(text, text) from public, anon;
grant execute on function public.staff_can(text, text) to authenticated;

-- Leads: «all» or only the ones assigned to this employee.
create or replace function public.staff_leads_all()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin')
      or coalesce((select p.perms ->> 'leads_scope' = 'all' from public.staff_permissions p where p.user_id = auth.uid()), false)
$$;
revoke execute on function public.staff_leads_all() from public, anon;
grant execute on function public.staff_leads_all() to authenticated;

create or replace function public.my_permissions()
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then '{}'::jsonb
    when public.has_role(auth.uid(), 'admin') then '{"*": "edit", "leads_scope": "all"}'::jsonb
    when public.is_staff() then coalesce((select p.perms from public.staff_permissions p where p.user_id = auth.uid()), '{}'::jsonb)
    else '{}'::jsonb
  end
$$;
revoke execute on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;

-- Customer leads.
drop policy if exists "staff reads leads" on public.leads;
create policy "staff reads leads" on public.leads for select to authenticated
  using (public.staff_can('leads', 'view') and (public.staff_leads_all() or assigned_staff_id = auth.uid()));
drop policy if exists "staff updates leads" on public.leads;
create policy "staff updates leads" on public.leads for update to authenticated
  using (public.staff_can('leads', 'edit') and (public.staff_leads_all() or assigned_staff_id = auth.uid()))
  with check (public.staff_can('leads', 'edit') and (public.staff_leads_all() or assigned_staff_id = auth.uid()));

-- Money: staff may only look, and only when granted.
drop policy if exists "staff reads commissions" on public.commissions;
create policy "staff reads commissions" on public.commissions for select to authenticated using (public.staff_can('commissions', 'view'));
drop policy if exists "staff reads agreements" on public.company_agreements;
create policy "staff reads agreements" on public.company_agreements for select to authenticated using (public.staff_can('commissions', 'view'));

drop policy if exists "staff reads deals" on public.deals;
create policy "staff reads deals" on public.deals for select to authenticated using (public.staff_can('deals', 'view'));
drop policy if exists "staff never writes deals" on public.deals;
create policy "staff never writes deals" on public.deals as restrictive for insert to authenticated
  with check (not public.is_staff() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "staff never changes deals" on public.deals;
create policy "staff never changes deals" on public.deals as restrictive for update to authenticated
  using (not public.is_staff() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "staff never deletes deals" on public.deals;
create policy "staff never deletes deals" on public.deals as restrictive for delete to authenticated
  using (not public.is_staff() or public.has_role(auth.uid(), 'admin'));
-- Staff without the deals permission don't see them through a visible lead either.
drop policy if exists "staff sees deals only when granted" on public.deals;
create policy "staff sees deals only when granted" on public.deals as restrictive for select to authenticated
  using (not public.is_staff() or public.staff_can('deals', 'view'));

-- WhatsApp inbox (release 36), only when that table exists.
do $$
begin
  if to_regclass('public.wa_conversations') is not null then
    execute 'drop policy if exists "team reads wa conversations" on public.wa_conversations';
    execute 'create policy "team reads wa conversations" on public.wa_conversations for select to authenticated using (public.staff_can(''wa_inbox'', ''view''))';
    execute 'drop policy if exists "team reads wa messages" on public.wa_messages';
    execute 'create policy "team reads wa messages" on public.wa_messages for select to authenticated using (public.staff_can(''wa_inbox'', ''view''))';
    execute $f$
      create or replace function public.wa_mark_read(_phone text)
      returns void language plpgsql security definer set search_path = public as $b$
      begin
        if not public.staff_can('wa_inbox', 'view') then raise exception 'not allowed' using errcode = '42501'; end if;
        update public.wa_conversations set unread = 0 where phone = _phone;
      end $b$;
    $f$;
  end if;
end $$;

-- Staff permissions, phase 2: every grantable section works in the database too (release 38).
-- * «يعدّل» on a section opens writing on its tables; «يشوف» opens reading where the table isn't public.
--   These are extra policies next to the admin's; the admin keeps everything (staff_can() is true for the admin).
-- * Admin-only checks inside functions now ask staff_can(<section>) (listed below), so a granted employee can use
--   the same buttons. Money (deals, commissions, payouts) and the team page stay admin-only.
-- * app_settings: an employee only changes the columns of the sections they hold (guard trigger).
-- Re-runnable.

do $$
declare r record;
begin
  for r in select * from (values ('locations', 'locations'), ('malls', 'malls'), ('compounds', 'compounds'), ('projects', 'projects'), ('projects', 'project_units'), ('investments', 'investment_opportunities'), ('investments', 'investment_requests'), ('svc_requests', 'service_requests'), ('svc_providers', 'service_providers'), ('svc_providers', 'service_provider_photos'), ('svc_providers', 'service_subscriptions'), ('svc_plans', 'service_plans'), ('svc_reviews', 'service_reviews'), ('brokers', 'company_members'), ('brokers', 'subscriptions'), ('brokers', 'owner_plan_grants'), ('plans', 'plans'), ('routing', 'routing_rules'), ('tasks', 'tasks'), ('assistant', 'assistant_settings')) v(section, tbl) loop
    if to_regclass('public.' || r.tbl) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', 'staff reads (' || r.section || ')', r.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (public.staff_can(%L, ''view''))', 'staff reads (' || r.section || ')', r.tbl, r.section);
    execute format('drop policy if exists %I on public.%I', 'staff edits (' || r.section || ')', r.tbl);
    execute format('create policy %I on public.%I for all to authenticated using (public.staff_can(%L, ''edit'')) with check (public.staff_can(%L, ''edit''))', 'staff edits (' || r.section || ')', r.tbl, r.section, r.section);
  end loop;
end $$;

do $$ begin if to_regclass('public.audit_log') is not null then
  drop policy if exists "staff reads (audit)" on public.audit_log;
  create policy "staff reads (audit)" on public.audit_log for select to authenticated using (public.staff_can('audit', 'view'));
end if; end $$;
do $$ begin if to_regclass('public.app_errors') is not null then
  drop policy if exists "staff reads (health)" on public.app_errors;
  create policy "staff reads (health)" on public.app_errors for select to authenticated using (public.staff_can('health', 'view'));
end if; end $$;
do $$ begin if to_regclass('public.job_runs') is not null then
  drop policy if exists "staff reads (health)" on public.job_runs;
  create policy "staff reads (health)" on public.job_runs for select to authenticated using (public.staff_can('health', 'view'));
end if; end $$;
do $$ begin if to_regclass('public.referrals') is not null then
  drop policy if exists "staff reads (referrals)" on public.referrals;
  create policy "staff reads (referrals)" on public.referrals for select to authenticated using (public.staff_can('referrals', 'view'));
end if; end $$;
drop policy if exists "staff clears errors (health)" on public.app_errors;
create policy "staff clears errors (health)" on public.app_errors for delete to authenticated using (public.staff_can('health', 'edit'));

drop policy if exists "staff reviews listings (review)" on public.properties;
create policy "staff reviews listings (review)" on public.properties for update to authenticated
  using (public.staff_can('review', 'edit')) with check (public.staff_can('review', 'edit'));
drop policy if exists "staff manages mall units (malls)" on public.properties;
create policy "staff manages mall units (malls)" on public.properties for all to authenticated
  using (category = 'mall' and public.staff_can('malls', 'edit')) with check (category = 'mall' and public.staff_can('malls', 'edit'));
drop policy if exists "staff manages industrial (industrial)" on public.properties;
create policy "staff manages industrial (industrial)" on public.properties for all to authenticated
  using (category = 'industrial' and public.staff_can('industrial', 'edit')) with check (category = 'industrial' and public.staff_can('industrial', 'edit'));
-- Accounts and companies: the same changes the admin makes (approve, suspend, plan…).
drop policy if exists "staff manages accounts (brokers)" on public.brokers;
create policy "staff manages accounts (brokers)" on public.brokers for update to authenticated
  using (public.staff_can('brokers', 'edit')) with check (public.staff_can('brokers', 'edit'));

drop policy if exists "staff edits settings" on public.app_settings;
create policy "staff edits settings" on public.app_settings for update to authenticated
  using (public.staff_can('announce', 'edit') or public.staff_can('closed', 'edit') or public.staff_can('wa', 'edit')
      or public.staff_can('app', 'edit') or public.staff_can('wa_inbox', 'edit') or public.staff_can('routing', 'edit') or public.staff_can('plans', 'edit'))
  with check (true);
create or replace function public.app_settings_staff_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text; o jsonb := to_jsonb(old); n jsonb := to_jsonb(new); sec text;
begin
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' or public.has_role(auth.uid(), 'admin') then return new; end if;
  for k in select jsonb_object_keys(n) loop
    if k in ('updated_at', 'updated_by') or (o -> k) is not distinct from (n -> k) then continue; end if;
    sec := case
      when k like 'announce%' then 'announce'
      when k like 'site_closed%' then 'closed'
      when k = 'floating_whatsapp' then 'wa'
      when k in ('ios_url', 'android_url') then 'app'
      when k like 'wa_bot%' then 'wa_inbox'
      when k in ('work_start_hour', 'work_end_hour') then 'routing'
      when k like 'featured_%price' then 'plans'
      else null end;
    if sec is null or not public.staff_can(sec, 'edit') then
      raise exception 'not allowed to change %', k using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists app_settings_staff_guard on public.app_settings;
create trigger app_settings_staff_guard before update on public.app_settings for each row execute function public.app_settings_staff_guard();

-- admin_brokers (was admin-only; from 20261011230000_contact-policy.sql)
create or replace function public.admin_brokers()
returns setof public.brokers language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staff_can('brokers', 'view') then
    raise exception 'غير مصرح لك' using errcode = '42501';
  end if;
  return query select * from public.brokers order by created_at desc;
end $$;

-- admin_opportunities (was admin-only; from 20261012200000_investments.sql)
create or replace function public.admin_opportunities()
returns setof public.investment_opportunities language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staff_can('investments', 'view') then raise exception 'غير مصرح لك' using errcode = '42501'; end if;
  return query select * from public.investment_opportunities order by created_at desc;
end $$;

-- admin_accounts (was admin-only; from 20261017200000_admin-accounts.sql)
create or replace function public.admin_accounts()
returns table (
  user_id uuid, email text, phone text, full_name text, created_at timestamptz, last_sign_in_at timestamptz,
  banned_until timestamptz, roles text[], broker_id uuid, broker_name text, account_type text, broker_active boolean,
  provider_id uuid, provider_name text, provider_status text, member_of text, listings integer, owner_listings integer,
  requests integer, favorites integer
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staff_can('accounts', 'view') then raise exception 'غير مصرح لك' using errcode = '42501'; end if;
  return query
  select u.id, u.email::text, u.phone::text,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')::text,
    u.created_at, u.last_sign_in_at, u.banned_until,
    coalesce((select array_agg(r.role::text order by r.role::text) from public.user_roles r where r.user_id = u.id), '{}'),
    b.id, b.name, b.account_type, b.is_active,
    sp.id, sp.name, sp.status,
    (select c.name from public.company_members m join public.brokers c on c.id = m.company_id
      where m.is_active and u.phone is not null and public.normalize_phone(m.phone) = public.normalize_phone(u.phone) limit 1),
    (select count(*)::int from public.properties p where b.id is not null and p.broker_id = b.id),
    (select count(*)::int from public.properties p join public.leads l on l.id = p.owner_lead_id
      where p.broker_id is null and u.phone is not null and l.phone_norm = public.normalize_phone(u.phone)),
    (select count(*)::int from public.leads l where l.customer_id = u.id),
    (select count(*)::int from public.favorites f where f.user_id = u.id)
  from auth.users u
  left join lateral (select * from public.brokers x where x.user_id = u.id order by x.created_at limit 1) b on true
  left join lateral (select * from public.service_providers y where y.user_id = u.id order by y.created_at limit 1) sp on true
  order by u.created_at desc;
end $$;

-- admin_delete_broker (was admin-only; from 20261017700000_delete-accounts.sql)
create or replace function public.admin_delete_broker(_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  b public.brokers%rowtype;
  keep boolean;
  r text;
begin
  if not public.staff_can('brokers', 'edit') then
    raise exception 'الحذف للإدارة بس' using errcode = '42501';
  end if;
  select * into b from public.brokers where id = _id;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if b.user_id is not null then
    raise exception 'login_first: امسح تسجيل الدخول الأول' using errcode = 'P0001';
  end if;

  keep := exists (select 1 from public.deals where broker_id = _id)
    or exists (select 1 from public.company_agreements where broker_id = _id)
    or exists (select 1 from public.referrals where referrer_id = _id or owner_id = _id)
    or exists (select 1 from public.payments where broker_id = _id);

  if keep then
    -- Kept for the money records only: off the site and out of every list, contact details cleared.
    update public.properties set review_status = 'draft', review_note = 'الحساب اتمسح من الإدارة' where broker_id = _id;
    update public.brokers set deleted_at = now(), is_active = false, suspended_at = coalesce(suspended_at, now()),
      phone = null, whatsapp = null, email = null, review_note = 'الحساب اتمسح من الإدارة'
    where id = _id;
    update public.company_members set is_active = false where company_id = _id;
    r := 'hidden';
  else
    perform public.admin_drop_property(p.id) from public.properties p where p.broker_id = _id;
    delete from public.brokers where id = _id;
    r := 'deleted';
  end if;

  insert into public.audit_log (actor, actor_label, table_name, row_id, action, changes)
  values (auth.uid(), 'admin_delete', 'broker', _id::text, case when r = 'deleted' then 'delete' else 'update' end,
          jsonb_build_object('result', r, 'name', b.name));
  return r;
end $$;

-- set_mall_images (was admin-only; from 20261017500000_mall-gallery.sql)
create or replace function public.set_mall_images(_mall uuid, _images text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  imgs text[] := coalesce(_images, '{}');
begin
  if not (
    public.staff_can('malls', 'edit')
    or (exists (select 1 from public.malls where id = _mall and developer_id is not null and developer_id = public.current_broker_id())
        and public.current_member_role() in ('owner', 'manager'))
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if cardinality(imgs) > 10 then raise exception 'max 10 photos' using errcode = '22023'; end if;
  if exists (select 1 from unnest(imgs) u where u !~ '^https://' or length(u) > 2000) then
    raise exception 'bad photo url' using errcode = '22023';
  end if;
  update public.malls set images = imgs, logo_url = imgs[1] where id = _mall;
end $$;

-- brokers_guard (was admin-only; from 20261011230000_contact-policy.sql)
create or replace function public.brokers_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_can('brokers', 'edit') and coalesce(auth.role(), '') <> 'service_role' then
    new.is_active := old.is_active;
    new.plan_id := old.plan_id;
    new.user_id := old.user_id;
    new.slug := old.slug;
    new.is_demo := old.is_demo;
    new.account_type := old.account_type;
    new.suspended_at := old.suspended_at;
    new.phone := old.phone;
    new.review_note := old.review_note;
    new.rejected_at := old.rejected_at;
    new.show_contact := old.show_contact;
  end if;
  if new.is_active then new.rejected_at := null; end if;
  new.updated_at := now();
  return new;
end $$;

-- merge_location (was admin-only; from 20261017100000_areas-installments-review.sql)
create or replace function public.merge_location(_from uuid, _to uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare f public.locations; t public.locations; fa text; ta text; n integer := 0; k integer;
begin
  if not public.staff_can('locations', 'edit') then raise exception 'غير مسموح' using errcode = '42501'; end if;
  select * into f from public.locations where id = _from;
  select * into t from public.locations where id = _to and status = 'approved';
  if f.id is null or t.id is null or f.id = t.id then raise exception 'اختار منطقة معتمدة مختلفة' using errcode = 'P0001'; end if;
  fa := coalesce(f.area, f.city); ta := coalesce(t.area, t.city);
  update public.properties set city = t.city, area = ta where city = f.city and area = fa;
  get diagnostics k = row_count; n := n + k;
  update public.compounds set city = t.city, area = t.area where city = f.city and coalesce(area, city) = fa;
  get diagnostics k = row_count; n := n + k;
  update public.projects set city = t.city, area = ta where city = f.city and area = fa;
  get diagnostics k = row_count; n := n + k;
  -- Areas picked by brokers and service providers (names only).
  if f.area is not null or not exists (select 1 from public.locations x where x.city = f.city and x.id <> f.id) then
    update public.brokers set areas = array_replace(areas, fa, ta) where fa = any(areas);
    update public.service_providers set areas = array_replace(areas, fa, ta) where fa = any(areas);
  end if;
  delete from public.locations where id = f.id;
  return n;
end $$;

-- compounds_track (was admin-only; from 20261013600000_compounds.sql)
create or replace function public.compounds_track()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_compound(new.id, null, 'created', 'إنشاء الكمبوند' || coalesce(' — ' || (select name from public.brokers where id = new.developer_id), ' — تديره فاليو عقار'));
    if new.developer_id is not null and not public.staff_can('compounds', 'edit') then
      perform public.notify_team('admin', 'كمبوند جديد', new.name || ' — ' || coalesce((select name from public.brokers where id = new.developer_id), ''), new.id, '/compounds/' || new.id);
    end if;
    return new;
  end if;
  if new.developer_id is distinct from old.developer_id then
    -- The old team belonged to the old owner.
    delete from public.compound_members where compound_id = new.id;
    perform public.log_compound(new.id, null, 'handover',
      case when new.developer_id is null then 'الكمبوند رجع لإدارة فاليو عقار'
           else 'تسليم الكمبوند لحساب المطور: ' || coalesce((select name from public.brokers where id = new.developer_id), '') end);
    if new.developer_id is not null then
      perform public.notify_company(new.developer_id, 'request_status', 'الكمبوند بقى في حسابك',
        new.name || ' — تقدر تديره وتوزّع فريقك عليه من «كمبونداتي».', new.id, '/my-compounds/' || new.id);
    end if;
  elsif (new.name, new.description, new.city, new.area, new.payment_plans, new.down_payment_pct, new.installment_years,
         new.delivery_date, new.delivery_year, new.amenities, new.images, new.logo_url, new.location, new.lat, new.lng, new.developer_name)
     is distinct from
        (old.name, old.description, old.city, old.area, old.payment_plans, old.down_payment_pct, old.installment_years,
         old.delivery_date, old.delivery_year, old.amenities, old.images, old.logo_url, old.location, old.lat, old.lng, old.developer_name) then
    perform public.log_compound(new.id, null, 'details', 'تعديل بيانات الكمبوند');
  end if;
  if new.review_status is distinct from old.review_status or new.is_active is distinct from old.is_active then
    perform public.log_compound(new.id, null, 'details',
      case when new.is_active and new.review_status = 'approved' then 'الكمبوند ظاهر على الموقع'
           when new.review_status = 'rejected' then 'الإدارة خفت الكمبوند' || coalesce(': ' || new.review_note, '')
           when new.review_status = 'pending' then 'الكمبوند رجع للمراجعة'
           else 'الكمبوند مخفي من الموقع' end);
    if new.review_status = 'rejected' and old.review_status is distinct from 'rejected' and new.developer_id is not null then
      perform public.notify_company(new.developer_id, 'request_status', 'الإدارة خفت كمبوند', new.name || coalesce(' — ' || new.review_note, ''), new.id, '/my-compounds/' || new.id);
    end if;
  end if;
  return new;
end $$;

-- properties_listing_term (was admin-only; from 20261014100000_plans-and-providers.sql)
create or replace function public.properties_listing_term()
returns trigger language plpgsql security definer set search_path = public as $$
declare privileged boolean := public.staff_can('review', 'edit') or public.staff_can('malls', 'edit') or public.staff_can('industrial', 'edit') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null;
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

-- admin_delete (was admin-only; from 20261017600000_manage-everything.sql)
create or replace function public.admin_delete(_kind text, _id uuid, _target uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  r text;
  label text;
begin
  if not (public.staff_can(case _kind
      when 'property' then 'review' when 'mall' then 'malls' when 'project' then 'projects' when 'opportunity' then 'investments'
      when 'lead' then 'leads' when 'service_request' then 'svc_requests' when 'service_provider' then 'svc_providers'
      when 'service_plan' then 'svc_plans' when 'location' then 'locations' else '-' end, 'edit')
    or (_kind = 'property' and (public.staff_can('malls', 'edit') or public.staff_can('industrial', 'edit')))) then
    raise exception 'الحذف للإدارة بس' using errcode = '42501';
  end if;

  if _kind = 'property' then
    if not exists (select 1 from public.properties where id = _id) then raise exception 'not found' using errcode = 'P0002'; end if;
    r := public.admin_drop_property(_id);

  elsif _kind = 'mall' then
    select name into label from public.malls where id = _id;
    if label is null then raise exception 'not found' using errcode = 'P0002'; end if;
    if _target is not null then
      if _target = _id or not exists (select 1 from public.malls where id = _target) then
        raise exception 'المول اللي هتنقل له الوحدات مش موجود' using errcode = '22023';
      end if;
      update public.properties set mall_id = _target, area = (select name from public.malls where id = _target) where mall_id = _id;
    else
      perform public.admin_drop_property(p.id) from public.properties p where p.mall_id = _id;
    end if;
    delete from public.malls where id = _id;
    r := 'deleted';

  elsif _kind = 'project' then
    if not exists (select 1 from public.projects where id = _id) then raise exception 'not found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.leads l join public.deals d on d.lead_id = l.id where l.project_id = _id) then
      update public.projects set review_status = 'rejected', review_note = 'اتشال بواسطة الإدارة (عليه صفقة)' where id = _id;
      r := 'hidden';
    else
      delete from public.projects where id = _id;
      r := 'deleted';
    end if;

  elsif _kind = 'opportunity' then
    if not exists (select 1 from public.investment_opportunities where id = _id) then raise exception 'not found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.leads l join public.deals d on d.lead_id = l.id where l.opportunity_id = _id) then
      update public.investment_opportunities set review_status = 'closed' where id = _id;
      r := 'hidden';
    else
      delete from public.investment_opportunities where id = _id;
      r := 'deleted';
    end if;

  elsif _kind = 'lead' then
    if not exists (select 1 from public.leads where id = _id) then raise exception 'not found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.deals where lead_id = _id) then
      raise exception 'العميل ده عليه صفقة — مينفعش يتمسح عشان سجل العمولات. اقفله بدل كده.' using errcode = 'P0001';
    end if;
    -- A customer's owner listing keeps its property (the link is cleared by the foreign key).
    delete from public.leads where id = _id;
    r := 'deleted';

  elsif _kind = 'service_request' then
    delete from public.service_requests where id = _id;
    if not found then raise exception 'not found' using errcode = 'P0002'; end if;
    r := 'deleted';

  elsif _kind = 'service_provider' then
    if not exists (select 1 from public.service_providers where id = _id) then raise exception 'not found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.service_requests where _id in (assigned_provider_id, offer_provider_id, target_provider_id))
       or exists (select 1 from public.service_subscriptions where provider_id = _id) then
      update public.service_providers set status = 'suspended' where id = _id;
      r := 'deactivated';
    else
      delete from public.service_providers where id = _id;
      r := 'deleted';
    end if;

  elsif _kind = 'service_plan' then
    if not exists (select 1 from public.service_plans where id = _id) then raise exception 'not found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.service_subscriptions where plan_id = _id) then
      update public.service_plans set is_active = false where id = _id;
      r := 'deactivated';
    else
      delete from public.service_plans where id = _id;
      r := 'deleted';
    end if;

  elsif _kind = 'location' then
    delete from public.locations where id = _id;
    if not found then raise exception 'not found' using errcode = 'P0002'; end if;
    r := 'deleted';

  else
    raise exception 'unknown kind %', _kind using errcode = '22023';
  end if;

  insert into public.audit_log (actor, actor_label, table_name, row_id, action, changes)
  values (auth.uid(), 'admin_delete', _kind, _id::text, case when r = 'deleted' then 'delete' else 'update' end,
          jsonb_build_object('result', r) || case when _target is not null then jsonb_build_object('moved_to', _target) else '{}'::jsonb end);
  return r;
end $$;
commit;

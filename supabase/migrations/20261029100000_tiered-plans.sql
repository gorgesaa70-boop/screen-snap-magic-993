-- Paid plans in 3 tiers for each kind of account (owner, individual broker, company, developer):
-- 1) New plans with counts sized for the Borg El Arab market and perks that grow with the tier (support, «متحقق»,
--    homepage pin, «عرض للكل», WhatsApp broadcast, posts/videos, Excel, banner, stats). Old plans stay for history
--    but are no longer offered.
-- 2) First month free for everyone on the middle tier: every account active today, every account activated later,
--    and every owner phone on its first listing. After that, an account without a running plan has its listings
--    hidden (never deleted) until it subscribes — at read time, so it doesn't wait for a scheduled job.
-- 3) Longer terms cost less: 3 / 6 / 12 months with a % discount set by the admin.
-- 4) Until the payment gateway opens: the account asks for a plan and a term, the team activates it with one click.
-- 5) Limits: listings per plan (as before), team members for companies, projects/compounds for developers.
-- Listings up today stay up: they get the free month, and nothing is hidden by this release.

-- ───────────────────────── 1) Plan perks ─────────────────────────
alter table public.plans drop constraint if exists plans_audience_check;
alter table public.plans add constraint plans_audience_check check (audience in ('broker','owner','owner_rent','owner_summer','individual','company','developer'));
alter table public.plans
  add column if not exists tier smallint check (tier is null or tier between 1 and 3),
  add column if not exists support_level text not null default 'normal' check (support_level in ('normal','priority','dedicated')),
  add column if not exists verified_badge boolean not null default false,
  add column if not exists pin_days smallint not null default 0 check (pin_days between 0 and 31),
  add column if not exists spotlights_per_month smallint not null default 0 check (spotlights_per_month between 0 and 31),
  add column if not exists whatsapp_broadcast boolean not null default false,
  add column if not exists posts_per_month smallint not null default 0 check (posts_per_month between 0 and 31),
  add column if not exists videos_per_month smallint not null default 0 check (videos_per_month between 0 and 31),
  add column if not exists excel_import boolean not null default false,
  add column if not exists home_banner boolean not null default false,
  add column if not exists stats_level text not null default 'basic' check (stats_level in ('basic','full','report')),
  add column if not exists max_staff smallint check (max_staff is null or max_staff between 0 and 1000),
  add column if not exists max_projects smallint check (max_projects is null or max_projects between 0 and 1000);

alter table public.app_settings
  add column if not exists plan_trial_days smallint not null default 30 check (plan_trial_days between 0 and 90),
  add column if not exists plan_discount_3m smallint not null default 10 check (plan_discount_3m between 0 and 90),
  add column if not exists plan_discount_6m smallint not null default 20 check (plan_discount_6m between 0 and 90),
  add column if not exists plan_discount_12m smallint not null default 30 check (plan_discount_12m between 0 and 90);

-- When an account's listings stop showing (null = no end: Value Aqar's own accounts and demos).
alter table public.brokers
  add column if not exists access_until timestamptz,
  add column if not exists plan_exempt boolean not null default false;
-- Public visibility rules read the end date (the plan itself stays private).
grant select (access_until) on public.brokers to anon, authenticated;

alter table public.owner_plan_grants
  add column if not exists months smallint check (months is null or months between 1 and 24),
  add column if not exists is_trial boolean not null default false;
alter table public.subscriptions
  add column if not exists months smallint check (months is null or months between 1 and 24);

-- Which plans an account sees: by its kind.
create or replace function public.account_audience(_type text)
returns text language sql immutable set search_path = public as $$
  select case _type when 'individual' then 'individual' when 'developer' then 'developer' when 'owner' then 'owner' else 'company' end
$$;

-- The price of a plan for a term, with the term discount (whole pounds).
create or replace function public.plan_price(_plan uuid, _months integer)
returns numeric language sql stable security definer set search_path = public as $$
  select round(pl.monthly_price * _months * (100 - case _months when 3 then s.plan_discount_3m when 6 then s.plan_discount_6m when 12 then s.plan_discount_12m else 0 end) / 100.0)
  from public.plans pl cross join public.app_settings s where pl.id = _plan and s.id = 1 and _months in (1, 3, 6, 12)
$$;
grant execute on function public.plan_price(uuid, integer) to anon, authenticated;

-- A broker account may hold the old shared plans or the plans of its own kind.
create or replace function public.brokers_plan_audience()
returns trigger language plpgsql security definer set search_path = public as $$
declare aud text;
begin
  if new.plan_id is not null then
    select audience into aud from public.plans where id = new.plan_id;
    if aud is distinct from 'broker' and aud is distinct from public.account_audience(new.account_type) then
      raise exception 'الباقة دي مش لنوع الحساب ده' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.brokers_plan_audience() from public, anon, authenticated;

-- Only the team changes an account's plan, its end and the exemption (va.plan_sync = set inside the plan functions).
create or replace function public.brokers_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_can('brokers', 'edit') and coalesce(auth.role(), '') <> 'service_role' then
    new.is_active := old.is_active;
    new.user_id := old.user_id;
    new.slug := old.slug;
    new.is_demo := old.is_demo;
    new.account_type := old.account_type;
    new.suspended_at := old.suspended_at;
    new.phone := old.phone;
    new.review_note := old.review_note;
    new.rejected_at := old.rejected_at;
    new.show_contact := old.show_contact;
    new.plan_exempt := old.plan_exempt;
    if coalesce(current_setting('va.plan_sync', true), '') <> '1' then
      new.plan_id := old.plan_id;
      new.access_until := old.access_until;
    end if;
  end if;
  if new.is_active then new.rejected_at := null; end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.properties_plan_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null
          or coalesce(current_setting('va.plan_sync', true), '') = '1') then
    new.hidden_by_plan := case when tg_op = 'UPDATE' then old.hidden_by_plan else false end;
  end if;
  return new;
end $$;

-- ───────────────────────── 2) The plan in force and its end ─────────────────────────
-- The middle tier of a kind: the free month runs on it.
create or replace function public.trial_plan_id(_audience text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.plans where audience = _audience and is_active and tier = 2 order by sort_order limit 1
$$;
revoke execute on function public.trial_plan_id(text) from public, anon, authenticated;

-- Owners have three sets of plans: selling ('owner'), renting ('owner_rent', cheaper) and summer stays ('owner_summer',
-- pricier, in season). A phone may hold one of each.
create or replace function public.listing_kind(_status text)
returns text language sql immutable set search_path = public as $$
  select case _status when 'إيجار' then 'rent' when 'مصيف' then 'summer' else 'sale' end
$$;
create or replace function public.owner_audience(_kind text)
returns text language sql immutable set search_path = public as $$
  select case _kind when 'rent' then 'owner_rent' when 'summer' then 'owner_summer' else 'owner' end
$$;

-- An owner's plan for a kind: the running grant; else the latest one (for its limits); else the trial plan.
create or replace function public.owner_kind_plan(_phone text, _kind text)
returns public.plans language sql stable security definer set search_path = public as $$
  select pl.* from public.plans pl
  where pl.id = coalesce(
    (select g.plan_id from public.owner_plan_grants g join public.plans gp on gp.id = g.plan_id
     where g.phone = public.normalize_phone(_phone) and g.status = 'active' and gp.audience = public.owner_audience(_kind)
       and g.starts_at <= now() and g.ends_at > now() order by g.ends_at desc limit 1),
    (select g.plan_id from public.owner_plan_grants g join public.plans gp on gp.id = g.plan_id
     where g.phone = public.normalize_phone(_phone) and gp.audience = public.owner_audience(_kind) order by g.ends_at desc limit 1),
    public.trial_plan_id(public.owner_audience(_kind)),
    (select id from public.plans where code = 'owner_free'))
$$;
revoke execute on function public.owner_kind_plan(text, text) from public, anon, authenticated;
-- The selling plan (what the older functions ask for).
create or replace function public.owner_plan(_phone text)
returns public.plans language sql stable security definer set search_path = public as $$
  select * from public.owner_kind_plan(_phone, 'sale')
$$;
revoke execute on function public.owner_plan(text) from public, anon, authenticated;

-- When an owner phone's listings of a kind stop showing: null = no plan of that kind yet (the free month starts on
-- its first listing of that kind). Without a kind: the latest end of any.
create or replace function public.owner_kind_access_until(_phone text, _kind text)
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(g.ends_at) from public.owner_plan_grants g join public.plans gp on gp.id = g.plan_id
  where g.phone = public.normalize_phone(_phone) and g.status = 'active' and g.starts_at <= now()
    and (_kind is null or gp.audience = public.owner_audience(_kind))
$$;
revoke execute on function public.owner_kind_access_until(text, text) from public, anon, authenticated;
create or replace function public.owner_access_until(_phone text)
returns timestamptz language sql stable security definer set search_path = public as $$
  select public.owner_kind_access_until(_phone, null)
$$;
revoke execute on function public.owner_access_until(text) from public, anon, authenticated;

create or replace function public.live_listings_of_phone_kind(_phone text, _kind text)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.properties p join public.leads l on l.id = p.owner_lead_id
  where p.broker_id is null and l.phone_norm = public.normalize_phone(_phone)
    and p.review_status in ('approved','pending') and not p.hidden_by_plan and (p.listed_until is null or p.listed_until > now())
    and (_kind is null or public.listing_kind(p.status) = _kind)
$$;
revoke execute on function public.live_listings_of_phone_kind(text, text) from public, anon, authenticated;

create or replace function public.owner_plan_grants_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.phone := coalesce(public.normalize_phone(new.phone), new.phone);
  if not exists (select 1 from public.plans where id = new.plan_id and audience in ('owner', 'owner_rent', 'owner_summer')) then
    raise exception 'اختار باقة من باقات الملاك' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.owner_plan_grants_guard() from public, anon, authenticated;

-- Recompute an account's end date from its subscriptions (+ the grace days after a paid term). With _limit,
-- listings over the plan's limit are hidden and hidden ones come back while there's room (nothing is deleted).
create or replace function public.sync_broker_access(_broker uuid, _limit boolean default false)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare b public.brokers; acc timestamptz; grace int; lim int; live int;
begin
  select * into b from public.brokers where id = _broker;
  if b.id is null then return null; end if;
  select subscription_grace_days into grace from public.app_settings where id = 1;
  if b.plan_exempt or b.is_demo then
    acc := null;
  else
    select max(case when status = 'trial' then ends_at else ends_at + make_interval(days => coalesce(grace, 3)) end) into acc
    from public.subscriptions where broker_id = _broker and status in ('trial','active') and ends_at is not null;
    acc := coalesce(acc, now());
  end if;
  perform set_config('va.plan_sync', '1', true);
  update public.brokers set access_until = acc where id = _broker and access_until is distinct from acc;
  if _limit then
    select bp.max_properties into lim from public.broker_plan(_broker) bp;
    update public.properties set hidden_by_plan = true
    where id in (select id from public.properties where broker_id = _broker and not hidden_by_plan and review_status in ('approved','pending')
                 order by is_featured desc, updated_at desc offset coalesce(lim, 0));
    live := public.live_listings_of_broker(_broker);
    update public.properties set hidden_by_plan = false
    where id in (select id from public.properties where broker_id = _broker and hidden_by_plan
                 order by updated_at desc limit greatest(coalesce(lim, 0) - live, 0));
  end if;
  perform set_config('va.plan_sync', '', true);
  return acc;
end $$;
revoke execute on function public.sync_broker_access(uuid, boolean) from public, anon, authenticated;

-- Owners: every listing of the phone shows until its kind's plan ends; with _limit, each plan's listing count applies.
create or replace function public.sync_owner_access(_phone text, _limit boolean default false)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare ph text := public.normalize_phone(_phone); k text; acc timestamptz; lim int; live int;
begin
  perform set_config('va.plan_sync', '1', true);
  perform set_config('va.listing_renew', '1', true);
  foreach k in array array['sale', 'rent', 'summer'] loop
    acc := public.owner_kind_access_until(ph, k);
    update public.properties p set listed_until = coalesce(acc, now()), listing_notice = 0
    from public.leads l where l.id = p.owner_lead_id and p.broker_id is null and l.phone_norm = ph and p.review_status = 'approved'
      and public.listing_kind(p.status) = k and p.listed_until is distinct from coalesce(acc, now());
    if _limit then
      select op.max_properties into lim from public.owner_kind_plan(ph, k) op;
      update public.properties set hidden_by_plan = true
      where id in (select p.id from public.properties p join public.leads l on l.id = p.owner_lead_id
                   where p.broker_id is null and l.phone_norm = ph and public.listing_kind(p.status) = k and not p.hidden_by_plan
                     and p.review_status in ('approved','pending')
                   order by p.updated_at desc offset coalesce(lim, 0));
      live := public.live_listings_of_phone_kind(ph, k);
      update public.properties set hidden_by_plan = false
      where id in (select p.id from public.properties p join public.leads l on l.id = p.owner_lead_id
                   where p.broker_id is null and l.phone_norm = ph and public.listing_kind(p.status) = k and p.hidden_by_plan
                   order by p.updated_at desc limit greatest(coalesce(lim, 0) - live, 0));
    end if;
  end loop;
  perform set_config('va.listing_renew', '', true);
  perform set_config('va.plan_sync', '', true);
  return public.owner_access_until(ph);
end $$;
revoke execute on function public.sync_owner_access(text, boolean) from public, anon, authenticated;

-- The free month for a broker account (once, when it's first activated).
create or replace function public.start_broker_trial(_broker uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b public.brokers; days int; pl uuid;
begin
  select * into b from public.brokers where id = _broker;
  if b.id is null or not b.is_active or exists (select 1 from public.subscriptions where broker_id = _broker) then return; end if;
  select plan_trial_days into days from public.app_settings where id = 1;
  pl := public.trial_plan_id(public.account_audience(b.account_type));
  if coalesce(days, 0) > 0 and pl is not null and not b.plan_exempt and not b.is_demo then
    insert into public.subscriptions (broker_id, plan_id, status, starts_at, ends_at, provider, months)
    values (_broker, pl, 'trial', now(), now() + make_interval(days => days), 'trial', null);
    perform set_config('va.plan_sync', '1', true);
    update public.brokers set plan_id = pl where id = _broker;
    perform set_config('va.plan_sync', '', true);
    if b.user_id is not null then
      perform public.notify_user(b.user_id, 'request_status', 'أول شهر مجانًا 🎁', 'باقتك «' || (select name from public.plans where id = pl) || '» شغالة مجانًا لمدة ' || days || ' يوم', _broker, '/dashboard?tab=plan');
    end if;
  end if;
  perform public.sync_broker_access(_broker);
end $$;
revoke execute on function public.start_broker_trial(uuid) from public, anon, authenticated;

create or replace function public.brokers_start_trial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then perform public.start_broker_trial(new.id); end if;
  return null;
end $$;
revoke execute on function public.brokers_start_trial() from public, anon, authenticated;
drop trigger if exists brokers_start_trial on public.brokers;
create trigger brokers_start_trial after insert or update of is_active on public.brokers for each row execute function public.brokers_start_trial();

-- Exempting an account (or ending the exemption) applies right away.
create or replace function public.brokers_exempt_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_broker_access(new.id);
  return null;
end $$;
revoke execute on function public.brokers_exempt_sync() from public, anon, authenticated;
drop trigger if exists brokers_exempt_sync on public.brokers;
create trigger brokers_exempt_sync after update of plan_exempt on public.brokers for each row
  when (old.plan_exempt is distinct from new.plan_exempt) execute function public.brokers_exempt_sync();

-- The free month for an owner phone (once per kind, on its first listing of that kind).
create or replace function public.start_owner_trial(_phone text, _kind text)
returns void language plpgsql security definer set search_path = public as $$
declare days int; pl uuid := public.trial_plan_id(public.owner_audience(_kind));
begin
  if _phone is null or exists (select 1 from public.owner_plan_grants g join public.plans gp on gp.id = g.plan_id
                               where g.phone = public.normalize_phone(_phone) and gp.audience = public.owner_audience(_kind)) then return; end if;
  select plan_trial_days into days from public.app_settings where id = 1;
  if coalesce(days, 0) > 0 and pl is not null then
    insert into public.owner_plan_grants (phone, plan_id, starts_at, ends_at, note, is_trial)
    values (_phone, pl, now(), now() + make_interval(days => days), 'أول شهر مجانًا', true);
  end if;
end $$;
revoke execute on function public.start_owner_trial(text, text) from public, anon, authenticated;

-- Visitors see a broker account's listings, projects and compounds only while its plan runs.
drop policy if exists "approved properties public" on public.properties;
create policy "approved properties public" on public.properties for select to anon, authenticated
  using (review_status = 'approved' and not hidden_by_plan and (listed_until is null or listed_until > now())
    and (not is_demo or public.demo_visible())
    and (broker_id is null or exists (select 1 from public.brokers b where b.id = broker_id and b.is_active
      and (b.access_until is null or b.access_until > now()))));

drop policy if exists "approved projects public" on public.projects;
create policy "approved projects public" on public.projects for select to anon, authenticated
  using (review_status = 'approved' and exists (select 1 from public.brokers b where b.id = developer_id and b.is_active and b.suspended_at is null
    and (b.access_until is null or b.access_until > now())));

drop policy if exists "visible compounds public" on public.compounds;
create policy "visible compounds public" on public.compounds for select to anon, authenticated
  using (is_active and review_status = 'approved'
    and (developer_id is null or exists (select 1 from public.brokers b where b.id = developer_id and b.is_active and b.suspended_at is null
      and (b.access_until is null or b.access_until > now()))));

-- A listing's term. Plans with a listing duration work as before; the new plans keep a broker's listings up while
-- the plan runs (no per-listing end), and an owner's listings until the owner's plan ends.
create or replace function public.properties_listing_term()
returns trigger language plpgsql security definer set search_path = public as $$
declare privileged boolean := public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null;
  renewing boolean := coalesce(current_setting('va.listing_renew', true), '') = '1';
  days integer; lim integer; ph text; acc timestamptz; k text := public.listing_kind(new.status);
begin
  if not privileged and not renewing then
    new.listed_until := case when tg_op = 'UPDATE' then old.listed_until end;
    new.listing_notice := case when tg_op = 'UPDATE' then old.listing_notice else 0 end;
  end if;
  if new.broker_id is null and new.owner_lead_id is not null then
    select l.phone_norm into ph from public.leads l where l.id = new.owner_lead_id;
  end if;
  if tg_op = 'INSERT' and ph is not null and not public.has_role(auth.uid(), 'admin') then
    perform public.start_owner_trial(ph, k);
    acc := public.owner_kind_access_until(ph, k);
    if acc is null or acc <= now() then
      raise exception 'plan_expired: باقتك انتهت. اشترك في باقة من «إعلاناتي» عشان تنزّل إعلانات' using errcode = 'P0001';
    end if;
    select op.max_properties into lim from public.owner_kind_plan(ph, k) op;
    if public.live_listings_of_phone_kind(ph, k) >= coalesce(lim, 1) then
      raise exception 'plan_limit: وصلت لحد باقتك (% إعلان ظاهر في نفس الوقت)', coalesce(lim, 1) using errcode = 'P0001';
    end if;
  end if;
  if new.review_status = 'approved' and (tg_op = 'INSERT' or old.review_status is distinct from 'approved')
     and (new.broker_id is not null or new.owner_lead_id is not null)
     and (new.listed_until is null or new.listed_until <= now()) then
    days := public.listing_days_for(new.broker_id, new.owner_lead_id);
    new.listed_until := case when days is not null then now() + make_interval(days => days)
                             when ph is not null then coalesce(public.owner_kind_access_until(ph, k), now())
                             else null end;
    new.listing_notice := 0;
  end if;
  return new;
end $$;
revoke execute on function public.properties_listing_term() from public, anon, authenticated;

-- A broker account whose plan ended can't put up new listings, team members, projects or compounds.
create or replace function public.properties_access_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare acc timestamptz;
begin
  if new.broker_id is null or public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then return new; end if;
  if new.review_status <> 'draft' and (tg_op = 'INSERT' or old.review_status = 'draft') then
    select access_until into acc from public.brokers where id = new.broker_id;
    if acc is not null and acc <= now() then
      raise exception 'باقتك انتهت. اشترك في باقة من «باقتي» عشان إعلاناتك ترجع تظهر وتقدر تنزّل جديد' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.properties_access_guard() from public, anon, authenticated;
drop trigger if exists properties_access_guard on public.properties;
create trigger properties_access_guard before insert or update of review_status on public.properties for each row execute function public.properties_access_guard();

create or replace function public.company_members_plan_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim int; n int;
begin
  if public.staff_can('brokers', 'edit') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then return new; end if;
  if not new.is_active or (tg_op = 'UPDATE' and old.is_active) then return new; end if;
  select bp.max_staff into lim from public.broker_plan(new.company_id) bp;
  if lim is null then return new; end if;
  select count(*) into n from public.company_members where company_id = new.company_id and is_active and id <> new.id;
  if n >= lim then
    raise exception 'باقتك بتسمح بـ % من الفريق. اطلب باقة أكبر من «باقتي»', lim using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.company_members_plan_limit() from public, anon, authenticated;
drop trigger if exists company_members_plan_limit on public.company_members;
create trigger company_members_plan_limit before insert or update of is_active on public.company_members for each row execute function public.company_members_plan_limit();

create or replace function public.developer_projects_plan_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare dev uuid := new.developer_id; lim int; n int; acc timestamptz;
begin
  if dev is null or public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then return new; end if;
  select access_until into acc from public.brokers where id = dev;
  if acc is not null and acc <= now() then
    raise exception 'باقتك انتهت. اشترك في باقة من «باقتي»' using errcode = 'P0001';
  end if;
  select bp.max_projects into lim from public.broker_plan(dev) bp;
  if lim is null then return new; end if;
  select (select count(*) from public.projects where developer_id = dev) + (select count(*) from public.compounds where developer_id = dev) into n;
  if n >= lim then
    raise exception 'باقتك بتسمح بـ % مشروع/كمبوند. اطلب باقة أكبر من «باقتي»', lim using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.developer_projects_plan_limit() from public, anon, authenticated;
drop trigger if exists projects_plan_limit on public.projects;
create trigger projects_plan_limit before insert on public.projects for each row execute function public.developer_projects_plan_limit();
drop trigger if exists compounds_plan_limit on public.compounds;
create trigger compounds_plan_limit before insert on public.compounds for each row execute function public.developer_projects_plan_limit();

-- Renewing one listing is for plans with a listing duration; on the new plans the whole plan is renewed.
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
  if days is null then raise exception 'إعلاناتك بتفضل ظاهرة طول مدة باقتك. جدّد الباقة نفسها من «باقتي»' using errcode = 'P0001'; end if;
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
  res := greatest(now(), p.listed_until) + make_interval(days => days);
  perform set_config('va.listing_renew', '1', true);
  update public.properties set listed_until = res, listing_notice = 0 where id = _property;
  perform set_config('va.listing_renew', '', true);
  return res;
end $$;
revoke execute on function public.renew_listing(uuid) from public, anon;
grant execute on function public.renew_listing(uuid) to authenticated;

-- Server-side check before an owner sends a new listing of a kind: expired = had a plan of that kind and it ended.
create or replace function public.owner_kind_quota(_phone text, _kind text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('used', public.live_listings_of_phone_kind(_phone, _kind), 'max', (select op.max_properties from public.owner_kind_plan(_phone, _kind) op),
    'expired', exists (select 1 from public.owner_plan_grants g join public.plans gp on gp.id = g.plan_id
                       where g.phone = public.normalize_phone(_phone) and gp.audience = public.owner_audience(_kind))
               and coalesce(public.owner_kind_access_until(_phone, _kind), now()) <= now())
$$;
revoke execute on function public.owner_kind_quota(text, text) from public, anon, authenticated;
grant execute on function public.owner_kind_quota(text, text) to service_role;
-- Older callers (selling).
create or replace function public.owner_listing_quota(_phone text)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.owner_kind_quota(_phone, 'sale')
$$;
revoke execute on function public.owner_listing_quota(text) from public, anon, authenticated;
grant execute on function public.owner_listing_quota(text) to service_role;

-- ───────────────────────── 3) Asking for a plan, activating it ─────────────────────────
create table if not exists public.plan_requests (
  id uuid primary key default gen_random_uuid(),
  request_no bigint generated always as identity,
  broker_id uuid references public.brokers(id) on delete cascade,
  phone text check (phone is null or char_length(phone) between 8 and 20),
  plan_id uuid not null references public.plans(id),
  months smallint not null check (months in (1, 3, 6, 12)),
  amount numeric not null default 0 check (amount >= 0),
  status text not null default 'new' check (status in ('new','activated','rejected','cancelled')),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  handled_by uuid,
  handled_at timestamptz,
  check ((broker_id is null) <> (phone is null))
);
create index if not exists plan_requests_status_idx on public.plan_requests (status, created_at desc);
grant select on public.plan_requests to authenticated;
grant all on public.plan_requests to service_role;
alter table public.plan_requests enable row level security;
drop policy if exists "account reads own plan requests" on public.plan_requests;
drop policy if exists "staff reads plan requests" on public.plan_requests;
create policy "account reads own plan requests" on public.plan_requests for select to authenticated
  using ((broker_id is not null and broker_id = public.current_broker_id()) or (phone is not null and phone = public.my_phone()));
create policy "staff reads plan requests" on public.plan_requests for select to authenticated using (public.staff_can('plans', 'view'));
drop trigger if exists zz_audit on public.plan_requests;
create trigger zz_audit after insert or update or delete on public.plan_requests for each row execute function public.audit_row();

drop function if exists public.request_listing_plan(uuid);
create or replace function public.request_listing_plan(_plan uuid, _months integer default 1)
returns uuid language plpgsql security definer set search_path = public as $$
declare pl public.plans; b uuid := public.current_broker_id(); ph text := public.my_phone(); who text; aud text; rid uuid; amt numeric;
begin
  select * into pl from public.plans where id = _plan and is_active;
  if pl.id is null then raise exception 'الباقة مش متاحة' using errcode = 'P0001'; end if;
  if _months not in (1, 3, 6, 12) then raise exception 'اختار مدة: شهر أو 3 أو 6 شهور أو سنة' using errcode = '22023'; end if;
  amt := coalesce(public.plan_price(pl.id, _months), 0);
  if b is not null then
    if public.current_member_role() <> 'owner' then raise exception 'صاحب الحساب بس اللي يطلب باقة' using errcode = '42501'; end if;
    select public.account_audience(account_type), name || coalesce(' — ' || phone, '') into aud, who from public.brokers where id = b;
    if pl.audience <> aud then raise exception 'الباقة دي مش لنوع حسابك' using errcode = 'P0001'; end if;
    update public.plan_requests set status = 'cancelled', handled_at = now() where broker_id = b and status = 'new';
    insert into public.plan_requests (broker_id, plan_id, months, amount) values (b, pl.id, _months, amt) returning id into rid;
  elsif ph is not null and pl.audience in ('owner', 'owner_rent', 'owner_summer') then
    who := 'مالك — ' || ph;
    -- One open request per kind (selling / renting / summer).
    update public.plan_requests r set status = 'cancelled', handled_at = now()
    from public.plans rp where rp.id = r.plan_id and r.phone = ph and r.status = 'new' and rp.audience = pl.audience;
    insert into public.plan_requests (phone, plan_id, months, amount) values (ph, pl.id, _months, amt) returning id into rid;
  else
    raise exception 'الباقة دي مش لحسابك' using errcode = 'P0001';
  end if;
  perform public.notify_team('admin', 'طلب باقة — ' || pl.name || ' · ' || _months || ' شهر', who || ' — ' || amt || ' ج.م', rid, '/admin?tab=plans');
  return rid;
end $$;
revoke execute on function public.request_listing_plan(uuid, integer) from public, anon;
grant execute on function public.request_listing_plan(uuid, integer) to authenticated;

-- Activate a plan for a term (the team, until online payment opens). Same plan running = extends from its end;
-- another plan (or the free month) = the new one starts now. Returns the new end.
create or replace function public.admin_grant_plan(_broker uuid, _phone text, _plan uuid, _months integer, _note text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare pl public.plans; b public.brokers; ph text := public.normalize_phone(_phone); starts timestamptz; ends timestamptz; uid uuid;
  cur_end timestamptz;
begin
  if not public.staff_can('plans', 'edit') and coalesce(auth.role(), '') <> 'service_role' then raise exception 'غير مسموح' using errcode = '42501'; end if;
  select * into pl from public.plans where id = _plan;
  if pl.id is null then raise exception 'اختار باقة' using errcode = 'P0001'; end if;
  if _months is null or _months not between 1 and 24 then raise exception 'المدة من شهر لـ 24 شهر' using errcode = '22023'; end if;
  if (_broker is null) = (ph is null) then raise exception 'اختار حساب أو رقم مالك' using errcode = '22023'; end if;
  if _broker is not null then
    select * into b from public.brokers where id = _broker;
    if b.id is null then raise exception 'الحساب مش موجود' using errcode = 'P0001'; end if;
    if pl.audience not in ('broker', public.account_audience(b.account_type)) then raise exception 'الباقة دي مش لنوع الحساب ده' using errcode = 'P0001'; end if;
    select max(ends_at) into cur_end from public.subscriptions
    where broker_id = _broker and status = 'active' and plan_id = _plan and ends_at > now();
    starts := coalesce(cur_end, now());
    ends := starts + make_interval(months => _months);
    update public.subscriptions set status = 'canceled', ends_at = least(ends_at, now())
    where broker_id = _broker and status in ('trial','active') and (status = 'trial' or plan_id <> _plan) and ends_at > now();
    insert into public.subscriptions (broker_id, plan_id, status, starts_at, ends_at, provider, provider_ref, months)
    values (_broker, _plan, 'active', starts, ends, 'manual', left(_note, 100), _months);
    perform set_config('va.plan_sync', '1', true);
    update public.brokers set plan_id = _plan where id = _broker;
    perform set_config('va.plan_sync', '', true);
    perform public.sync_broker_access(_broker, true);
    uid := b.user_id;
  else
    if pl.audience not in ('owner', 'owner_rent', 'owner_summer') then raise exception 'اختار باقة من باقات الملاك' using errcode = 'P0001'; end if;
    select max(ends_at) into cur_end from public.owner_plan_grants
    where phone = ph and status = 'active' and not is_trial and plan_id = _plan and ends_at > now();
    starts := coalesce(cur_end, now());
    ends := starts + make_interval(months => _months);
    -- Only the same kind is replaced: a selling plan leaves the renting / summer plan alone.
    update public.owner_plan_grants g set status = 'cancelled'
    from public.plans gp where gp.id = g.plan_id and gp.audience = pl.audience
      and g.phone = ph and g.status = 'active' and g.ends_at > now() and (g.is_trial or g.plan_id <> _plan);
    insert into public.owner_plan_grants (phone, plan_id, starts_at, ends_at, note, months) values (ph, _plan, starts, ends, _note, _months);
    perform public.sync_owner_access(ph, true);
    uid := public.phone_user_id(ph);
  end if;
  if uid is not null then
    perform public.notify_user(uid, 'request_status', 'اتفعّلت باقتك ✓', pl.name || ' لحد ' || to_char(ends at time zone 'Africa/Cairo', 'YYYY-MM-DD'), _plan,
      case when _broker is null then '/my-listings' else '/dashboard?tab=plan' end);
  end if;
  return ends;
end $$;
revoke execute on function public.admin_grant_plan(uuid, text, uuid, integer, text) from public, anon;
grant execute on function public.admin_grant_plan(uuid, text, uuid, integer, text) to authenticated, service_role;

create or replace function public.admin_handle_plan_request(_id uuid, _activate boolean, _note text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare r public.plan_requests; ends timestamptz; uid uuid;
begin
  if not public.staff_can('plans', 'edit') then raise exception 'غير مسموح' using errcode = '42501'; end if;
  select * into r from public.plan_requests where id = _id for update;
  if r.id is null or r.status <> 'new' then raise exception 'الطلب ده اتعامل معاه قبل كده' using errcode = 'P0001'; end if;
  if _activate then
    ends := public.admin_grant_plan(r.broker_id, r.phone, r.plan_id, r.months, coalesce(_note, 'طلب رقم ' || r.request_no));
  else
    uid := coalesce((select user_id from public.brokers where id = r.broker_id), public.phone_user_id(r.phone));
    if uid is not null then
      perform public.notify_user(uid, 'request_status', 'طلب الباقة ماتفعّلش', coalesce(_note, 'كلّم فاليو عقار عشان التفاصيل'), r.id,
        case when r.broker_id is null then '/my-listings' else '/dashboard?tab=plan' end);
    end if;
  end if;
  update public.plan_requests set status = case when _activate then 'activated' else 'rejected' end, note = left(_note, 300), handled_by = auth.uid(), handled_at = now() where id = _id;
  return ends;
end $$;
revoke execute on function public.admin_handle_plan_request(uuid, boolean, text) from public, anon;
grant execute on function public.admin_handle_plan_request(uuid, boolean, text) to authenticated;

-- «باقتي»: the plan in force for the signed-in broker account or owner: status, end, what's used, open request.
create or replace function public.my_listing_plan()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b uuid := public.current_broker_id(); ph text := public.my_phone(); pl public.plans; br public.brokers; ends timestamptz; trial boolean; acc timestamptz;
  req jsonb;
begin
  if b is not null then
    select * into br from public.brokers where id = b;
    select * into pl from public.broker_plan(b);
    select ends_at, status = 'trial' into ends, trial from public.subscriptions where broker_id = b and status in ('active','trial') and ends_at > now()
    order by (status = 'active') desc, ends_at desc limit 1;
    select jsonb_build_object('id', r.id, 'plan_id', r.plan_id, 'months', r.months, 'amount', r.amount, 'created_at', r.created_at) into req
    from public.plan_requests r where r.broker_id = b and r.status = 'new' order by r.created_at desc limit 1;
    return jsonb_build_object('audience', public.account_audience(br.account_type), 'plan_id', pl.id, 'code', pl.code, 'name', pl.name, 'max', pl.max_properties,
      'days', pl.listing_days, 'featured', pl.featured_slots, 'ends_at', ends, 'trial', coalesce(trial, false),
      'exempt', br.plan_exempt or br.is_demo, 'access_until', br.access_until,
      'expired', br.access_until is not null and br.access_until <= now(), 'used', public.live_listings_of_broker(b),
      'featured_used', (select count(*) from public.properties where broker_id = b and is_featured),
      'hidden', (select count(*) from public.properties where broker_id = b and hidden_by_plan),
      'staff', pl.max_staff, 'projects', pl.max_projects, 'stats_level', pl.stats_level, 'excel', pl.excel_import, 'request', req);
  elsif ph is not null then
    -- Owners: one entry per kind (selling / renting / summer); the top level is the first kind they have, selling first.
    select coalesce(jsonb_agg(x order by x->>'ord'), '[]'::jsonb) into req from (
      select jsonb_build_object('ord', o.ord, 'kind', o.k, 'audience', public.owner_audience(o.k), 'plan_id', op.id, 'code', op.code, 'name', op.name,
        'max', op.max_properties, 'days', op.listing_days, 'featured', op.featured_slots, 'stats_level', op.stats_level, 'exempt', false,
        'ends_at', g.ends_at, 'trial', coalesce(g.is_trial, false), 'access_until', public.owner_kind_access_until(ph, o.k),
        'expired', coalesce(public.owner_kind_access_until(ph, o.k) <= now(), false), 'used', public.live_listings_of_phone_kind(ph, o.k),
        'has', exists (select 1 from public.owner_plan_grants hg join public.plans hp on hp.id = hg.plan_id where hg.phone = ph and hp.audience = public.owner_audience(o.k)),
        'total', (select count(*) from public.properties p join public.leads l on l.id = p.owner_lead_id where p.broker_id is null and l.phone_norm = ph and public.listing_kind(p.status) = o.k),
        'request', (select jsonb_build_object('id', r.id, 'plan_id', r.plan_id, 'months', r.months, 'amount', r.amount, 'created_at', r.created_at)
                    from public.plan_requests r join public.plans rp on rp.id = r.plan_id
                    where r.phone = ph and r.status = 'new' and rp.audience = public.owner_audience(o.k) order by r.created_at desc limit 1)) x
      from (values (1, 'sale'), (2, 'rent'), (3, 'summer')) o(ord, k)
      cross join lateral public.owner_kind_plan(ph, o.k) op
      left join lateral (select gg.ends_at, gg.is_trial from public.owner_plan_grants gg join public.plans gp on gp.id = gg.plan_id
                         where gg.phone = ph and gg.status = 'active' and gp.audience = public.owner_audience(o.k) and gg.starts_at <= now() and gg.ends_at > now()
                         order by gg.ends_at desc limit 1) g on true) t;
    return (select e from jsonb_array_elements(req) e order by (e->>'has')::boolean desc, e->>'ord' limit 1)
      || jsonb_build_object('audience', 'owner', 'kinds', req);
  end if;
  return null;
end $$;
revoke execute on function public.my_listing_plan() from public, anon;
grant execute on function public.my_listing_plan() to authenticated;

-- Online payments (when the gateway opens) bring listings back the same way.
create or replace function public.mark_payment_paid(_id uuid, _txn text, _amount numeric, _method text default null)
returns text language plpgsql security definer set search_path = public as $$
declare p public.payments%rowtype; cur public.subscriptions%rowtype; starts timestamptz; ends timestamptz; owner uuid; tag text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service only' using errcode = '42501'; end if;
  select * into p from public.payments where id = _id for update;
  if p.id is null then return 'not_found'; end if;
  if p.status = 'paid' then return 'already_paid'; end if;
  if p.status not in ('pending','failed','expired') then return 'invalid_status'; end if;
  if exists (select 1 from public.payments where provider_txn_id = _txn and id <> p.id) then return 'duplicate_txn'; end if;
  tag := 'PAY-' || lpad(p.payment_no::text, 6, '0');
  if round(_amount, 2) <> round(p.amount, 2) then
    update public.payments set failed_reason = 'المبلغ المدفوع (' || _amount || ') مختلف عن المطلوب' where id = p.id;
    perform public.notify_admins('admin', 'دفعة بمبلغ مختلف', tag || ' — محتاجة مراجعة', p.id, '/admin');
    return 'amount_mismatch';
  end if;

  update public.payments set status = 'paid', paid_at = now(), provider_txn_id = _txn, method = left(_method, 40), failed_reason = null where id = p.id;
  select user_id into owner from public.brokers where id = p.broker_id;

  if p.purpose = 'subscription' then
    select * into cur from public.subscriptions
    where broker_id = p.broker_id and status in ('active','trial') and ends_at > now()
    order by ends_at desc limit 1;
    starts := case when cur.id is not null and cur.plan_id = p.plan_id and cur.status = 'active' then cur.ends_at else now() end;
    ends := starts + case p.period when 'yearly' then interval '1 year' else interval '1 month' end;
    if cur.id is not null and (cur.plan_id <> p.plan_id or cur.status = 'trial') then update public.subscriptions set status = 'canceled', ends_at = now() where id = cur.id; end if;
    insert into public.subscriptions (broker_id, plan_id, status, starts_at, ends_at, provider, provider_ref, payment_id)
    values (p.broker_id, p.plan_id, 'active', starts, ends, p.provider, _txn, p.id);
    perform set_config('va.plan_sync', '1', true);
    update public.brokers set plan_id = p.plan_id where id = p.broker_id;
    perform set_config('va.plan_sync', '', true);
    perform public.sync_broker_access(p.broker_id, true);
    if owner is not null then
      perform public.notify_user(owner, 'request_status', 'اتفعّلت باقتك ✓', (select name from public.plans where id = p.plan_id) || ' لحد ' || to_char(ends at time zone 'Africa/Cairo', 'YYYY-MM-DD'), p.id, '/dashboard');
    end if;
  else
    update public.properties set is_featured = true,
      featured_until = greatest(now(), coalesce(featured_until, now())) + make_interval(days => p.feature_days)
    where id = p.property_id;
    if owner is not null then
      perform public.notify_user(owner, 'request_status', 'عقارك بقى مميز ✓', 'لمدة ' || p.feature_days || ' يوم', p.property_id, '/dashboard');
    end if;
  end if;
  perform public.notify_admins('admin', 'دفعة جديدة ✓', tag || ' — ' || p.amount || ' ج.م — ' || coalesce((select name from public.brokers where id = p.broker_id), ''), p.id, '/admin');
  return 'paid';
end $$;
revoke execute on function public.mark_payment_paid(uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.mark_payment_paid(uuid, text, numeric, text) to service_role;

-- Scheduled: reminders a week and a day before a plan (or the free month) ends, and a notice when it ended.
-- Hiding doesn't wait for this job: listings stop showing the moment the plan's end passes.
create or replace function public.run_subscription_expiry()
returns jsonb language plpgsql security definer set search_path = public as $$
declare s record; grace int; n_rem int := 0; n_exp int := 0; n_feat int := 0; n_pay int := 0; run_id bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.has_role(auth.uid(), 'admin') then raise exception 'غير مصرح' using errcode = '42501'; end if;
  insert into public.job_runs (job) values ('subscription_expiry') returning id into run_id;
  select subscription_grace_days into grace from public.app_settings where id = 1;

  for s in select su.*, b.user_id, pl.name plan_name from public.subscriptions su join public.brokers b on b.id = su.broker_id join public.plans pl on pl.id = su.plan_id
           where su.status in ('active','trial') and su.ends_at is not null and not b.plan_exempt loop
    if s.ends_at > now() + interval '1 day' and s.ends_at <= now() + interval '7 days' and s.reminded_7d_at is null then
      if s.user_id is not null then perform public.notify_user(s.user_id, 'request_status', case when s.status = 'trial' then 'الشهر المجاني هيخلص خلال أسبوع' else 'باقتك هتخلص خلال أسبوع' end, s.plan_name || ' — اختار باقتك من «باقتي» عشان إعلاناتك تفضل ظاهرة', s.id, '/dashboard?tab=plan'); end if;
      update public.subscriptions set reminded_7d_at = now() where id = s.id; n_rem := n_rem + 1;
    elsif s.ends_at > now() and s.ends_at <= now() + interval '1 day' and s.reminded_1d_at is null then
      if s.user_id is not null then perform public.notify_user(s.user_id, 'request_status', case when s.status = 'trial' then 'الشهر المجاني بيخلص بكرة' else 'باقتك بتخلص بكرة' end, s.plan_name || ' — اشترك من «باقتي» عشان إعلاناتك ماتستخباش', s.id, '/dashboard?tab=plan'); end if;
      update public.subscriptions set reminded_1d_at = now(), reminded_7d_at = coalesce(reminded_7d_at, now()) where id = s.id; n_rem := n_rem + 1;
    elsif s.ends_at <= now() - (case when s.status = 'trial' then interval '0' else make_interval(days => coalesce(grace, 3)) end) then
      update public.subscriptions set status = 'canceled' where id = s.id;
      if not exists (select 1 from public.subscriptions o where o.broker_id = s.broker_id and o.id <> s.id and o.status in ('active','trial') and o.ends_at > now()) then
        perform public.sync_broker_access(s.broker_id);
        if s.user_id is not null then perform public.notify_user(s.user_id, 'request_status', case when s.status = 'trial' then 'الشهر المجاني خلص' else 'باقتك انتهت' end, 'إعلاناتك اتخفت (مفيش حاجة اتمسحت). اشترك من «باقتي» وهترجع تظهر على طول', s.id, '/dashboard?tab=plan'); end if;
      end if;
      n_exp := n_exp + 1;
    end if;
  end loop;

  update public.properties set is_featured = false where is_featured and featured_until is not null and featured_until <= now();
  get diagnostics n_feat = row_count;
  update public.payments set status = 'expired' where status = 'pending' and created_at < now() - interval '2 hours';
  get diagnostics n_pay = row_count;

  update public.job_runs set finished_at = now(), result = jsonb_build_object('reminders', n_rem, 'expired', n_exp, 'featured_ended', n_feat, 'checkouts_expired', n_pay) where id = run_id;
  return jsonb_build_object('reminders', n_rem, 'expired', n_exp, 'featured_ended', n_feat, 'checkouts_expired', n_pay);
end $$;
revoke execute on function public.run_subscription_expiry() from public, anon;
grant execute on function public.run_subscription_expiry() to authenticated, service_role;

-- The team with «الباقات» changes the free month and the term discounts too.
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
      when k like 'featured_%price' or k like 'plan\_%' or k = 'subscription_grace_days' then 'plans'
      else null end;
    if sec is null or not public.staff_can(sec, 'edit') then
      raise exception 'not allowed to change %', k using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

-- ───────────────────────── 4) First run: the plans and the free month ─────────────────────────
do $$
declare r record; days int; ends timestamptz;
begin
  if exists (select 1 from public.plans where code = 'ind_1') then return; end if;
  insert into public.plans (code, name, audience, tier, sort_order, max_properties, featured_slots, pin_days, monthly_price, yearly_price, listing_days,
    support_level, verified_badge, spotlights_per_month, whatsapp_broadcast, posts_per_month, videos_per_month, excel_import, home_banner, stats_level, max_staff, max_projects) values
    ('owner_1', 'عادية',       'owner',      1, 11,      1, 0,  0,  149,  1252, null, 'normal',    true,  0, false, 0, 0, false, false, 'basic',  null, null),
    ('owner_2', 'مميزة',       'owner',      2, 12,      1, 1,  3,  299,  2512, null, 'priority',  true,  0, true,  0, 0, false, false, 'full',   null, null),
    ('owner_3', 'ذهبية',       'owner',      3, 13,      1, 1,  7,  549,  4612, null, 'dedicated', true,  1, true,  1, 0, false, false, 'report', null, null),
    ('rent_1',   'إيجار — عادية',  'owner_rent',   1, 14, 1, 0, 0,  99,  832, null, 'normal',    true, 0, false, 0, 0, false, false, 'basic',  null, null),
    ('rent_2',   'إيجار — مميزة',  'owner_rent',   2, 15, 1, 1, 3, 199, 1672, null, 'priority',  true, 0, true,  0, 0, false, false, 'full',   null, null),
    ('rent_3',   'إيجار — ذهبية',  'owner_rent',   3, 16, 1, 1, 7, 349, 2932, null, 'dedicated', true, 1, true,  1, 0, false, false, 'report', null, null),
    ('summer_1', 'مصيف — عادية',   'owner_summer', 1, 17, 1, 0, 0, 299, 2512, null, 'normal',    true, 0, false, 0, 0, false, false, 'basic',  null, null),
    ('summer_2', 'مصيف — مميزة',   'owner_summer', 2, 18, 1, 1, 7, 549, 4612, null, 'priority',  true, 1, true,  0, 0, false, false, 'full',   null, null),
    ('summer_3', 'مصيف — ذهبية',   'owner_summer', 3, 19, 1, 1, 15, 999, 8392, null, 'dedicated', true, 2, true,  1, 1, false, false, 'report', null, null),
    ('ind_1',   'أساسية',      'individual', 1, 21,      3, 0,  0,  299,  2512, null, 'normal',    false, 0, false, 0, 0, false, false, 'basic',  null, null),
    ('ind_2',   'برو',         'individual', 2, 22,      6, 1,  7,  599,  5032, null, 'priority',  true,  0, true,  0, 0, false, false, 'full',   null, null),
    ('ind_3',   'بريميوم',     'individual', 3, 23,     10, 2,  7,  999,  8392, null, 'dedicated', true,  1, true,  1, 0, false, false, 'report', null, null),
    ('co_1',    'شركة',        'company',    1, 31,      8, 1,  7,  999,  8392, null, 'priority',  true,  0, false, 0, 0, false, false, 'basic',  2,    null),
    ('co_2',    'شركة بلس',    'company',    2, 32,     15, 3,  7, 1999, 16792, null, 'priority',  true,  1, true,  1, 0, true,  false, 'full',   5,    null),
    ('co_3',    'شركة برو',    'company',    3, 33,     30, 5, 15, 3499, 29392, null, 'dedicated', true,  2, true,  2, 1, true,  false, 'report', 10,   null),
    ('dev_1',   'مطوّر',       'developer',  1, 41, 100000, 1,  7, 2999, 25192, null, 'dedicated', true,  1, true,  1, 0, true,  false, 'full',   null, 1),
    ('dev_2',   'مطوّر بلس',   'developer',  2, 42, 100000, 2, 15, 5999, 50392, null, 'dedicated', true,  2, true,  0, 1, true,  false, 'report', null, 2),
    ('dev_3',   'مطوّر برو',   'developer',  3, 43, 100000, 4, 31, 9999, 83992, null, 'dedicated', true,  4, true,  4, 2, true,  true,  'report', null, 4);
  update public.plans set is_active = false where code in ('free','pro','business','owner_free','owner_plus');

  select plan_trial_days into days from public.app_settings where id = 1;
  ends := now() + make_interval(days => coalesce(days, 30));
  -- Without the triggers: no audit rows or notifications for the backfill, updated_at untouched.
  alter table public.brokers disable trigger user;
  alter table public.properties disable trigger user;
  for r in select id, account_type from public.brokers where is_active and not is_demo and deleted_at is null and not exists (select 1 from public.subscriptions s where s.broker_id = brokers.id and s.status in ('active','trial') and s.ends_at > now()) loop
    insert into public.subscriptions (broker_id, plan_id, status, starts_at, ends_at, provider)
    values (r.id, public.trial_plan_id(public.account_audience(r.account_type)), 'trial', now(), ends, 'trial');
    update public.brokers set plan_id = public.trial_plan_id(public.account_audience(r.account_type)), access_until = ends where id = r.id;
  end loop;
  -- Broker listings now follow the plan, not a per-listing end.
  update public.properties set listed_until = null, listing_notice = 0 where broker_id is not null and review_status in ('approved','pending');
  -- Every owner phone gets the free month too, for each kind it lists (selling / renting / summer); its listings show until then.
  for r in select distinct l.phone_norm ph, public.listing_kind(p.status) k from public.properties p join public.leads l on l.id = p.owner_lead_id
           where p.broker_id is null and l.phone_norm is not null and p.review_status in ('approved','pending') loop
    if public.owner_kind_access_until(r.ph, r.k) is null or public.owner_kind_access_until(r.ph, r.k) <= now() then
      insert into public.owner_plan_grants (phone, plan_id, starts_at, ends_at, note, is_trial)
      values (r.ph, public.trial_plan_id(public.owner_audience(r.k)), now(), ends, 'أول شهر مجانًا', true);
    end if;
    update public.properties p set listed_until = greatest(coalesce(p.listed_until, ends), public.owner_kind_access_until(r.ph, r.k)), listing_notice = 0
    from public.leads l where l.id = p.owner_lead_id and p.broker_id is null and l.phone_norm = r.ph and p.review_status = 'approved'
      and public.listing_kind(p.status) = r.k;
  end loop;
  alter table public.properties enable trigger user;
  alter table public.brokers enable trigger user;
end $$;

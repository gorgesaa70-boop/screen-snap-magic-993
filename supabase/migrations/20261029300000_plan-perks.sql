-- What the plans give, working on the site:
-- 1) Homepage pin: an account pins its listings itself, up to its plan's number, for the plan's days; each pin uses
--    one of the month's pins. The homepage shows a limited number of pinned listings, taking turns (in the site).
-- 2) «متحقق ✓» on accounts whose plan includes it (shown on their cards and profile while the plan runs).
-- 3) «عرض للكل»: one listing a day in the bar every visitor sees, booked by day; each plan has bookings per month.
-- 4) Perks the team does by hand (posts, videos, WhatsApp to interested customers) and paid extras (photos, video,
--    extra pin, extra WhatsApp campaign) become requests in a task list; the account sees each one's status.
-- 5) The top plan of each kind can be capped (the admin sets how many accounts at once; empty = no cap).

alter table public.app_settings
  add column if not exists plan_home_pins smallint not null default 6 check (plan_home_pins between 1 and 30),
  add column if not exists plan_top_tier_cap smallint check (plan_top_tier_cap is null or plan_top_tier_cap between 1 and 1000),
  add column if not exists plan_addon_photos numeric not null default 500 check (plan_addon_photos >= 0),
  add column if not exists plan_addon_video numeric not null default 1000 check (plan_addon_video >= 0),
  add column if not exists plan_addon_photos_video numeric not null default 1300 check (plan_addon_photos_video >= 0),
  add column if not exists plan_addon_pin numeric not null default 150 check (plan_addon_pin >= 0),
  add column if not exists plan_addon_whatsapp numeric not null default 200 check (plan_addon_whatsapp >= 0);

-- ───────────────────────── 2) The «متحقق» badge ─────────────────────────
alter table public.brokers add column if not exists plan_badge boolean not null default false;
grant select (plan_badge) on public.brokers to anon, authenticated;

-- The plan sync also keeps the badge in step with the plan.
create or replace function public.brokers_plan_badge_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare badge boolean;
begin
  select coalesce(pl.verified_badge, false) and not new.is_demo and (new.access_until is null or new.access_until > now()) into badge
  from public.plans pl where pl.id = new.plan_id;
  new.plan_badge := coalesce(badge, false);
  return new;
end $$;
revoke execute on function public.brokers_plan_badge_sync() from public, anon, authenticated;
drop trigger if exists brokers_plan_badge_sync on public.brokers;
create trigger brokers_plan_badge_sync before insert or update of plan_id, access_until, is_demo, plan_badge on public.brokers
  for each row execute function public.brokers_plan_badge_sync();

-- ───────────────────────── 1) Homepage pins ─────────────────────────
-- The listing guard lets the plan functions set a pin (va.plan_sync); everything else is as before.
create or replace function public.properties_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim integer;
begin
  if public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null
     or coalesce(current_setting('va.plan_sync', true), '') = '1' then
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

-- Every pin, for the monthly count.
create table if not exists public.listing_pins (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  broker_id uuid references public.brokers(id) on delete cascade,
  phone text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  extra boolean not null default false,
  created_by uuid default auth.uid()
);
create index if not exists listing_pins_account_idx on public.listing_pins (broker_id, phone, starts_at desc);
alter table public.listing_pins enable row level security;
grant select on public.listing_pins to authenticated;
grant all on public.listing_pins to service_role;
drop policy if exists "account reads own pins" on public.listing_pins;
create policy "account reads own pins" on public.listing_pins for select to authenticated
  using ((broker_id is not null and broker_id = public.current_broker_id()) or (phone is not null and phone = public.my_phone()) or public.staff_can('plans', 'view'));

-- The listing, its account and the plan in force for it (broker account or owner phone + kind), for the perk functions.
-- Only the account holder / manager or the owner (by phone) passes.
create or replace function public.my_perk_context(_property uuid, out property_id uuid, out broker_id uuid, out phone text, out plan public.plans, out access timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare p public.properties; ph text;
begin
  select * into p from public.properties pr where pr.id = _property;
  if p.id is null or p.review_status <> 'approved' then raise exception 'الإعلان لازم يكون منشور' using errcode = 'P0001'; end if;
  if p.broker_id is not null then
    if not (p.broker_id = public.current_broker_id() and public.current_member_role() in ('owner', 'manager')) then
      raise exception 'الإعلان ده مش من إعلاناتك' using errcode = '42501';
    end if;
    property_id := p.id; broker_id := p.broker_id;
    select * into plan from public.broker_plan(p.broker_id);
    select b.access_until into access from public.brokers b where b.id = p.broker_id;
    if exists (select 1 from public.brokers b where b.id = p.broker_id and (b.plan_exempt or b.is_demo)) then access := 'infinity'; end if;
  else
    select l.phone_norm into ph from public.leads l where l.id = p.owner_lead_id;
    if ph is null or ph is distinct from public.my_phone() then raise exception 'الإعلان ده مش من إعلاناتك' using errcode = '42501'; end if;
    property_id := p.id; phone := ph;
    select * into plan from public.owner_kind_plan(ph, public.listing_kind(p.status));
    access := public.owner_kind_access_until(ph, public.listing_kind(p.status));
  end if;
  if access is null or access <= now() then raise exception 'باقتك خلصت. اشترك من «باقتي» الأول' using errcode = 'P0001'; end if;
end $$;
revoke execute on function public.my_perk_context(uuid) from public, anon, authenticated;

create or replace function public.pin_listing(_property uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare c record; used int; running int; ends timestamptz; month_start timestamptz := date_trunc('month', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo';
begin
  select * into c from public.my_perk_context(_property);
  if coalesce((c.plan).featured_slots, 0) = 0 or coalesce((c.plan).pin_days, 0) = 0 then
    raise exception 'باقتك مافيهاش تثبيت على الواجهة. اطلب باقة أعلى أو «تثبيت إضافي»' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.properties where id = _property and is_featured and featured_until > now()) then
    raise exception 'الإعلان ده متثبّت بالفعل' using errcode = 'P0001';
  end if;
  select count(*) into running from public.properties p
  where p.is_featured and p.featured_until > now() and ((c.broker_id is not null and p.broker_id = c.broker_id)
    or (c.phone is not null and p.id in (select pp.id from public.properties pp join public.leads l on l.id = pp.owner_lead_id where pp.broker_id is null and l.phone_norm = c.phone)));
  select count(*) into used from public.listing_pins
  where not extra and starts_at >= month_start and ((c.broker_id is not null and broker_id = c.broker_id) or (c.phone is not null and phone = c.phone));
  if running >= (c.plan).featured_slots or used >= (c.plan).featured_slots then
    raise exception 'استخدمت تثبيتات الشهر (% من %). اطلب «تثبيت إضافي» أو استنى الشهر الجاي', used, (c.plan).featured_slots using errcode = 'P0001';
  end if;
  ends := least(now() + make_interval(days => (c.plan).pin_days), c.access);
  insert into public.listing_pins (property_id, broker_id, phone, ends_at) values (_property, c.broker_id, c.phone, ends);
  perform set_config('va.plan_sync', '1', true);
  update public.properties set is_featured = true, featured_until = ends where id = _property;
  perform set_config('va.plan_sync', '', true);
  return ends;
end $$;
revoke execute on function public.pin_listing(uuid) from public, anon;
grant execute on function public.pin_listing(uuid) to authenticated;

-- What the account has used of its plan this month (for «مميزات باقتي»).
create or replace function public.my_plan_usage()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b uuid := public.current_broker_id(); ph text := public.my_phone(); month_start timestamptz := date_trunc('month', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo';
  mday date := (date_trunc('month', now() at time zone 'Africa/Cairo'))::date;
begin
  if b is null and ph is null then return null; end if;
  return jsonb_build_object(
    'pins', (select count(*) from public.listing_pins where not extra and starts_at >= month_start and ((b is not null and broker_id = b) or (b is null and phone = ph))),
    'spotlights', (select count(*) from public.plan_spotlights where day >= mday and day < (mday + interval '1 month')::date and ((b is not null and broker_id = b) or (b is null and phone = ph))),
    'posts', (select count(*) from public.plan_tasks where kind = 'post' and status <> 'cancelled' and created_at >= month_start and ((b is not null and broker_id = b) or (b is null and phone = ph))),
    'videos', (select count(*) from public.plan_tasks where kind = 'video' and status <> 'cancelled' and created_at >= month_start and ((b is not null and broker_id = b) or (b is null and phone = ph))),
    'whatsapp', (select count(*) from public.plan_tasks where kind = 'whatsapp' and status <> 'cancelled' and created_at >= month_start and ((b is not null and broker_id = b) or (b is null and phone = ph))),
    'booked', (select coalesce(jsonb_agg(jsonb_build_object('day', s.day, 'title', p.title) order by s.day), '[]'::jsonb) from public.plan_spotlights s join public.properties p on p.id = s.property_id
               where s.day >= (now() at time zone 'Africa/Cairo')::date and ((b is not null and s.broker_id = b) or (b is null and s.phone = ph))));
end $$;

-- ───────────────────────── 3) «عرض للكل» ─────────────────────────
create table if not exists public.plan_spotlights (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  property_id uuid not null references public.properties(id) on delete cascade,
  broker_id uuid references public.brokers(id) on delete cascade,
  phone text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.plan_spotlights enable row level security;
grant select on public.plan_spotlights to authenticated;
grant all on public.plan_spotlights to service_role;
drop policy if exists "account reads own spotlights" on public.plan_spotlights;
create policy "account reads own spotlights" on public.plan_spotlights for select to authenticated
  using ((broker_id is not null and broker_id = public.current_broker_id()) or (phone is not null and phone = public.my_phone()) or public.staff_can('plans', 'view'));
drop trigger if exists zz_audit on public.plan_spotlights;
create trigger zz_audit after insert or update or delete on public.plan_spotlights for each row execute function public.audit_row();

-- Which days are taken (no names), for the booking calendar.
create or replace function public.spotlight_taken_days(_from date, _to date)
returns setof date language sql stable security definer set search_path = public as $$
  select day from public.plan_spotlights where day between _from and least(_to, _from + 120) order by day
$$;
revoke execute on function public.spotlight_taken_days(date, date) from public;
grant execute on function public.spotlight_taken_days(date, date) to authenticated;

create or replace function public.book_spotlight(_property uuid, _day date)
returns uuid language plpgsql security definer set search_path = public as $$
declare c record; used int; today date := (now() at time zone 'Africa/Cairo')::date; mday date := date_trunc('month', _day)::date; sid uuid;
begin
  select * into c from public.my_perk_context(_property);
  if coalesce((c.plan).spotlights_per_month, 0) = 0 then raise exception 'باقتك مافيهاش «عرض للكل». اطلب باقة أعلى' using errcode = 'P0001'; end if;
  if _day is null or _day < today or _day > today + 60 then raise exception 'اختار يوم من النهارده لحد شهرين قدام' using errcode = '22023'; end if;
  if (_day::timestamp at time zone 'Africa/Cairo') >= c.access then raise exception 'اليوم ده بعد ما باقتك بتخلص' using errcode = 'P0001'; end if;
  select count(*) into used from public.plan_spotlights
  where day >= mday and day < (mday + interval '1 month')::date and ((c.broker_id is not null and broker_id = c.broker_id) or (c.phone is not null and phone = c.phone));
  if used >= (c.plan).spotlights_per_month then
    raise exception 'استخدمت «عرض للكل» بتاع الشهر ده (% من %)', used, (c.plan).spotlights_per_month using errcode = 'P0001';
  end if;
  begin
    insert into public.plan_spotlights (day, property_id, broker_id, phone) values (_day, _property, c.broker_id, c.phone) returning id into sid;
  exception when unique_violation then
    raise exception 'اليوم ده اتحجز. اختار يوم تاني' using errcode = 'P0001';
  end;
  perform public.notify_team('admin', '«عرض للكل» اتحجز — ' || to_char(_day, 'YYYY-MM-DD'), (select title from public.properties where id = _property), _property, '/admin?tab=plans');
  return sid;
end $$;
revoke execute on function public.book_spotlight(uuid, date) from public, anon;
grant execute on function public.book_spotlight(uuid, date) to authenticated;

-- Today's «عرض للكل» for every visitor (only while the listing is still up).
create or replace function public.today_spotlight()
returns table (id uuid, title text, price numeric, status text, area text, city text, image_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.title, p.price, p.status, p.area, p.city, p.image_url
  from public.plan_spotlights s join public.properties p on p.id = s.property_id
  left join public.brokers b on b.id = p.broker_id
  where s.day = (now() at time zone 'Africa/Cairo')::date and p.review_status = 'approved' and not p.hidden_by_plan
    and (p.listed_until is null or p.listed_until > now())
    and (p.broker_id is null or (b.is_active and (b.access_until is null or b.access_until > now())))
  limit 1
$$;
grant execute on function public.today_spotlight() to anon, authenticated;

-- ───────────────────────── 4) Requests for the team: plan perks and paid extras ─────────────────────────
create table if not exists public.plan_tasks (
  id uuid primary key default gen_random_uuid(),
  task_no bigint generated always as identity,
  kind text not null check (kind in ('post','video','whatsapp','photos','video_shoot','photos_video','extra_pin','extra_whatsapp')),
  property_id uuid references public.properties(id) on delete set null,
  broker_id uuid references public.brokers(id) on delete cascade,
  phone text,
  price numeric not null default 0 check (price >= 0),
  status text not null default 'new' check (status in ('new','scheduled','done','cancelled')),
  scheduled_for date,
  note text check (note is null or char_length(note) <= 500),
  team_note text check (team_note is null or char_length(team_note) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  handled_by uuid,
  handled_at timestamptz
);
create index if not exists plan_tasks_status_idx on public.plan_tasks (status, created_at desc);
alter table public.plan_tasks enable row level security;
grant select on public.plan_tasks to authenticated;
grant all on public.plan_tasks to service_role;
drop policy if exists "account reads own plan tasks" on public.plan_tasks;
create policy "account reads own plan tasks" on public.plan_tasks for select to authenticated
  using ((broker_id is not null and broker_id = public.current_broker_id()) or (phone is not null and phone = public.my_phone()) or public.staff_can('plans', 'view'));
drop trigger if exists zz_audit on public.plan_tasks;
create trigger zz_audit after insert or update or delete on public.plan_tasks for each row execute function public.audit_row();

-- Ask for a perk the plan includes (post / video / WhatsApp: monthly counts) or a paid extra (photos, video, extra pin,
-- extra WhatsApp campaign — priced from the settings; the team confirms the payment, then does it).
create or replace function public.request_plan_task(_kind text, _property uuid, _note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c record; s public.app_settings; used int; lim int; price numeric := 0; tid uuid; month_start timestamptz := date_trunc('month', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo';
  label text;
begin
  select * into c from public.my_perk_context(_property);
  select * into s from public.app_settings where id = 1;
  if _kind in ('post', 'video', 'whatsapp') then
    lim := case _kind when 'post' then (c.plan).posts_per_month when 'video' then (c.plan).videos_per_month
                      else case when (c.plan).whatsapp_broadcast then 4 else 0 end end;
    if coalesce(lim, 0) = 0 then raise exception 'باقتك مافيهاش الميزة دي. اطلب باقة أعلى أو خدمة إضافية' using errcode = 'P0001'; end if;
    select count(*) into used from public.plan_tasks
    where kind = _kind and status <> 'cancelled' and created_at >= month_start and ((c.broker_id is not null and broker_id = c.broker_id) or (c.phone is not null and phone = c.phone));
    if used >= lim then raise exception 'استخدمت المتاح في الشهر ده (% من %)', used, lim using errcode = 'P0001'; end if;
  elsif _kind in ('photos', 'video_shoot', 'photos_video', 'extra_pin', 'extra_whatsapp') then
    price := case _kind when 'photos' then s.plan_addon_photos when 'video_shoot' then s.plan_addon_video when 'photos_video' then s.plan_addon_photos_video
                        when 'extra_pin' then s.plan_addon_pin else s.plan_addon_whatsapp end;
  else
    raise exception 'نوع طلب غير معروف' using errcode = '22023';
  end if;
  insert into public.plan_tasks (kind, property_id, broker_id, phone, price, note) values (_kind, _property, c.broker_id, c.phone, coalesce(price, 0), left(_note, 500)) returning id into tid;
  label := case _kind when 'post' then 'بوست' when 'video' then 'فيديو على الصفحات' when 'whatsapp' then 'رسايل واتساب' when 'photos' then 'تصوير صور'
                      when 'video_shoot' then 'تصوير فيديو' when 'photos_video' then 'تصوير صور + فيديو' when 'extra_pin' then 'تثبيت إضافي' else 'حملة واتساب إضافية' end;
  perform public.notify_team('admin', 'طلب ' || label || case when price > 0 then ' — ' || price || ' ج.م' else '' end,
    coalesce((select name from public.brokers where id = c.broker_id), 'مالك — ' || c.phone) || ' · ' || (select title from public.properties where id = _property), tid, '/admin?tab=plans');
  return tid;
end $$;
revoke execute on function public.request_plan_task(text, uuid, text) from public, anon;
grant execute on function public.request_plan_task(text, uuid, text) to authenticated;

-- The team schedules / finishes / cancels a request; a paid extra pin starts the pin when it's scheduled.
create or replace function public.admin_update_plan_task(_id uuid, _status text, _day date default null, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t public.plan_tasks; uid uuid; ends timestamptz; msg text;
begin
  if not public.staff_can('plans', 'edit') then raise exception 'غير مسموح' using errcode = '42501'; end if;
  if _status not in ('scheduled', 'done', 'cancelled') then raise exception 'حالة غير معروفة' using errcode = '22023'; end if;
  select * into t from public.plan_tasks where id = _id for update;
  if t.id is null then raise exception 'الطلب مش موجود' using errcode = 'P0001'; end if;
  update public.plan_tasks set status = _status, scheduled_for = coalesce(_day, scheduled_for), team_note = coalesce(left(_note, 500), team_note),
    handled_by = auth.uid(), handled_at = now() where id = _id;
  if t.kind = 'extra_pin' and _status in ('scheduled', 'done') and t.status = 'new' and t.property_id is not null then
    ends := now() + interval '7 days';
    insert into public.listing_pins (property_id, broker_id, phone, ends_at, extra) values (t.property_id, t.broker_id, t.phone, ends, true);
    update public.properties set is_featured = true, featured_until = greatest(coalesce(featured_until, now()), ends) where id = t.property_id;
  end if;
  uid := coalesce((select user_id from public.brokers where id = t.broker_id), public.phone_user_id(t.phone));
  msg := case _status when 'scheduled' then 'اتحدد ميعاده' || coalesce(' — ' || to_char(coalesce(_day, t.scheduled_for), 'YYYY-MM-DD'), '')
                      when 'done' then 'اتعمل ✓' else 'اتلغى' end;
  if uid is not null then
    perform public.notify_user(uid, 'request_status', 'طلبك رقم ' || t.task_no || ' ' || msg, coalesce(_note, (select title from public.properties where id = t.property_id)), t.id,
      case when t.broker_id is null then '/my-listings' else '/dashboard?tab=plan' end);
  end if;
end $$;
revoke execute on function public.admin_update_plan_task(uuid, text, date, text) from public, anon;
grant execute on function public.admin_update_plan_task(uuid, text, date, text) to authenticated;

revoke execute on function public.my_plan_usage() from public, anon;
grant execute on function public.my_plan_usage() to authenticated;

-- ───────────────────────── 5) A cap on the top plan ─────────────────────────
create or replace function public.plan_requests_top_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare cap int; pl public.plans; n int;
begin
  select plan_top_tier_cap into cap from public.app_settings where id = 1;
  if cap is null then return new; end if;
  select * into pl from public.plans where id = new.plan_id;
  if pl.tier is distinct from 3 or pl.audience in ('owner', 'owner_rent', 'owner_summer') then return new; end if;
  select count(distinct s.broker_id) into n from public.subscriptions s join public.plans sp on sp.id = s.plan_id
  where s.status = 'active' and s.ends_at > now() and sp.audience = pl.audience and sp.tier = 3 and s.broker_id is distinct from new.broker_id;
  if n >= cap then raise exception 'أماكن باقة «%» مكتملة دلوقتي. اطلب باقة تانية أو كلّم فاليو عقار عشان قايمة الانتظار', pl.name using errcode = 'P0001'; end if;
  return new;
end $$;
revoke execute on function public.plan_requests_top_cap() from public, anon, authenticated;
drop trigger if exists plan_requests_top_cap on public.plan_requests;
create trigger plan_requests_top_cap before insert on public.plan_requests for each row execute function public.plan_requests_top_cap();

-- Accounts on a plan with the badge get it now (without the triggers: no audit rows or notifications).
alter table public.brokers disable trigger user;
update public.brokers b set plan_badge = true
from public.plans pl where pl.id = b.plan_id and pl.verified_badge and not b.is_demo and (b.access_until is null or b.access_until > now()) and not b.plan_badge;
alter table public.brokers enable trigger user;

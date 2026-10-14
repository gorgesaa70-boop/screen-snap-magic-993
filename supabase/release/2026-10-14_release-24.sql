-- فاليو عقار — إصدار 24: «إحالة عميل» — وسيط عنده مشتري بيبعته لوحدة عند وسيط أو شركة أو مطوّر أو عرض مالك،
-- والعميل بيتحفظ باسمه 90 يوم، ونصيبه من العمولة بيتحسب لوحده بعد تأكيد البيع. وسوق الوسطاء اتفتح.
-- مرة واحدة، كله أو مفيش. بيضيف بس (جداول وخانات ودوال جديدة)، ومبيغيّرش نوع أي خانة. لو اتشغل تاني بالغلط مفيش ضرر.
-- بيتنفذ بعد إصدار 23.
--   20261014200000_co-brokerage.sql

begin;
-- «إحالة عميل»: a broker who has a buyer brings them to a unit someone else is selling (another broker, a marketing
-- company, a developer's compound or project, or an owner listing run by Value Aqar).
-- * The unit's side opens it for co-brokerage with a share (% of the commission left after Value Aqar's share).
-- * The referring broker sends the customer; the unit's side is told without the customer's details and accepts or
--   declines within 24 hours. Accepting creates the customer on the unit's side (no automatic transfer away).
-- * The customer stays the referrer's for 90 days with that seller: any unit from the same seller in that time is linked.
-- * On the deal, the seller enters the total commission; after the admin approves the sale the referrer's share is
--   due: (total − Value Aqar's commission) × share. The seller marks it paid, the referrer confirms receipt.
-- Additive only: new tables, new columns, functions; leads_guard gains a flag for inserts made by these functions.

-- 1) Who opens what, and at which share.
alter table public.properties add column if not exists co_broke_share numeric check (co_broke_share is null or (co_broke_share > 0 and co_broke_share <= 90));
alter table public.compounds add column if not exists co_broke_share numeric check (co_broke_share is null or (co_broke_share > 0 and co_broke_share <= 90));
alter table public.projects add column if not exists co_broke_share numeric check (co_broke_share is null or (co_broke_share > 0 and co_broke_share <= 90));
-- Owner listings are run by Value Aqar: one share for all of them (null = closed to referrals).
alter table public.app_settings add column if not exists owner_listing_co_broke_share numeric
  check (owner_listing_co_broke_share is null or (owner_listing_co_broke_share > 0 and owner_listing_co_broke_share <= 90));
-- The seller's total commission on a deal (needed when the customer came through a referral).
alter table public.deals add column if not exists brokerage_total numeric check (brokerage_total is null or brokerage_total >= 0);

-- 2) Referrals.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referral_no bigint generated always as identity unique,
  referrer_id uuid not null references public.brokers(id) on delete restrict,
  created_by uuid default auth.uid(),
  target_kind text not null check (target_kind in ('property','compound','project')),
  property_id uuid references public.properties(id) on delete set null,
  compound_id uuid references public.compounds(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  target_title text not null check (char_length(target_title) <= 200),
  -- The seller: the broker / company / developer, or null when Value Aqar runs it (owner listing, compound without developer).
  owner_id uuid references public.brokers(id) on delete set null,
  share_pct numeric not null check (share_pct > 0 and share_pct <= 90),
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  customer_phone text not null check (char_length(customer_phone) between 8 and 20),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','cancelled')),
  respond_by timestamptz not null default now() + interval '24 hours',
  responded_at timestamptz,
  responded_by uuid,
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 300),
  lead_id uuid references public.leads(id) on delete set null,
  protected_until timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);
create index if not exists referrals_owner_idx on public.referrals (owner_id, status);
create index if not exists referrals_phone_idx on public.referrals (customer_phone, status);
grant select on public.referrals to authenticated;
grant all on public.referrals to service_role;
alter table public.referrals enable row level security;
drop policy if exists "referrer reads own referrals" on public.referrals;
drop policy if exists "team reads referrals" on public.referrals;
-- The seller reads referrals through received_referrals() only (no customer details before accepting).
create policy "referrer reads own referrals" on public.referrals for select to authenticated
  using (referrer_id = public.current_broker_id() and (public.current_member_role() in ('owner','manager') or created_by = auth.uid()));
create policy "team reads referrals" on public.referrals for select to authenticated using (public.has_role(auth.uid(), 'admin') or public.is_staff());

alter table public.leads add column if not exists referral_id uuid references public.referrals(id) on delete set null;
create index if not exists leads_referral_idx on public.leads (referral_id) where referral_id is not null;

-- 3) The referrer's share on each deal.
create table if not exists public.referral_payouts (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete restrict,
  deal_id uuid not null unique references public.deals(id) on delete restrict,
  status text not null default 'expected' check (status in ('expected','due','paid','confirmed','cancelled')),
  amount numeric check (amount is null or amount >= 0),
  paid_at timestamptz,
  paid_by uuid,
  confirmed_at timestamptz,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.referral_payouts to authenticated;
grant all on public.referral_payouts to service_role;
alter table public.referral_payouts enable row level security;
drop policy if exists "parties read payouts" on public.referral_payouts;
drop policy if exists "admin edits payouts" on public.referral_payouts;
create policy "parties read payouts" on public.referral_payouts for select to authenticated using (
  public.has_role(auth.uid(), 'admin') or public.is_staff()
  or (public.current_member_role() in ('owner','manager') and (
    exists (select 1 from public.referrals r where r.id = referral_id and r.referrer_id = public.current_broker_id())
    or exists (select 1 from public.deals d where d.id = deal_id and d.broker_id = public.current_broker_id()))));
create policy "admin edits payouts" on public.referral_payouts for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- 4) Inserts made by the referral functions keep the source, seller and referral they set.
create or replace function public.leads_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_admin boolean := public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role'
    or coalesce(current_setting('va.referral_insert', true), '') = '1';
  staff boolean := public.is_staff();
  role text := public.current_member_role();
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if not (is_admin or staff) then
      -- Public forms: the platform decides source and routing.
      new.source := 'website';
      new.source_note := null;
      new.assigned_broker_id := null;
      new.assigned_member_id := null;
      new.assigned_staff_id := null;
      new.phone_verified := false;
      new.referral_id := null;
      if new.property_id is not null then
        select broker_id into new.assigned_broker_id from public.properties where id = new.property_id and review_status = 'approved';
        new.kind := 'inquiry';
      elsif new.via_broker_id is not null then
        select id into new.assigned_broker_id from public.brokers where id = new.via_broker_id and is_active and suspended_at is null;
        new.kind := 'inquiry';
        new.source_note := 'صفحة الوسيط';
      end if;
    elsif staff and not is_admin then
      new.phone_verified := false;
    end if;
    -- The source a lead arrived with is kept forever.
    new.original_source := new.source;
    if new.assigned_member_id is not null and not exists (
      select 1 from public.company_members m where m.id = new.assigned_member_id and m.company_id = new.assigned_broker_id) then
      new.assigned_member_id := null;
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  new.original_source := old.original_source;
  new.created_by := old.created_by;
  new.via_broker_id := old.via_broker_id;
  if not is_admin then
    new.name := old.name; new.phone := old.phone; new.kind := old.kind; new.details := old.details;
    new.property_type := old.property_type; new.area := old.area; new.budget := old.budget;
    new.property_id := old.property_id;
    new.purpose := old.purpose; new.asking_price := old.asking_price; new.size_m2 := old.size_m2;
    new.phone_verified := old.phone_verified;
    new.source := old.source; new.source_note := old.source_note;
    if coalesce(current_setting('va.referral_link', true), '') <> '1' then new.referral_id := old.referral_id; end if;
    if not staff then
      new.assigned_broker_id := old.assigned_broker_id;
      new.assigned_staff_id := old.assigned_staff_id;
      if role is distinct from 'owner' and role is distinct from 'manager' then
        new.assigned_member_id := old.assigned_member_id;
      end if;
    end if;
  end if;
  -- A team member must belong to the company the lead is assigned to.
  if new.assigned_broker_id is distinct from old.assigned_broker_id and new.assigned_member_id is not distinct from old.assigned_member_id then
    new.assigned_member_id := null;
  end if;
  if new.assigned_member_id is not null and not exists (
    select 1 from public.company_members m where m.id = new.assigned_member_id and m.company_id = new.assigned_broker_id) then
    raise exception 'عضو الفريق ده مش تابع للشركة المسند ليها العميل' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.leads_guard() from public, anon, authenticated;

-- The referrer's 90 days: a new customer (or one moved) to the same seller with the same phone is linked to the
-- referral; a referred customer is the seller's by agreement, so it never moves on automatically.
-- Name order: after leads_t_transfer_deadline, so the deadline it clears is the final one.
create or replace function public.leads_u_referral()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.referrals; seller text;
begin
  if new.referral_id is null and new.assigned_broker_id is not null
     and (tg_op = 'INSERT' or new.assigned_broker_id is distinct from old.assigned_broker_id) then
    select * into r from public.referrals x
    where x.status = 'accepted' and x.protected_until > now() and x.owner_id = new.assigned_broker_id
      and x.customer_phone = public.normalize_phone(new.phone)
    order by x.responded_at limit 1;
    if r.id is not null then
      new.referral_id := r.id;
      select name into seller from public.brokers where id = new.assigned_broker_id;
      perform public.notify_company(r.referrer_id, 'request_status', 'عميلك رجع لـ ' || coalesce(seller, 'نفس البايع'),
        r.customer_name || ' — على وحدة تانية. محفوظ باسمك لحد ' || to_char(r.protected_until at time zone 'Africa/Cairo', 'YYYY-MM-DD'), r.id, '/dashboard');
      perform public.notify_team('admin', 'عميل محال رجع لنفس البايع', 'R-' || lpad(r.referral_no::text, 6, '0') || ' — ' || r.customer_name || ' — ' || coalesce(seller, ''), new.id, '/admin');
    end if;
  end if;
  if new.referral_id is not null then new.transfer_deadline_at := null; end if;
  return new;
end $$;
revoke execute on function public.leads_u_referral() from public, anon, authenticated;
drop trigger if exists leads_u_referral on public.leads;
create trigger leads_u_referral before insert or update on public.leads for each row execute function public.leads_u_referral();

-- 5) Sending, answering and cancelling a referral.
create or replace function public.referral_target(_kind text, _id uuid, out owner_id uuid, out share numeric, out title text, out open boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  open := false;
  if _kind = 'property' then
    select p.broker_id, coalesce(p.co_broke_share, case when p.broker_id is null and p.owner_lead_id is not null then (select owner_listing_co_broke_share from public.app_settings where id = 1) end),
      p.title, p.review_status = 'approved' and not p.is_demo and (p.broker_id is null or exists (select 1 from public.brokers b where b.id = p.broker_id and b.is_active and b.suspended_at is null))
      into owner_id, share, title, open from public.properties p where p.id = _id;
  elsif _kind = 'compound' then
    select c.developer_id, c.co_broke_share, c.name, c.is_active and c.review_status = 'approved'
      into owner_id, share, title, open from public.compounds c where c.id = _id;
  elsif _kind = 'project' then
    select p.developer_id, p.co_broke_share, p.name, p.review_status = 'approved'
      into owner_id, share, title, open from public.projects p where p.id = _id;
  end if;
  open := coalesce(open, false) and share is not null;
end $$;
revoke execute on function public.referral_target(text, uuid) from public, anon, authenticated;

create or replace function public.create_referral(_kind text, _target uuid, _name text, _phone text, _note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_broker_id(); t record; ph text := public.normalize_phone(_phone); rid uuid; rno bigint; mine text;
begin
  if me is null or not exists (select 1 from public.brokers where id = me and is_active and suspended_at is null) then
    raise exception 'الإحالة للوسطاء والشركات المعتمدين بس' using errcode = '42501';
  end if;
  if _kind not in ('property','compound','project') then raise exception 'نوع غير معروف' using errcode = 'P0001'; end if;
  select * into t from public.referral_target(_kind, _target);
  if not coalesce(t.open, false) then raise exception 'الوحدة دي مش مفتوحة للإحالة' using errcode = 'P0001'; end if;
  if t.owner_id = me then raise exception 'دي وحدتك أنت' using errcode = 'P0001'; end if;
  if ph is null or char_length(ph) not between 8 and 20 then raise exception 'اكتب رقم موبايل العميل صح' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(_name, ''))) < 2 then raise exception 'اكتب اسم العميل' using errcode = 'P0001'; end if;
  if (select count(*) from public.referrals where referrer_id = me and status = 'pending') >= 20 then
    raise exception 'عندك 20 إحالة مستنية رد — استنى الردود الأول' using errcode = 'P0001';
  end if;
  -- Nobody takes a customer the seller already has, or one another broker already brought.
  if exists (select 1 from public.referrals x where x.customer_phone = ph and x.owner_id is not distinct from t.owner_id
             and (x.status = 'pending' or (x.status = 'accepted' and x.protected_until > now()))) then
    raise exception 'العميل ده متسجل بإحالة عند البايع ده قبل كده' using errcode = 'P0001';
  end if;
  if t.owner_id is not null and exists (select 1 from public.leads l where l.phone_norm = ph and l.assigned_broker_id = t.owner_id and l.created_at > now() - interval '90 days') then
    raise exception 'العميل ده متسجل عند البايع قبل كده' using errcode = 'P0001';
  end if;
  if t.owner_id is null and exists (select 1 from public.leads l where l.phone_norm = ph and l.created_at > now() - interval '90 days'
      and ((_kind = 'property' and l.property_id = _target) or (_kind = 'compound' and l.compound_id = _target) or (_kind = 'project' and l.project_id = _target))) then
    raise exception 'العميل ده سأل على الوحدة دي قبل كده' using errcode = 'P0001';
  end if;
  insert into public.referrals (referrer_id, target_kind, property_id, compound_id, project_id, target_title, owner_id, share_pct, customer_name, customer_phone, note)
  values (me, _kind, case when _kind = 'property' then _target end, case when _kind = 'compound' then _target end, case when _kind = 'project' then _target end,
          left(t.title, 200), t.owner_id, t.share, left(btrim(_name), 100), ph, nullif(left(btrim(coalesce(_note, '')), 500), ''))
  returning id, referral_no into rid, rno;
  select name into mine from public.brokers where id = me;
  if t.owner_id is not null then
    perform public.notify_company(t.owner_id, 'new_request', 'عندي مشتري لـ ' || left(t.title, 80),
      'إحالة من ' || mine || ' — رد خلال 24 ساعة. بيانات العميل بتظهر بعد القبول.', rid, '/dashboard');
  end if;
  perform public.notify_team('admin', 'إحالة جديدة — ' || left(t.title, 80),
    'R-' || lpad(rno::text, 6, '0') || ' — من ' || mine || case when t.owner_id is null then ' — على فاليو عقار، رد خلال 24 ساعة' else ' — لـ ' || coalesce((select name from public.brokers where id = t.owner_id), '') end, rid, '/admin');
  return rid;
end $$;
revoke execute on function public.create_referral(text, uuid, text, text, text) from public, anon;
grant execute on function public.create_referral(text, uuid, text, text, text) to authenticated;

-- May the signed-in user answer for this referral's seller?
create or replace function public.can_answer_referral(_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin') or (_owner is null and public.is_staff())
    or (_owner is not null and _owner = public.current_broker_id() and public.current_member_role() in ('owner','manager'))
$$;
revoke execute on function public.can_answer_referral(uuid) from public, anon, authenticated;

create or replace function public.accept_referral(_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.referrals; lid uuid; who text; seller text;
begin
  select * into r from public.referrals where id = _id for update;
  if r.id is null or not public.can_answer_referral(r.owner_id) then raise exception 'مش من حقك ترد على الإحالة دي' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'الإحالة دي اترد عليها قبل كده' using errcode = 'P0001'; end if;
  if r.respond_by <= now() then raise exception 'وقت الرد على الإحالة دي خلص' using errcode = 'P0001'; end if;
  select name into who from public.brokers where id = r.referrer_id;
  perform set_config('va.referral_insert', '1', true);
  insert into public.leads (name, phone, kind, source, source_note, details, property_id, compound_id, project_id, assigned_broker_id, referral_id)
  values (r.customer_name, r.customer_phone, 'inquiry', 'referral', left('إحالة من ' || who, 200), r.note,
          r.property_id, r.compound_id, r.project_id, r.owner_id, r.id)
  returning id into lid;
  perform set_config('va.referral_insert', '', true);
  update public.referrals set status = 'accepted', responded_at = now(), responded_by = auth.uid(), lead_id = lid,
    protected_until = now() + interval '90 days' where id = _id;
  seller := coalesce((select name from public.brokers where id = r.owner_id), 'فاليو عقار');
  perform public.notify_company(r.referrer_id, 'request_status', 'إحالتك اتقبلت ✓',
    r.customer_name || ' — ' || r.target_title || ' — مع ' || seller || '. العميل محفوظ باسمك 90 يوم.', r.id, '/dashboard');
  perform public.notify_team('admin', 'إحالة اتقبلت — ' || left(r.target_title, 80), 'R-' || lpad(r.referral_no::text, 6, '0') || ' — ' || who || ' ← ' || seller, lid, '/leads/' || lid);
  return lid;
end $$;
revoke execute on function public.accept_referral(uuid) from public, anon;
grant execute on function public.accept_referral(uuid) to authenticated;

create or replace function public.decline_referral(_id uuid, _reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.referrals;
begin
  select * into r from public.referrals where id = _id for update;
  if r.id is null or not public.can_answer_referral(r.owner_id) then raise exception 'مش من حقك ترد على الإحالة دي' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'الإحالة دي اترد عليها قبل كده' using errcode = 'P0001'; end if;
  update public.referrals set status = 'declined', responded_at = now(), responded_by = auth.uid(),
    decline_reason = nullif(left(btrim(coalesce(_reason, '')), 300), '') where id = _id;
  perform public.notify_company(r.referrer_id, 'request_status', 'إحالتك اترفضت', r.target_title || coalesce(' — ' || nullif(btrim(_reason), ''), '') || ' — عميلك لسه معاك وتقدر تعرضه على حد تاني.', r.id, '/dashboard');
  perform public.notify_team('admin', 'إحالة اترفضت — ' || left(r.target_title, 80), 'R-' || lpad(r.referral_no::text, 6, '0') || coalesce(' — ' || nullif(btrim(_reason), ''), ''), r.id, '/admin');
  return true;
end $$;
revoke execute on function public.decline_referral(uuid, text) from public, anon;
grant execute on function public.decline_referral(uuid, text) to authenticated;

create or replace function public.cancel_referral(_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.referrals;
begin
  select * into r from public.referrals where id = _id for update;
  if r.id is null or not (r.referrer_id = public.current_broker_id() or public.has_role(auth.uid(), 'admin')) then
    raise exception 'مش من حقك' using errcode = '42501';
  end if;
  if r.status <> 'pending' then raise exception 'الإحالة دي اترد عليها خلاص' using errcode = 'P0001'; end if;
  update public.referrals set status = 'cancelled', responded_at = now() where id = _id;
  if r.owner_id is not null then
    perform public.notify_company(r.owner_id, 'request_status', 'الوسيط لغى الإحالة', r.target_title, r.id, '/dashboard');
  end if;
  return true;
end $$;
revoke execute on function public.cancel_referral(uuid) from public, anon;
grant execute on function public.cancel_referral(uuid) to authenticated;

-- Referrals nobody answered within 24 hours expire (scheduled, and also checked when someone opens their list).
create or replace function public.run_referrals()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in update public.referrals set status = 'expired', responded_at = now()
           where status = 'pending' and respond_by <= now() returning * loop
    perform public.notify_company(r.referrer_id, 'request_status', 'إحالتك ماترد عليهاش', r.target_title || ' — عدّت 24 ساعة. عميلك لسه معاك وتقدر تعرضه على حد تاني.', r.id, '/dashboard');
    perform public.notify_team('admin', 'إحالة عدّت 24 ساعة من غير رد', 'R-' || lpad(r.referral_no::text, 6, '0') || ' — ' || r.target_title, r.id, '/admin');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.run_referrals() from public, anon;
grant execute on function public.run_referrals() to authenticated, service_role;

-- Referrals the signed-in seller received (customer details only once accepted).
create or replace function public.received_referrals()
returns table (id uuid, referral_no bigint, referrer_name text, target_kind text, target_title text, share_pct numeric, note text,
  status text, respond_by timestamptz, created_at timestamptz, customer_name text, customer_phone text, lead_id uuid, protected_until timestamptz, decline_reason text)
language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_broker_id();
begin
  if me is null or public.current_member_role() not in ('owner','manager') then return; end if;
  perform public.run_referrals();
  return query select r.id, r.referral_no, b.name, r.target_kind, r.target_title, r.share_pct, r.note, r.status, r.respond_by, r.created_at,
      case when r.status = 'accepted' then r.customer_name end, case when r.status = 'accepted' then r.customer_phone end,
      r.lead_id, r.protected_until, r.decline_reason
    from public.referrals r join public.brokers b on b.id = r.referrer_id
    where r.owner_id = me order by (r.status = 'pending') desc, r.created_at desc limit 200;
end $$;
revoke execute on function public.received_referrals() from public, anon;
grant execute on function public.received_referrals() to authenticated;

-- Referrals the signed-in broker sent, with how far each customer got.
create or replace function public.sent_referrals()
returns table (id uuid, referral_no bigint, seller_name text, target_kind text, target_title text, share_pct numeric, status text,
  respond_by timestamptz, created_at timestamptz, customer_name text, customer_phone text, protected_until timestamptz, decline_reason text,
  stage text, deal_status text)
language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_broker_id();
begin
  if me is null then return; end if;
  perform public.run_referrals();
  return query select r.id, r.referral_no, coalesce(b.name, 'فاليو عقار'), r.target_kind, r.target_title, r.share_pct, r.status, r.respond_by, r.created_at,
      r.customer_name, r.customer_phone, r.protected_until, r.decline_reason, l.stage::text, d.review_status
    from public.referrals r left join public.brokers b on b.id = r.owner_id
    left join public.leads l on l.id = r.lead_id left join public.deals d on d.lead_id = r.lead_id
    where r.referrer_id = me and (public.current_member_role() in ('owner','manager') or r.created_by = auth.uid())
    order by r.created_at desc limit 200;
end $$;
revoke execute on function public.sent_referrals() from public, anon;
grant execute on function public.sent_referrals() to authenticated;

-- Units open for referrals, for brokers (the «سوق الوسطاء» list).
create or replace function public.co_broke_market()
returns table (target_kind text, id uuid, title text, area text, price numeric, image_url text, share_pct numeric, seller_name text)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := public.current_broker_id(); owner_share numeric := (select s.owner_listing_co_broke_share from public.app_settings s where s.id = 1);
begin
  if me is null then return; end if;
  return query
    select 'property'::text, p.id, p.title, p.area, p.price, p.image_url, coalesce(p.co_broke_share, owner_share), coalesce(b.name, 'فاليو عقار')
    from public.properties p left join public.brokers b on b.id = p.broker_id
    where p.review_status = 'approved' and not p.is_demo and not p.hidden_by_plan and (p.listed_until is null or p.listed_until > now())
      and (p.co_broke_share is not null or (p.broker_id is null and p.owner_lead_id is not null and owner_share is not null))
      and p.broker_id is distinct from me and (p.broker_id is null or (b.is_active and b.suspended_at is null))
    union all
    select 'compound', c.id, c.name, c.area, null::numeric, c.images[1], c.co_broke_share, coalesce(b.name, 'فاليو عقار')
    from public.compounds c left join public.brokers b on b.id = c.developer_id
    where c.co_broke_share is not null and c.is_active and c.review_status = 'approved' and c.developer_id is distinct from me
    union all
    select 'project', p.id, p.name, p.area, null::numeric, p.images[1], p.co_broke_share, b.name
    from public.projects p join public.brokers b on b.id = p.developer_id
    where p.co_broke_share is not null and p.review_status = 'approved' and p.developer_id is distinct from me;
end $$;
revoke execute on function public.co_broke_market() from public, anon;
grant execute on function public.co_broke_market() to authenticated;

-- 6) Deals with a referred customer: the total commission is required to send the sale for review, and the
--    referrer's share follows the deal.
create or replace function public.deals_referral_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.review_status = 'pending' and old.review_status is distinct from 'pending' and new.brokerage_total is null
     and exists (select 1 from public.leads l where l.id = new.lead_id and l.referral_id is not null) then
    raise exception 'العميل ده جه بإحالة من وسيط — اكتب إجمالي العمولة على الصفقة قبل الإرسال للمراجعة' using errcode = '23514';
  end if;
  if old.review_status = 'approved' and new.brokerage_total is distinct from old.brokerage_total and not public.has_role(auth.uid(), 'admin') then
    new.brokerage_total := old.brokerage_total;
  end if;
  return new;
end $$;
revoke execute on function public.deals_referral_check() from public, anon, authenticated;
drop trigger if exists deals_referral_check on public.deals;
create trigger deals_referral_check before update on public.deals for each row execute function public.deals_referral_check();

-- The share in money: (total commission − Value Aqar's commission on the deal) × share %.
create or replace function public.referral_share_amount(_deal uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case when d.brokerage_total is null then null
    else round(greatest(d.brokerage_total - coalesce((select c.expected_amount from public.commissions c where c.deal_id = d.id), 0), 0) * r.share_pct / 100, 2) end
  from public.deals d join public.leads l on l.id = d.lead_id join public.referrals r on r.id = l.referral_id
  where d.id = _deal
$$;
revoke execute on function public.referral_share_amount(uuid) from public, anon, authenticated;

create or replace function public.deals_referral_payout()
returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid; r public.referrals; p public.referral_payouts; amt numeric; seller text;
begin
  select l.referral_id into rid from public.leads l where l.id = new.lead_id;
  if rid is null then return null; end if;
  insert into public.referral_payouts (referral_id, deal_id) values (rid, new.id) on conflict (deal_id) do nothing;
  select * into p from public.referral_payouts where deal_id = new.id;
  if new.review_status = 'approved' and p.status = 'expected' then
    amt := public.referral_share_amount(new.id);
    update public.referral_payouts set status = 'due', amount = amt, updated_at = now() where id = p.id;
    select * into r from public.referrals where id = rid;
    seller := coalesce((select name from public.brokers where id = new.broker_id), 'فاليو عقار');
    perform public.notify_company(r.referrer_id, 'request_status', 'مبروك — عميلك اشترى ✓',
      r.customer_name || ' — نصيبك ' || coalesce(to_char(amt, 'FM999G999G999') || ' ج.م', 'هيتحدد من الإدارة') || ' من ' || seller, rid, '/dashboard');
    if new.broker_id is not null then
      perform public.notify_company(new.broker_id, 'request_status', 'نصيب إحالة مستحق',
        r.customer_name || ' — لـ ' || (select name from public.brokers where id = r.referrer_id) || ' — ' || coalesce(to_char(amt, 'FM999G999G999') || ' ج.م', 'هيتحدد من الإدارة'), rid, '/dashboard');
    end if;
    perform public.notify_team('admin', 'نصيب إحالة مستحق', 'R-' || lpad(r.referral_no::text, 6, '0') || ' — ' || coalesce(to_char(amt, 'FM999G999G999') || ' ج.م', 'من غير مبلغ — اكتب إجمالي العمولة'), rid, '/admin');
  end if;
  return null;
end $$;
revoke execute on function public.deals_referral_payout() from public, anon, authenticated;
drop trigger if exists deals_referral_payout on public.deals;
create trigger deals_referral_payout after insert or update on public.deals for each row execute function public.deals_referral_payout();

-- The seller (or the admin) marks the share paid; the referrer (or the admin) confirms receipt.
create or replace function public.mark_referral_paid(_payout uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare p public.referral_payouts; d public.deals; r public.referrals;
begin
  select * into p from public.referral_payouts where id = _payout for update;
  select * into d from public.deals where id = p.deal_id;
  if p.id is null or not (public.has_role(auth.uid(), 'admin') or (d.broker_id is not null and d.broker_id = public.current_broker_id() and public.current_member_role() in ('owner','manager'))) then
    raise exception 'مش من حقك' using errcode = '42501';
  end if;
  if p.status <> 'due' then raise exception 'النصيب ده مش مستحق دلوقتي' using errcode = 'P0001'; end if;
  update public.referral_payouts set status = 'paid', paid_at = now(), paid_by = auth.uid(), updated_at = now() where id = _payout;
  select * into r from public.referrals where id = p.referral_id;
  perform public.notify_company(r.referrer_id, 'request_status', 'نصيب الإحالة اتدفع', r.customer_name || coalesce(' — ' || to_char(p.amount, 'FM999G999G999') || ' ج.م', '') || ' — أكّد الاستلام من «الإحالات»', r.id, '/dashboard');
  perform public.notify_team('admin', 'نصيب إحالة اتدفع', 'R-' || lpad(r.referral_no::text, 6, '0') || coalesce(' — ' || to_char(p.amount, 'FM999G999G999') || ' ج.م', ''), r.id, '/admin');
  return true;
end $$;
revoke execute on function public.mark_referral_paid(uuid) from public, anon;
grant execute on function public.mark_referral_paid(uuid) to authenticated;

create or replace function public.confirm_referral_received(_payout uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare p public.referral_payouts; r public.referrals; d public.deals;
begin
  select * into p from public.referral_payouts where id = _payout for update;
  select * into r from public.referrals where id = p.referral_id;
  if p.id is null or not (public.has_role(auth.uid(), 'admin') or (r.referrer_id = public.current_broker_id() and public.current_member_role() in ('owner','manager'))) then
    raise exception 'مش من حقك' using errcode = '42501';
  end if;
  if p.status not in ('due','paid') then raise exception 'النصيب ده مش مستحق' using errcode = 'P0001'; end if;
  update public.referral_payouts set status = 'confirmed', confirmed_at = now(), paid_at = coalesce(paid_at, now()), updated_at = now() where id = _payout;
  select * into d from public.deals where id = p.deal_id;
  if d.broker_id is not null then
    perform public.notify_company(d.broker_id, 'request_status', 'الوسيط أكّد استلام نصيبه', r.customer_name, r.id, '/dashboard');
  end if;
  perform public.notify_team('admin', 'نصيب إحالة اتسلّم', 'R-' || lpad(r.referral_no::text, 6, '0'), r.id, '/admin');
  return true;
end $$;
revoke execute on function public.confirm_referral_received(uuid) from public, anon;
grant execute on function public.confirm_referral_received(uuid) to authenticated;

-- Shares to pay and to receive for the signed-in company.
create or replace function public.my_referral_payouts()
returns table (id uuid, side text, referral_no bigint, customer_name text, target_title text, other_name text, deal_no bigint,
  sale_value numeric, brokerage_total numeric, va_commission numeric, share_pct numeric, amount numeric, status text, paid_at timestamptz, confirmed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, case when r.referrer_id = public.current_broker_id() then 'receive' else 'pay' end, r.referral_no, r.customer_name, r.target_title,
    case when r.referrer_id = public.current_broker_id() then coalesce((select name from public.brokers where id = d.broker_id), 'فاليو عقار') else (select name from public.brokers where id = r.referrer_id) end,
    d.deal_no, d.sale_value, d.brokerage_total, (select c.expected_amount from public.commissions c where c.deal_id = d.id), r.share_pct,
    coalesce(p.amount, public.referral_share_amount(d.id)), p.status, p.paid_at, p.confirmed_at
  from public.referral_payouts p join public.referrals r on r.id = p.referral_id join public.deals d on d.id = p.deal_id
  where public.current_broker_id() is not null and public.current_member_role() in ('owner','manager')
    and (r.referrer_id = public.current_broker_id() or d.broker_id = public.current_broker_id())
  order by p.created_at desc limit 200
$$;
revoke execute on function public.my_referral_payouts() from public, anon;
grant execute on function public.my_referral_payouts() to authenticated;

-- What the seller's team sees on a referred customer's page.
create or replace function public.lead_referral(_lead uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('referral_no', r.referral_no, 'referrer', b.name, 'share_pct', r.share_pct, 'protected_until', r.protected_until)
  from public.leads l join public.referrals r on r.id = l.referral_id join public.brokers b on b.id = r.referrer_id
  where l.id = _lead and (public.has_role(auth.uid(), 'admin') or public.is_staff() or l.assigned_broker_id = public.current_broker_id())
$$;
revoke execute on function public.lead_referral(uuid) from public, anon;
grant execute on function public.lead_referral(uuid) to authenticated;

-- Admin audit log for the new tables.
do $$
declare t text;
begin
  foreach t in array array['referrals','referral_payouts'] loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

commit;

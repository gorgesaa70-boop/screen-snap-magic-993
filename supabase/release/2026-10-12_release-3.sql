-- فاليو عقار — الإصدار التالت: بيتنفذ بعد 2026-10-11_release.sql و 2026-10-12_release-2.sql، مرة واحدة بس.
-- بيتنفذ كله أو مفيش حاجة بتتغيّر (transaction واحدة). ما تشغلوش مرتين.
-- الملفات بالترتيب:
--   20261012000000_lead-routing.sql
--   20261012100000_rentals.sql

begin;

-- ================= 20261012000000_lead-routing.sql =================
-- Item 28: automatic lead routing + response-time alerts.
-- Admin rules send new unassigned leads to one company or rotate between several. The first response
-- (call, WhatsApp, note, stage or follow-up change) is recorded; leads without one get a reminder to the
-- company after the SLA and an escalation to admins/staff after twice the SLA — counted in working hours only.

-- Settings (single row): SLA minutes and working hours (Cairo time).
alter table public.app_settings
  add column if not exists response_sla_minutes integer not null default 60 check (response_sla_minutes between 5 and 1440),
  add column if not exists work_start_hour smallint not null default 9 check (work_start_hour between 0 and 23),
  add column if not exists work_end_hour smallint not null default 21 check (work_end_hour between 1 and 24);
alter table public.app_settings add constraint app_settings_work_hours_check check (work_end_hour > work_start_hour);

create table public.routing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  priority integer not null default 100,
  is_active boolean not null default true,
  areas text[],            -- null = any area
  property_types text[],   -- null = any type
  kinds text[],            -- request / inquiry / listing; null = any
  sources text[],          -- null = any source
  broker_ids uuid[] not null check (cardinality(broker_ids) between 1 and 50),  -- one = fixed, several = rotate
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index routing_rules_priority_idx on public.routing_rules (is_active, priority);
grant select, insert, update, delete on public.routing_rules to authenticated;
grant all on public.routing_rules to service_role;
alter table public.routing_rules enable row level security;
create policy "admin manages routing rules" on public.routing_rules for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "staff reads routing rules" on public.routing_rules for select to authenticated using (public.is_staff());
drop trigger if exists zz_audit on public.routing_rules;
create trigger zz_audit after insert or update or delete on public.routing_rules for each row execute function public.audit_row();

alter table public.leads
  add column if not exists routed_rule_id uuid references public.routing_rules(id) on delete set null,
  add column if not exists first_response_at timestamptz,
  add column if not exists sla_alerted_at timestamptz,
  add column if not exists sla_escalated_at timestamptz;

-- Pick the company for a new unassigned lead. Fires after leads_guard and before leads_referral_track (name order).
create or replace function public.leads_pick_company()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.routing_rules%rowtype; pick uuid;
begin
  if new.assigned_broker_id is not null or new.assigned_staff_id is not null then return new; end if;
  for r in select * from public.routing_rules where is_active order by priority, created_at loop
    continue when r.areas is not null and not (coalesce(new.area, '') = any(r.areas));
    continue when r.property_types is not null and not (coalesce(new.property_type, '') = any(r.property_types));
    continue when r.kinds is not null and not (new.kind = any(r.kinds));
    continue when r.sources is not null and not (new.source = any(r.sources));
    -- Rotation: the eligible company that has gone longest without a new lead.
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
create trigger leads_pick_company before insert on public.leads for each row execute function public.leads_pick_company();

-- A new company has to respond itself: reset the response clock when the company changes.
create or replace function public.leads_referral_track()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.first_broker_id := old.first_broker_id;
    new.first_referred_at := old.first_referred_at;
    if new.assigned_broker_id is distinct from old.assigned_broker_id then
      new.referred_at := case when new.assigned_broker_id is null then null else now() end;
      new.first_response_at := null; new.sla_alerted_at := null; new.sla_escalated_at := null;
    else
      new.referred_at := old.referred_at;
    end if;
  else
    new.referred_at := case when new.assigned_broker_id is null then null else now() end;
  end if;
  if new.first_broker_id is null and new.assigned_broker_id is not null then
    new.first_broker_id := new.assigned_broker_id;
    new.first_referred_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.leads_referral_track() from public, anon, authenticated;

-- First response = first call / WhatsApp / note / stage / follow-up activity after the referral.
create or replace function public.lead_first_response()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('call','whatsapp','note','status','follow_up') and new.actor_id is not null then
    update public.leads set first_response_at = new.created_at
    where id = new.lead_id and first_response_at is null and assigned_broker_id is not null and referred_at <= new.created_at;
  end if;
  return new;
end $$;
revoke execute on function public.lead_first_response() from public, anon, authenticated;
create trigger lead_activities_first_response after insert on public.lead_activities for each row execute function public.lead_first_response();

-- Minutes between two times that fall inside working hours (Cairo), e.g. 9:00–21:00 every day.
create or replace function public.work_minutes(_from timestamptz, _to timestamptz)
returns numeric language sql stable set search_path = public as $$
  with s as (select response_sla_minutes, work_start_hour, work_end_hour from public.app_settings where id = 1),
  days as (
    select d::date as day from s, generate_series((_from at time zone 'Africa/Cairo')::date, (_to at time zone 'Africa/Cairo')::date, interval '1 day') d
  )
  select coalesce(sum(greatest(0, extract(epoch from (
    least(_to, ((day + make_interval(hours => s.work_end_hour)) at time zone 'Africa/Cairo'))
    - greatest(_from, ((day + make_interval(hours => s.work_start_hour)) at time zone 'Africa/Cairo'))
  )) / 60)), 0)
  from days, s
  where _to > _from
$$;
grant execute on function public.work_minutes(timestamptz, timestamptz) to authenticated, service_role;

-- Response alerts, called from run_reminders().
create or replace function public.run_response_alerts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare sla integer; l public.leads%rowtype; mins numeric; n_alert int := 0; n_esc int := 0; tag text;
begin
  select response_sla_minutes into sla from public.app_settings where id = 1;
  for l in select * from public.leads
      where assigned_broker_id is not null and first_response_at is null and referred_at is not null
        and stage not in ('sold','lost','postponed') and referred_at > now() - interval '14 days'
        and (sla_alerted_at is null or sla_escalated_at is null) loop
    mins := public.work_minutes(l.referred_at, now());
    tag := 'VA-' || lpad(l.lead_no::text, 6, '0') || ' — ' || l.name;
    if mins >= sla and l.sla_alerted_at is null then
      perform public.notify_lead_people(l, 'عميل مستني رد', tag || ' — اتحال من ' || round(mins) || ' دقيقة عمل');
      update public.leads set sla_alerted_at = now() where id = l.id;
      n_alert := n_alert + 1;
    end if;
    if mins >= 2 * sla and l.sla_escalated_at is null then
      perform public.notify_team('admin', 'تأخير رد على عميل',
        tag || ' — ' || coalesce((select name from public.brokers where id = l.assigned_broker_id), '') || ' — ' || round(mins) || ' دقيقة عمل من غير رد',
        l.id, '/leads/' || l.id);
      update public.leads set sla_escalated_at = now() where id = l.id;
      n_esc := n_esc + 1;
    end if;
  end loop;
  return jsonb_build_object('response_alerts', n_alert, 'response_escalations', n_esc);
end $$;
revoke execute on function public.run_response_alerts() from public, anon, authenticated;

-- run_reminders() now also runs the response alerts.
do $$
declare src text;
begin
  select pg_get_functiondef('public.run_reminders()'::regprocedure) into src;
  if position('run_response_alerts' in src) = 0 then
    src := replace(src,
      'return jsonb_build_object(''follow_ups'', n_follow',
      'return public.run_response_alerts() || jsonb_build_object(''follow_ups'', n_follow');
    execute src;
  end if;
end $$;
revoke execute on function public.run_reminders() from public, anon, authenticated;
grant execute on function public.run_reminders() to service_role;

-- Review report: leads still waiting for a first response after the escalation (twice the SLA).
do $$
declare src text; tail text := 'and l.stage_changed_at - l.referred_at < interval ''3 days'';';
begin
  select pg_get_functiondef('public.lead_alerts()'::regprocedure) into src;
  if position('slow_response' in src) = 0 then
    if position(tail in src) = 0 then raise exception 'lead_alerts() changed: cannot add slow_response'; end if;
    src := replace(src, tail, 'and l.stage_changed_at - l.referred_at < interval ''3 days''
  union all
  -- 7) Escalated: still no first response after twice the SLA.
  select ''slow_response'', l.id, l.lead_no, l.name, b.name,
    ''مفيش رد من '' || round(public.work_minutes(l.referred_at, now())) || '' دقيقة عمل'',
    l.sla_escalated_at
  from public.leads l join public.brokers b on b.id = l.assigned_broker_id
  where l.first_response_at is null and l.sla_escalated_at is not null and l.stage not in (''sold'',''lost'',''postponed'');');
    execute src;
  end if;
end $$;
revoke execute on function public.lead_alerts() from public, anon;
grant execute on function public.lead_alerts() to authenticated;


-- ================= 20261012100000_rentals.sql =================
-- Item 39: rentals. Listings can be for sale, monthly rent (إيجار) or summer / holiday rent (مصيف).
-- Summer listings may carry several prices (night, week, month, season); `price` keeps the lowest so
-- existing price filters and sorting keep working, and `price_unit` says what it is per.
-- Deals get a type; commissions use a per-company agreement for each type
-- (rent default: half a month's rent when no rent agreement exists).

-- 1) Listings.
alter table public.properties drop constraint if exists properties_status_check;
alter table public.properties add constraint properties_status_check check (status in ('بيع','إيجار','مصيف'));
alter table public.properties
  add column if not exists price_unit text check (price_unit is null or price_unit in ('night','week','month','season')),
  add column if not exists price_night numeric check (price_night is null or price_night > 0),
  add column if not exists price_week numeric check (price_week is null or price_week > 0),
  add column if not exists price_month numeric check (price_month is null or price_month > 0),
  add column if not exists price_season numeric check (price_season is null or price_season > 0),
  add column if not exists furnished text check (furnished is null or furnished in ('furnished','semi','unfurnished')),
  add column if not exists min_months smallint check (min_months is null or min_months between 1 and 60),
  add column if not exists deposit numeric check (deposit is null or deposit >= 0),
  add column if not exists guests smallint check (guests is null or guests between 1 and 50),
  add column if not exists available_from date,
  add column if not exists available_to date;
update public.properties set price_unit = 'month' where status = 'إيجار' and price_unit is null;

-- Keep rent fields consistent with the listing purpose (runs after properties_guard: name order).
create or replace function public.properties_rent_normalize()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'مصيف' then
    if coalesce(new.price_night, new.price_week, new.price_month, new.price_season) is null then
      raise exception 'حط سعر واحد على الأقل للمصيف (الليلة أو الأسبوع أو الشهر أو الموسم)' using errcode = '23514';
    end if;
    new.price_unit := case
      when new.price_night is not null then 'night' when new.price_week is not null then 'week'
      when new.price_month is not null then 'month' else 'season' end;
    new.price := coalesce(new.price_night, new.price_week, new.price_month, new.price_season);
    new.min_months := null;
  elsif new.status = 'إيجار' then
    new.price_unit := 'month';
    new.price_night := null; new.price_week := null; new.price_season := null; new.guests := null;
    new.price_month := new.price;
  else
    new.price_unit := null;
    new.price_night := null; new.price_week := null; new.price_month := null; new.price_season := null;
    new.furnished := null; new.min_months := null; new.deposit := null; new.guests := null;
    new.available_from := null; new.available_to := null;
  end if;
  if new.available_to is not null and new.available_from is not null and new.available_to < new.available_from then
    raise exception 'تاريخ «متاح لحد» قبل «متاح من»' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists properties_rent_normalize on public.properties;
create trigger properties_rent_normalize before insert or update on public.properties for each row execute function public.properties_rent_normalize();

-- 2) Customer requests and owner offers can be for summer too; an inquiry on a listing takes its purpose.
alter table public.leads drop constraint if exists leads_purpose_check;
alter table public.leads add constraint leads_purpose_check check (purpose is null or purpose in ('sale','rent','summer'));

create or replace function public.leads_purpose_from_property()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.property_id is not null and new.purpose is null then
    select case status when 'إيجار' then 'rent' when 'مصيف' then 'summer' else 'sale' end into new.purpose
    from public.properties where id = new.property_id;
  end if;
  return new;
end $$;
revoke execute on function public.leads_purpose_from_property() from public, anon, authenticated;
drop trigger if exists leads_purpose_from_property on public.leads;
create trigger leads_purpose_from_property before insert on public.leads for each row execute function public.leads_purpose_from_property();

-- 3) Deals: sale, monthly rent or summer booking.
alter table public.deals
  add column if not exists deal_type text not null default 'sale' check (deal_type in ('sale','rent','summer')),
  add column if not exists rent_monthly numeric check (rent_monthly is null or rent_monthly > 0),
  add column if not exists rent_start date,
  add column if not exists rent_end date;
alter table public.deals add constraint deals_rent_dates_check check (rent_end is null or rent_start is null or rent_end >= rent_start);
-- New deals take their type from the lead's purpose.
create or replace function public.deals_type_from_lead()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.deal_type = 'sale' then
    select case purpose when 'rent' then 'rent' when 'summer' then 'summer' else 'sale' end into new.deal_type
    from public.leads where id = new.lead_id;
  end if;
  if new.deal_type = 'rent' and new.review_status = 'pending' and coalesce(new.rent_monthly, 0) = 0 then
    raise exception 'اكتب الإيجار الشهري قبل الإرسال للمراجعة' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.deals_type_from_lead() from public, anon, authenticated;
drop trigger if exists deals_type_from_lead on public.deals;
-- 'deals_aa_type' fires before deals_guard (name order) so the guard sees the final type.
create trigger deals_aa_type before insert or update on public.deals for each row execute function public.deals_type_from_lead();

-- 4) Agreements per deal type.
alter table public.company_agreements
  add column if not exists deal_type text not null default 'sale' check (deal_type in ('sale','rent','summer'));

create or replace function public.agreement_for(_broker uuid, _on date, _type text)
returns public.company_agreements language sql stable security definer set search_path = public as $$
  select * from public.company_agreements
  where broker_id = _broker and deal_type = coalesce(_type, 'sale')
    and effective_from <= coalesce(_on, current_date) and (effective_to is null or effective_to >= coalesce(_on, current_date))
  order by effective_from desc limit 1
$$;
revoke execute on function public.agreement_for(uuid, date, text) from public, anon, authenticated;

-- Agreement type can't change once recorded.
create or replace function public.agreements_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.rate is distinct from old.rate or new.fixed_amount is distinct from old.fixed_amount or new.deal_type is distinct from old.deal_type
       or new.effective_from is distinct from old.effective_from or new.broker_id is distinct from old.broker_id then
      raise exception 'شروط الاتفاقية مايتعدّلوش — اقفل الاتفاقية وأضف واحدة جديدة' using errcode = '42501';
    end if;
    new.approved_by := old.approved_by; new.approved_at := old.approved_at;
  else
    new.approved_by := auth.uid(); new.approved_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.agreements_guard() from public, anon, authenticated;

-- Commission basis by type: sale → sale value; rent → monthly rent (default 50% = half a month);
-- summer → booking total (sale_value).
create or replace function public.deals_commission_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare a public.company_agreements%rowtype; basis numeric; c public.commissions%rowtype; l public.leads%rowtype; v_rate numeric; v_fixed numeric;
begin
  basis := case new.deal_type when 'rent' then new.rent_monthly else coalesce(new.sale_value, new.contract_value) end;
  a := public.agreement_for(new.broker_id, coalesce(new.sale_date, new.contract_date, new.rent_start, current_date), new.deal_type);
  v_rate := a.rate; v_fixed := a.fixed_amount;
  if a.id is null and new.deal_type = 'rent' then v_rate := 50; end if;
  if tg_op = 'INSERT' then
    insert into public.commissions (deal_id, broker_id, agreement_id, basis_value, rate, fixed_amount, expected_amount)
    values (new.id, new.broker_id, a.id, basis, v_rate, v_fixed, public.commission_amount(basis, v_rate, v_fixed));
    return new;
  end if;
  select * into c from public.commissions where deal_id = new.id;
  if c.id is null then return new; end if;
  if c.status = 'expected' then
    perform set_config('va.internal', '1', true);
    update public.commissions set broker_id = new.broker_id, agreement_id = a.id, basis_value = basis, rate = v_rate, fixed_amount = v_fixed,
      expected_amount = public.commission_amount(basis, v_rate, v_fixed),
      status = case when new.review_status = 'approved' then 'pending_review' else 'expected' end
    where id = c.id;
    perform set_config('va.internal', '', true);
    if new.review_status = 'approved' and old.review_status is distinct from 'approved' then
      select * into l from public.leads where id = new.lead_id;
      perform public.notify_admins('admin', 'عمولة بانتظار الاعتماد',
        'C-' || lpad(c.commission_no::text, 6, '0') || ' — ' || l.name || coalesce(' — ' || (select name from public.brokers where id = new.broker_id), ''),
        new.lead_id, '/commissions');
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.deals_commission_sync() from public, anon, authenticated;


commit;

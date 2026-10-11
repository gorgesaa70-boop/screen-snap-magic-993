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

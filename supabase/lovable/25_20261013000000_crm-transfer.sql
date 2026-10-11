-- Value Aqar — Lovable apply file 25 of 26 (source: supabase/migrations/20261013000000_crm-transfer.sql).
-- Apply this whole file as one migration, exactly as written.

-- CRM phase 4: automatic transfer. A company has the SLA (default 60 working minutes) from the moment the lead is
-- actually assigned to it to record a real contact (phase 3 outcomes). Otherwise a server job moves the lead to the
-- next eligible company by the routing rules, up to a maximum number of companies, then to an admin queue.
-- Investment requests and owner listings stay out of it. Every move is logged as an assignment period.

alter table public.app_settings
  add column if not exists transfer_enabled boolean not null default true,
  add column if not exists transfer_max_companies smallint not null default 3 check (transfer_max_companies between 1 and 10);

alter table public.leads
  add column if not exists transfer_deadline_at timestamptz,
  add column if not exists admin_queue_at timestamptz,
  add column if not exists admin_queue_reason text check (admin_queue_reason is null or char_length(admin_queue_reason) <= 200);
create index if not exists leads_transfer_due_idx on public.leads (transfer_deadline_at) where transfer_deadline_at is not null and first_response_at is null;
create index if not exists leads_admin_queue_idx on public.leads (admin_queue_at) where admin_queue_at is not null;

-- _from + N working minutes (Cairo working hours from app_settings), the counterpart of work_minutes().
create or replace function public.add_work_minutes(_from timestamptz, _mins numeric)
returns timestamptz language plpgsql stable set search_path = public as $$
declare s record; t timestamptz := _from; left_m numeric := greatest(_mins, 0); d date; ws timestamptz; we timestamptz; avail numeric; guard int := 0;
begin
  select work_start_hour, work_end_hour into s from public.app_settings where id = 1;
  loop
    guard := guard + 1; exit when guard > 400;
    d := (t at time zone 'Africa/Cairo')::date;
    ws := (d + make_interval(hours => s.work_start_hour)) at time zone 'Africa/Cairo';
    we := (d + make_interval(hours => s.work_end_hour)) at time zone 'Africa/Cairo';
    if t < ws then t := ws; end if;
    if t >= we then t := ((d + 1) + make_interval(hours => s.work_start_hour)) at time zone 'Africa/Cairo'; continue; end if;
    avail := extract(epoch from (we - t)) / 60;
    if avail >= left_m then return t + make_interval(secs => left_m * 60); end if;
    left_m := left_m - avail;
    t := ((d + 1) + make_interval(hours => s.work_start_hour)) at time zone 'Africa/Cairo';
  end loop;
  return t;
end $$;
grant execute on function public.add_work_minutes(timestamptz, numeric) to authenticated, service_role;

-- Leads that take part in automatic transfer.
create or replace function public.lead_transferable(_kind text, _stage text)
returns boolean language sql immutable as $$
  select _kind not in ('investment','listing') and _stage not in ('sold','lost','postponed')
$$;

-- The deadline starts at the real assignment to a company (also a manual one) and stops on closing.
-- Name order: runs after leads_pick_company and leads_referral_track, so referred_at is already set.
create or replace function public.leads_transfer_deadline()
returns trigger language plpgsql security definer set search_path = public as $$
declare sla integer; enabled boolean;
begin
  select response_sla_minutes, transfer_enabled into sla, enabled from public.app_settings where id = 1;
  if new.assigned_broker_id is not null then new.admin_queue_at := null; new.admin_queue_reason := null; end if;
  if new.assigned_broker_id is null or not public.lead_transferable(new.kind, new.stage::text) or new.first_response_at is not null then
    new.transfer_deadline_at := null;
  elsif tg_op = 'INSERT' or new.assigned_broker_id is distinct from old.assigned_broker_id then
    new.transfer_deadline_at := case when coalesce(enabled, true) then public.add_work_minutes(coalesce(new.referred_at, now()), coalesce(sla, 60)) end;
  end if;
  return new;
end $$;
revoke execute on function public.leads_transfer_deadline() from public, anon, authenticated;
drop trigger if exists leads_t_transfer_deadline on public.leads;
create trigger leads_t_transfer_deadline before insert or update on public.leads
  for each row execute function public.leads_transfer_deadline();

-- The assignment period keeps the deadline it started with.
create or replace function public.lead_assignment_deadline()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.broker_id is not null then
    select l.transfer_deadline_at into new.deadline_at from public.leads l where l.id = new.lead_id;
  end if;
  return new;
end $$;
revoke execute on function public.lead_assignment_deadline() from public, anon, authenticated;
drop trigger if exists lead_assignment_deadline on public.lead_assignments;
create trigger lead_assignment_deadline before insert on public.lead_assignments
  for each row execute function public.lead_assignment_deadline();

-- Next eligible company: the routing rules that match the lead, in priority order; active, not suspended, and not
-- one of the companies that already had this lead. Within a rule, the one that has gone longest without a lead.
create or replace function public.next_transfer_company(_lead public.leads)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare r public.routing_rules%rowtype; pick uuid;
begin
  for r in select * from public.routing_rules where is_active order by priority, created_at loop
    continue when r.areas is not null and not (coalesce(_lead.area, '') = any(r.areas));
    continue when r.property_types is not null and not (coalesce(_lead.property_type, '') = any(r.property_types));
    continue when r.kinds is not null and not (_lead.kind = any(r.kinds));
    continue when r.sources is not null and not (_lead.source = any(r.sources));
    select b.id into pick
    from unnest(r.broker_ids) as x(id) join public.brokers b on b.id = x.id
    where b.is_active and b.suspended_at is null
      and not exists (select 1 from public.lead_assignments a where a.lead_id = _lead.id and a.broker_id = b.id)
    order by (select max(a.created_at) from public.lead_assignments a where a.broker_id = b.id) nulls first, b.created_at
    limit 1;
    if pick is not null then return pick; end if;
  end loop;
  return null;
end $$;
revoke execute on function public.next_transfer_company(public.leads) from public, anon, authenticated;

-- Job run log (every scheduled run and its result or error).
create table if not exists public.job_runs (
  id bigint generated always as identity primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error text
);
create index if not exists job_runs_job_idx on public.job_runs (job, started_at desc);
grant select on public.job_runs to authenticated;
grant all on public.job_runs to service_role;
alter table public.job_runs enable row level security;
create policy "admins read job runs" on public.job_runs for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- The transfer job. Safe to run concurrently or twice: each due lead is locked (SKIP LOCKED), re-checked, and moved
-- with a conditional update, so it can never be transferred twice or sit with two companies.
create or replace function public.run_lead_transfers()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  st record; l public.leads%rowtype; nxt uuid; had integer; reason text; old_name text; tag text;
  moved int := 0; queued int := 0; run_id bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.has_role(auth.uid(), 'admin') then
    raise exception 'غير مصرح' using errcode = '42501';
  end if;
  select transfer_enabled, transfer_max_companies into st from public.app_settings where id = 1;
  insert into public.job_runs (job) values ('lead_transfers') returning id into run_id;
  if not coalesce(st.transfer_enabled, true) then
    update public.job_runs set finished_at = now(), result = '{"disabled":true}' where id = run_id;
    return '{"disabled":true}';
  end if;

  for l in
    select * from public.leads
    where transfer_deadline_at <= now() and first_response_at is null and assigned_broker_id is not null
      and public.lead_transferable(kind, stage::text)
    order by transfer_deadline_at
    limit 200
    for update skip locked
  loop
    tag := 'VA-' || lpad(l.lead_no::text, 6, '0') || ' — ' || l.name;
    select name into old_name from public.brokers where id = l.assigned_broker_id;
    select count(distinct broker_id) into had from public.lead_assignments where lead_id = l.id and broker_id is not null;
    reason := null;
    if exists (select 1 from public.lead_activities a where a.lead_id = l.id and a.outcome = 'wrong_number' and a.created_at >= coalesce(l.referred_at, l.created_at)) then
      reason := 'الرقم غلط — محتاج مراجعة';
    elsif had >= st.transfer_max_companies then
      reason := 'عدّى على ' || had || ' شركات من غير تواصل';
    else
      nxt := public.next_transfer_company(l);
      if nxt is null then reason := 'مفيش شركة تانية مؤهلة'; end if;
    end if;

    -- Tell the assignment log why this period ends and how the next one starts (read by log_lead_assignment).
    perform set_config('va.assign_end_reason', case when reason is null then 'timeout' else 'admin_queue' end, true);
    perform set_config('va.assign_source', 'auto_transfer', true);
    perform set_config('va.assign_note', coalesce(reason, 'انتهت مهلة ' || coalesce(old_name, 'الشركة')), true);
    if reason is null then
      update public.leads set assigned_broker_id = nxt, assigned_member_id = null
      where id = l.id and assigned_broker_id = l.assigned_broker_id and first_response_at is null;
      if found then
        moved := moved + 1;
        perform public.notify_company(l.assigned_broker_id, 'admin', 'العميل اتنقل لشركة تانية', tag || ' — انتهت المهلة من غير تسجيل تواصل', l.id, '/inquiries');
      end if;
    else
      update public.leads set assigned_broker_id = null, assigned_member_id = null, admin_queue_at = now(), admin_queue_reason = reason
      where id = l.id and assigned_broker_id = l.assigned_broker_id and first_response_at is null;
      if found then
        queued := queued + 1;
        perform public.notify_company(l.assigned_broker_id, 'admin', 'العميل اتسحب لإدارة فاليو عقار', tag || ' — انتهت المهلة من غير تسجيل تواصل', l.id, '/inquiries');
        perform public.notify_team('admin', 'عميل في طابور الإدارة', tag || ' — ' || reason, l.id, '/leads/' || l.id);
      end if;
    end if;
    perform set_config('va.assign_end_reason', '', true);
    perform set_config('va.assign_source', '', true);
    perform set_config('va.assign_note', '', true);
  end loop;

  update public.job_runs set finished_at = now(), result = jsonb_build_object('moved', moved, 'admin_queue', queued) where id = run_id;
  return jsonb_build_object('moved', moved, 'admin_queue', queued);
end $$;
revoke execute on function public.run_lead_transfers() from public, anon;
grant execute on function public.run_lead_transfers() to authenticated, service_role;

-- With automatic transfer on, the company gets a heads-up before the lead moves (at 75% of the SLA) instead of
-- the old "late" reminder; admins hear about leads in their queue from the job itself.
create or replace function public.run_response_alerts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare sla integer; enabled boolean; l public.leads%rowtype; mins numeric; n_alert int := 0; n_esc int := 0; tag text;
begin
  select response_sla_minutes, transfer_enabled into sla, enabled from public.app_settings where id = 1;
  for l in select * from public.leads
      where assigned_broker_id is not null and first_response_at is null and referred_at is not null
        and stage not in ('sold','lost','postponed') and referred_at > now() - interval '14 days'
        and (sla_alerted_at is null or sla_escalated_at is null) loop
    mins := public.work_minutes(l.referred_at, now());
    tag := 'VA-' || lpad(l.lead_no::text, 6, '0') || ' — ' || l.name;
    if coalesce(enabled, true) and l.transfer_deadline_at is not null then
      if mins >= 0.75 * sla and l.sla_alerted_at is null then
        perform public.notify_lead_people(l, 'سجّل التواصل قبل ما العميل يتنقل', tag || ' — فاضل حوالي ' || greatest(1, round(sla - mins)) || ' دقيقة');
        update public.leads set sla_alerted_at = now() where id = l.id;
        n_alert := n_alert + 1;
      end if;
      continue;
    end if;
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

-- Existing open leads with a company and no contact get a deadline from now (no surprise transfers on release day).
update public.leads set transfer_deadline_at = public.add_work_minutes(now(), coalesce((select response_sla_minutes from public.app_settings where id = 1), 60))
where assigned_broker_id is not null and first_response_at is null and public.lead_transferable(kind, stage::text);

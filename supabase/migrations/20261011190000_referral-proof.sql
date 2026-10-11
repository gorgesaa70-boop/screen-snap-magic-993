-- Item 13: proof of where a customer came from (protects Value Aqar's commission).
-- Every lead keeps the first company it was referred to and when, plus a full assignment history;
-- admins and staff get a report of suspicious patterns to review.

alter table public.leads
  add column if not exists first_broker_id uuid references public.brokers(id) on delete set null,
  add column if not exists first_referred_at timestamptz,
  add column if not exists referred_at timestamptz;
update public.leads set first_broker_id = assigned_broker_id, first_referred_at = created_at, referred_at = created_at
where assigned_broker_id is not null and first_referred_at is null;

-- Runs after leads_guard (triggers fire in name order), so it sees the final assignment.
create or replace function public.leads_referral_track()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- The first referral is permanent evidence.
    new.first_broker_id := old.first_broker_id;
    new.first_referred_at := old.first_referred_at;
    if new.assigned_broker_id is distinct from old.assigned_broker_id then
      new.referred_at := case when new.assigned_broker_id is null then null else now() end;
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
create trigger leads_referral_track before insert or update on public.leads for each row execute function public.leads_referral_track();

-- Assignment history (who had the lead, from when, changed by whom). Admin and staff only.
create table public.lead_assignments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  broker_id uuid references public.brokers(id) on delete set null,
  member_id uuid references public.company_members(id) on delete set null,
  staff_id uuid,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index lead_assignments_lead_idx on public.lead_assignments (lead_id, created_at);
grant select on public.lead_assignments to authenticated;
grant all on public.lead_assignments to service_role;
alter table public.lead_assignments enable row level security;
create policy "admin and staff read assignment history" on public.lead_assignments for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.is_staff());

insert into public.lead_assignments (lead_id, broker_id, member_id, staff_id, created_at)
select id, assigned_broker_id, assigned_member_id, assigned_staff_id, coalesce(first_referred_at, created_at)
from public.leads where assigned_broker_id is not null or assigned_staff_id is not null;

create or replace function public.log_lead_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_broker_id is null and new.assigned_staff_id is null then return new; end if;
  elsif new.assigned_broker_id is not distinct from old.assigned_broker_id
    and new.assigned_member_id is not distinct from old.assigned_member_id
    and new.assigned_staff_id is not distinct from old.assigned_staff_id then
    return new;
  end if;
  insert into public.lead_assignments (lead_id, broker_id, member_id, staff_id, changed_by)
  values (new.id, new.assigned_broker_id, new.assigned_member_id, new.assigned_staff_id, auth.uid());
  return new;
end $$;
revoke execute on function public.log_lead_assignment() from public, anon, authenticated;
create trigger leads_assignment_log after insert or update on public.leads for each row execute function public.log_lead_assignment();

-- Review report. Thresholds: 7 days without follow-up, 3 days for a "quick" sale or loss.
create or replace function public.lead_alerts()
returns table (kind text, lead_id uuid, lead_no bigint, lead_name text, broker_name text, detail text, happened_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or public.is_staff()) then
    raise exception 'غير مصرح لك بهذا التقرير' using errcode = '42501';
  end if;
  return query
  -- 1) Referred lead left without follow-up.
  select 'stale'::text, l.id, l.lead_no, l.name, b.name,
    'اتحال للشركة من ' || (current_date - l.referred_at::date) || ' يوم ومفيش نشاط من ' ||
      (current_date - greatest(l.referred_at, coalesce((select max(a.created_at) from public.lead_activities a where a.lead_id = l.id), l.referred_at))::date) || ' يوم',
    greatest(l.referred_at, coalesce((select max(a.created_at) from public.lead_activities a where a.lead_id = l.id), l.referred_at))
  from public.leads l join public.brokers b on b.id = l.assigned_broker_id
  where l.stage in ('new','contacted','qualified')
    and l.referred_at < now() - interval '7 days'
    and coalesce(l.follow_up_at, '-infinity') < now()
    and not exists (select 1 from public.lead_activities a where a.lead_id = l.id and a.created_at > now() - interval '7 days')
  union all
  -- 2) Sale with no visit and no reservation, or within 3 days of the referral.
  select 'sudden_sale', l.id, l.lead_no, l.name, b.name,
    case when l.visit_at is null and d.reservation_date is null then 'بيع من غير زيارة ولا حجز متسجلين'
         else 'البيع اتسجل بعد ' || (d.sale_date - l.referred_at::date) || ' يوم بس من الإحالة' end,
    coalesce(d.sale_requested_at, d.updated_at)
  from public.deals d join public.leads l on l.id = d.lead_id left join public.brokers b on b.id = d.broker_id
  where d.review_status in ('pending','approved') and d.sale_date is not null
    and ((l.visit_at is null and d.reservation_date is null) or (l.referred_at is not null and d.sale_date - l.referred_at::date < 3))
  union all
  -- 3) The company changed after the first referral.
  select 'company_changed', l.id, l.lead_no, l.name, b.name,
    'اتحال الأول لـ ' || coalesce(f.name, '—') || ' يوم ' || to_char(l.first_referred_at at time zone 'Africa/Cairo', 'YYYY-MM-DD') ||
      case when exists (select 1 from public.deals d where d.lead_id = l.id) then ' — وعليه صفقة' else '' end,
    l.referred_at
  from public.leads l left join public.brokers b on b.id = l.assigned_broker_id left join public.brokers f on f.id = l.first_broker_id
  where l.first_broker_id is not null and l.assigned_broker_id is distinct from l.first_broker_id
  union all
  -- 4) Dates out of order: deal dates before the lead existed or before the referral.
  select 'bad_dates', l.id, l.lead_no, l.name, b.name,
    concat_ws(' · ',
      case when d.reservation_date < l.created_at::date then 'الحجز قبل تسجيل العميل' end,
      case when d.sale_date < l.created_at::date then 'البيع قبل تسجيل العميل' end,
      case when l.first_referred_at is not null and d.reservation_date < l.first_referred_at::date then 'الحجز قبل الإحالة' end,
      case when l.first_referred_at is not null and d.sale_date < l.first_referred_at::date then 'البيع قبل الإحالة' end),
    d.updated_at
  from public.deals d join public.leads l on l.id = d.lead_id left join public.brokers b on b.id = d.broker_id
  where d.reservation_date < l.created_at::date or d.sale_date < l.created_at::date
     or (l.first_referred_at is not null and (d.reservation_date < l.first_referred_at::date or d.sale_date < l.first_referred_at::date))
  union all
  -- 5) Same customer phone held by more than one company.
  select 'dup_companies', l.id, l.lead_no, l.name, b.name,
    'نفس الرقم عند ' || x.n || ' شركات',
    l.created_at
  from public.leads l join public.brokers b on b.id = l.assigned_broker_id
  join (select phone_norm, count(distinct assigned_broker_id) n from public.leads
        where assigned_broker_id is not null and phone_norm is not null group by phone_norm having count(distinct assigned_broker_id) > 1) x
    on x.phone_norm = l.phone_norm
  union all
  -- 6) Closed as "lost" within 3 days of the referral — worth a call to the customer.
  select 'quick_lost', l.id, l.lead_no, l.name, b.name,
    'اتقفل «لم يكتمل» بعد ' || extract(day from (l.stage_changed_at - l.referred_at))::int || ' يوم من الإحالة — السبب: ' || coalesce(l.lost_reason, '—'),
    l.stage_changed_at
  from public.leads l join public.brokers b on b.id = l.assigned_broker_id
  where l.stage = 'lost' and l.referred_at is not null and l.stage_changed_at is not null
    and l.stage_changed_at - l.referred_at < interval '3 days';
end $$;
revoke execute on function public.lead_alerts() from public, anon;
grant execute on function public.lead_alerts() to authenticated;

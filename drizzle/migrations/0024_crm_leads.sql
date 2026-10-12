-- CRM phase 3: contact outcomes, lead ↔ project / unit, and a fuller assignment history.

-- 1. Contact outcome on calls / WhatsApp. Pressing "call" is not proof of contact: only a recorded outcome
--    "reached" or "callback" (or moving the lead to "contacted" or a later stage) counts as the first real contact.
alter table public.lead_activities
  add column if not exists outcome text check (outcome is null or outcome in ('no_answer','reached','callback','wrong_number','other'));
alter table public.lead_activities drop constraint if exists lead_activities_outcome_kind;
alter table public.lead_activities add constraint lead_activities_outcome_kind check (outcome is null or kind in ('call','whatsapp'));

alter table public.leads
  add column if not exists first_response_by uuid,
  add column if not exists first_response_outcome text;

create or replace function public.lead_first_response()
returns trigger language plpgsql security definer set search_path = public as $$
declare real_contact boolean;
begin
  real_contact := new.actor_id is not null and (
    (new.kind in ('call','whatsapp') and new.outcome in ('reached','callback'))
    or (new.kind = 'status' and split_part(new.summary, ' → ', 2) in ('contacted','qualified','visit_scheduled','visited','reserved','contracted','sold'))
  );
  if real_contact then
    update public.leads set first_response_at = new.created_at, first_response_by = new.actor_id,
      first_response_outcome = coalesce(new.outcome, 'stage')
    where id = new.lead_id and first_response_at is null and assigned_broker_id is not null and referred_at <= new.created_at;
  end if;
  -- A wrong number goes to Value Aqar for review instead of silently stopping the follow-up.
  if new.outcome = 'wrong_number' then
    perform public.notify_team('admin', 'رقم عميل غلط',
      (select 'VA-' || lpad(l.lead_no::text, 6, '0') || ' — ' || l.name || coalesce(' — ' || b.name, '')
       from public.leads l left join public.brokers b on b.id = l.assigned_broker_id where l.id = new.lead_id),
      new.lead_id, '/leads/' || new.lead_id);
  end if;
  return new;
end $$;
revoke execute on function public.lead_first_response() from public, anon, authenticated;

-- 2. Lead ↔ project / unit (inquiries from a project page were only written in the details text).
alter table public.leads
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists project_unit_id uuid references public.project_units(id) on delete set null;
create index if not exists leads_project_idx on public.leads (project_id);

create or replace function public.leads_project_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and not (public.has_role(auth.uid(), 'admin') or public.is_staff() or coalesce(auth.role(), '') = 'service_role') then
    new.project_id := old.project_id; new.project_unit_id := old.project_unit_id;
    return new;
  end if;
  if new.project_unit_id is not null then
    select u.project_id into new.project_id from public.project_units u where u.id = new.project_unit_id;
  end if;
  -- Public forms may only point at published projects.
  if new.project_id is not null and not exists (select 1 from public.projects p where p.id = new.project_id and p.review_status = 'approved')
     and not (public.has_role(auth.uid(), 'admin') or public.is_staff() or coalesce(auth.role(), '') = 'service_role') then
    new.project_id := null; new.project_unit_id := null;
  end if;
  return new;
end $$;
revoke execute on function public.leads_project_link() from public, anon, authenticated;
drop trigger if exists leads_project_link on public.leads;
create trigger leads_project_link before insert or update of project_id, project_unit_id on public.leads
  for each row execute function public.leads_project_link();

-- 3. Assignment history: each row is one period of responsibility, closed when the lead moves on.
alter table public.lead_assignments
  add column if not exists source text check (source is null or source in ('routing','manual','auto_transfer','system')),
  add column if not exists deadline_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists end_reason text check (end_reason is null or end_reason in ('reassigned','timeout','closed','admin_queue')),
  add column if not exists outcome text,
  add column if not exists note text check (note is null or char_length(note) <= 300);

create or replace function public.log_lead_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare src text;
begin
  if tg_op = 'INSERT' then
    if new.assigned_broker_id is null and new.assigned_staff_id is null then return new; end if;
  elsif new.assigned_broker_id is not distinct from old.assigned_broker_id
    and new.assigned_member_id is not distinct from old.assigned_member_id
    and new.assigned_staff_id is not distinct from old.assigned_staff_id then
    return new;
  end if;
  src := coalesce(nullif(current_setting('va.assign_source', true), ''),
    case when tg_op = 'INSERT' and new.routed_rule_id is not null then 'routing'
         when auth.uid() is null then 'system' else 'manual' end);
  if tg_op = 'UPDATE' then
    update public.lead_assignments set ended_at = now(),
      end_reason = coalesce(nullif(current_setting('va.assign_end_reason', true), ''), 'reassigned'),
      outcome = coalesce(outcome, old.first_response_outcome)
    where lead_id = new.id and ended_at is null;
  end if;
  insert into public.lead_assignments (lead_id, broker_id, member_id, staff_id, changed_by, source, note)
  values (new.id, new.assigned_broker_id, new.assigned_member_id, new.assigned_staff_id, auth.uid(), src,
          nullif(current_setting('va.assign_note', true), ''));
  return new;
end $$;
revoke execute on function public.log_lead_assignment() from public, anon, authenticated;
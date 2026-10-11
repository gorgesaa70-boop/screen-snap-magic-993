-- Item 11: leads center — lead number, source tracking, duplicate detection, assignment to staff / company team members.

alter table public.leads
  add column if not exists lead_no bigint generated always as identity,
  add column if not exists source text not null default 'website'
    check (source in ('website','whatsapp','facebook','instagram','tiktok','google_ads','referral','phone_call','walk_in','manual','excel','other')),
  add column if not exists original_source text,
  add column if not exists source_note text check (source_note is null or char_length(source_note) <= 200),
  add column if not exists phone_norm text generated always as (public.normalize_phone(phone)) stored,
  add column if not exists assigned_member_id uuid references public.company_members(id) on delete set null,
  add column if not exists assigned_staff_id uuid,
  add column if not exists created_by uuid;
update public.leads set original_source = source where original_source is null;
alter table public.leads alter column original_source set not null;
create unique index if not exists leads_lead_no_uidx on public.leads (lead_no);
create index if not exists leads_phone_norm_idx on public.leads (phone_norm);
create index if not exists leads_assigned_member_idx on public.leads (assigned_member_id) where assigned_member_id is not null;
create index if not exists leads_assigned_staff_idx on public.leads (assigned_staff_id) where assigned_staff_id is not null;

-- The signed-in user's team membership id (null for account owners and everyone else).
create or replace function public.my_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select m.id from public.company_members m
  join public.brokers b on b.id = m.company_id
  where m.is_active and b.is_active and b.suspended_at is null
    and public.normalize_phone(m.phone) = public.my_phone()
    and not exists (select 1 from public.brokers own where own.user_id = auth.uid() and own.is_active)
  limit 1
$$;
revoke execute on function public.my_member_id() from public, anon;
grant execute on function public.my_member_id() to authenticated;

-- Owner and managers see every lead of the company; sales staff and affiliated brokers only the ones assigned to them.
drop policy if exists "broker reads assigned leads" on public.leads;
drop policy if exists "broker updates assigned leads" on public.leads;
create policy "company reads its leads" on public.leads for select to authenticated
  using (assigned_broker_id = public.current_broker_id()
    and (public.current_member_role() in ('owner','manager') or assigned_member_id = public.my_member_id()));
create policy "company updates its leads" on public.leads for update to authenticated
  using (assigned_broker_id = public.current_broker_id()
    and (public.current_member_role() in ('owner','manager') or assigned_member_id = public.my_member_id()))
  with check (assigned_broker_id = public.current_broker_id());

-- Managers can see their team (to assign leads); owners already manage it.
create policy "manager reads team" on public.company_members for select to authenticated
  using (company_id = public.current_broker_id() and public.current_member_role() = 'manager');

create or replace function public.leads_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_admin boolean := public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role';
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
      if new.property_id is not null then
        select broker_id into new.assigned_broker_id from public.properties where id = new.property_id and review_status = 'approved';
        new.kind := 'inquiry';
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
  if not is_admin then
    new.name := old.name; new.phone := old.phone; new.kind := old.kind; new.details := old.details;
    new.property_type := old.property_type; new.area := old.area; new.budget := old.budget;
    new.property_id := old.property_id;
    new.purpose := old.purpose; new.asking_price := old.asking_price; new.size_m2 := old.size_m2;
    new.phone_verified := old.phone_verified;
    new.source := old.source; new.source_note := old.source_note;
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

-- History: also record source changes and team / staff assignments.
alter table public.lead_activities drop constraint if exists lead_activities_kind_check;
alter table public.lead_activities add constraint lead_activities_kind_check
  check (kind in ('call','whatsapp','status','note','follow_up','assign','source'));

create or replace function public.log_lead_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.id, auth.uid(), 'status', old.stage || ' → ' || new.stage);
  end if;
  if new.notes is distinct from old.notes and coalesce(new.notes,'') <> '' then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.id, auth.uid(), 'note', left(new.notes, 1000));
  end if;
  if new.follow_up_at is distinct from old.follow_up_at then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.id, auth.uid(), 'follow_up', coalesce(to_char(new.follow_up_at at time zone 'Africa/Cairo','YYYY-MM-DD HH24:MI'), 'cleared'));
  end if;
  if new.assigned_broker_id is distinct from old.assigned_broker_id then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.id, auth.uid(), 'assign', coalesce((select name from public.brokers where id = new.assigned_broker_id), 'unassigned'));
  end if;
  if new.assigned_member_id is distinct from old.assigned_member_id then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.id, auth.uid(), 'assign', 'فريق: ' || coalesce((select name from public.company_members where id = new.assigned_member_id), 'بدون'));
  end if;
  if new.assigned_staff_id is distinct from old.assigned_staff_id then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.id, auth.uid(), 'assign', case when new.assigned_staff_id is null then 'موظف فاليو عقار: بدون' else 'موظف فاليو عقار' end);
  end if;
  if new.source is distinct from old.source or new.source_note is distinct from old.source_note then
    insert into public.lead_activities(lead_id, actor_id, kind, summary)
    values (new.id, auth.uid(), 'source', old.source || ' → ' || new.source || coalesce(' (' || new.source_note || ')', '') || ' · الأصلي: ' || new.original_source);
  end if;
  return new;
end $$;
revoke execute on function public.log_lead_changes() from public, anon, authenticated;

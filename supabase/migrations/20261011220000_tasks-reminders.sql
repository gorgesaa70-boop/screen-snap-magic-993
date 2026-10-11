-- Item 18: follow-ups, tasks and reminders on top of the existing notifications.
-- Reminders are produced by run_reminders(), called by the scheduled notifications job; each fires once.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  notes text check (notes is null or char_length(notes) <= 1000),
  due_at timestamptz,
  assigned_to uuid not null,
  created_by uuid default auth.uid(),
  done_at timestamptz,
  done_by uuid,
  reminded_at timestamptz,
  created_at timestamptz not null default now()
);
create index tasks_assigned_idx on public.tasks (assigned_to, done_at, due_at);
create index tasks_lead_idx on public.tasks (lead_id);
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;

-- People the current user may hand a task to: themselves, their company (owner/managers assign to the team),
-- and for admins / staff, Value Aqar staff and admins.
create or replace function public.assignable_users()
returns table (user_id uuid, label text)
language sql stable security definer set search_path = public as $$
  select auth.uid(), 'أنا'
  union
  select b.user_id, b.name || ' (صاحب الحساب)' from public.brokers b
  where b.id = public.current_broker_id() and b.user_id is not null and public.current_member_role() in ('owner','manager')
  union
  select public.member_user_id(m.id), m.name from public.company_members m
  where m.company_id = public.current_broker_id() and m.is_active and public.current_member_role() in ('owner','manager')
    and public.member_user_id(m.id) is not null
  union
  select r.user_id, case when r.role::text = 'admin' then 'أدمن' else 'موظف فاليو عقار' end || coalesce(' — ' || nullif(u.raw_user_meta_data->>'full_name', ''), ' — +' || u.phone, '')
  from public.user_roles r join auth.users u on u.id = r.user_id
  where r.role::text in ('admin','staff') and (public.has_role(auth.uid(), 'admin') or public.is_staff())
$$;
revoke execute on function public.assignable_users() from public, anon;
grant execute on function public.assignable_users() to authenticated;

create policy "task visible to its people" on public.tasks for select to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or public.has_role(auth.uid(), 'admin') or public.is_staff()
    or (public.current_member_role() in ('owner','manager') and exists (select 1 from public.assignable_users() a where a.user_id = assigned_to)));
create policy "create tasks for allowed people" on public.tasks for insert to authenticated
  with check (created_by = auth.uid()
    and exists (select 1 from public.assignable_users() a where a.user_id = assigned_to)
    and (lead_id is null or exists (select 1 from public.leads l where l.id = lead_id)));
create policy "assignee or creator updates task" on public.tasks for update to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (assigned_to = auth.uid() or created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "creator deletes open task" on public.tasks for delete to authenticated
  using ((created_by = auth.uid() and done_at is null) or public.has_role(auth.uid(), 'admin'));

create or replace function public.tasks_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.done_at := null; new.done_by := null; new.reminded_at := null;
  else
    new.created_by := old.created_by; new.lead_id := old.lead_id;
    -- The assignee can only tick it done/undone; the creator (or admin) can edit everything else.
    if auth.uid() is distinct from old.created_by and not public.has_role(auth.uid(), 'admin') then
      new.title := old.title; new.notes := old.notes; new.due_at := old.due_at; new.assigned_to := old.assigned_to;
    elsif new.assigned_to is distinct from old.assigned_to
      and not exists (select 1 from public.assignable_users() a where a.user_id = new.assigned_to) then
      raise exception 'مينفعش تسند المهمة للشخص ده' using errcode = '42501';
    end if;
    if new.done_at is not null and old.done_at is null then new.done_at := now(); new.done_by := auth.uid(); end if;
    if new.done_at is null then new.done_by := null; end if;
    if new.due_at is distinct from old.due_at then new.reminded_at := null; end if;
  end if;
  return new;
end $$;
revoke execute on function public.tasks_guard() from public, anon, authenticated;
create trigger tasks_guard before insert or update on public.tasks for each row execute function public.tasks_guard();

create or replace function public.notify_on_task()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) and new.assigned_to is distinct from auth.uid() then
    perform public.notify_user(new.assigned_to, 'new_request', 'مهمة جديدة ليك', new.title ||
      coalesce(' — ' || to_char(new.due_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI'), ''), new.lead_id, '/tasks');
  end if;
  return new;
end $$;
revoke execute on function public.notify_on_task() from public, anon, authenticated;
create trigger tasks_notify after insert or update on public.tasks for each row execute function public.notify_on_task();

-- Once-only markers for reminders.
alter table public.leads
  add column if not exists reminded_follow_up_at timestamptz,
  add column if not exists reminded_visit_at timestamptz;
alter table public.deals
  add column if not exists review_reminded_at timestamptz,
  add column if not exists docs_reminded_at timestamptz;
alter table public.commissions add column if not exists due_reminded_on date;

-- Everyone working a lead: assigned team member, otherwise the company owner + managers; plus the assigned staff member.
create or replace function public.notify_lead_people(_lead public.leads, _title text, _msg text)
returns void language plpgsql security definer set search_path = public as $$
declare mu uuid;
begin
  if _lead.assigned_member_id is not null then mu := public.member_user_id(_lead.assigned_member_id); end if;
  if mu is not null then
    perform public.notify_user(mu, 'request_status', _title, _msg, _lead.id, '/leads/' || _lead.id);
  elsif _lead.assigned_broker_id is not null then
    perform public.notify_company(_lead.assigned_broker_id, 'request_status', _title, _msg, _lead.id, '/leads/' || _lead.id);
  end if;
  if _lead.assigned_staff_id is not null then
    perform public.notify_user(_lead.assigned_staff_id, 'request_status', _title, _msg, _lead.id, '/leads/' || _lead.id);
  end if;
  if _lead.assigned_broker_id is null and _lead.assigned_staff_id is null then
    perform public.notify_team('admin', _title, _msg, _lead.id, '/leads/' || _lead.id);
  end if;
end $$;
revoke execute on function public.notify_lead_people(public.leads, text, text) from public, anon, authenticated;

create or replace function public.run_reminders()
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.leads%rowtype; t public.tasks%rowtype; c record; d record;
  n_follow int := 0; n_visit int := 0; n_task int := 0; n_comm int := 0; n_review int := 0; n_docs int := 0;
  tag text;
begin
  -- Follow-up time reached.
  for l in select * from public.leads where follow_up_at <= now() and follow_up_at > now() - interval '7 days'
      and stage not in ('sold','lost') and reminded_follow_up_at is distinct from follow_up_at loop
    tag := 'VA-' || lpad(l.lead_no::text, 6, '0') || ' — ' || l.name;
    perform public.notify_lead_people(l, 'حان ميعاد متابعة عميل', tag);
    update public.leads set reminded_follow_up_at = l.follow_up_at where id = l.id;
    n_follow := n_follow + 1;
  end loop;
  -- Visit within the next 24 hours.
  for l in select * from public.leads where stage = 'visit_scheduled' and visit_at between now() and now() + interval '24 hours'
      and reminded_visit_at is distinct from visit_at loop
    tag := 'VA-' || lpad(l.lead_no::text, 6, '0') || ' — ' || l.name || ' — ' || to_char(l.visit_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI');
    perform public.notify_lead_people(l, 'تذكير: زيارة خلال 24 ساعة', tag);
    update public.leads set reminded_visit_at = l.visit_at where id = l.id;
    n_visit := n_visit + 1;
  end loop;
  -- Overdue tasks.
  for t in select * from public.tasks where done_at is null and due_at <= now() and reminded_at is null loop
    perform public.notify_user(t.assigned_to, 'request_status', 'مهمة متأخرة', t.title, t.lead_id, '/tasks');
    update public.tasks set reminded_at = now() where id = t.id;
    n_task := n_task + 1;
  end loop;
  -- Commission due date reached (once per day while unpaid).
  for c in select * from public.commissions where status in ('approved','partially_paid') and due_date <= current_date
      and due_reminded_on is distinct from current_date loop
    perform public.notify_company(c.broker_id, 'request_status', 'عمولة مستحقة الدفع',
      'C-' || lpad(c.commission_no::text, 6, '0') || ' — المتبقي ' || (c.expected_amount - c.paid_amount) || ' ج.م', null, '/commissions');
    perform public.notify_admins('admin', 'عمولة مستحقة', 'C-' || lpad(c.commission_no::text, 6, '0') || ' — ' ||
      coalesce((select name from public.brokers where id = c.broker_id), '') || ' — المتبقي ' || (c.expected_amount - c.paid_amount) || ' ج.م', null, '/commissions');
    perform set_config('va.internal', '1', true);
    update public.commissions set due_reminded_on = current_date where id = c.id;
    perform set_config('va.internal', '', true);
    n_comm := n_comm + 1;
  end loop;
  -- Sale waiting for admin review for more than 2 days.
  for d in select dl.*, le.name lead_name from public.deals dl join public.leads le on le.id = dl.lead_id
      where dl.review_status = 'pending' and dl.sale_requested_at < now() - interval '2 days' and dl.review_reminded_at is null loop
    perform public.notify_admins('admin', 'صفقة مستنية مراجعة من يومين', 'D-' || lpad(d.deal_no::text, 6, '0') || ' — ' || d.lead_name, d.lead_id, '/leads/' || d.lead_id);
    update public.deals set review_reminded_at = now() where id = d.id;
    n_review := n_review + 1;
  end loop;
  -- Reservation / contract recorded 2+ days ago without its document.
  for d in select dl.* from public.deals dl
      where dl.review_status <> 'approved' and dl.docs_reminded_at is null and dl.updated_at < now() - interval '2 days'
        and ((dl.reservation_date is not null and not exists (select 1 from public.deal_documents x where x.deal_id = dl.id and x.kind = 'reservation'))
          or (dl.contract_date is not null and not exists (select 1 from public.deal_documents x where x.deal_id = dl.id and x.kind = 'contract'))) loop
    select * into l from public.leads where id = d.lead_id;
    perform public.notify_lead_people(l, 'مستند ناقص في صفقة', 'D-' || lpad(d.deal_no::text, 6, '0') || ' — ارفع مستند الحجز أو العقد');
    update public.deals set docs_reminded_at = now() where id = d.id;
    n_docs := n_docs + 1;
  end loop;
  return jsonb_build_object('follow_ups', n_follow, 'visits', n_visit, 'tasks', n_task, 'commissions', n_comm, 'reviews', n_review, 'documents', n_docs);
end $$;
revoke execute on function public.run_reminders() from public, anon, authenticated;
grant execute on function public.run_reminders() to service_role;

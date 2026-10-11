-- فاليو عقار — الإصدار التاني: بيتنفذ بعد 2026-10-11_release.sql، مرة واحدة بس.
-- بيتنفذ كله أو مفيش حاجة بتتغيّر (transaction واحدة). ما تشغلوش مرتين.
-- الملفات بالترتيب:
--   20261011200000_commissions.sql
--   20261011210000_audit-log.sql
--   20261011220000_tasks-reminders.sql
--   20261011230000_contact-policy.sql
--   20261011240000_deal-units.sql

begin;

-- ================= 20261011200000_commissions.sql =================
-- Item 15: commissions and Value Aqar revenue.
-- Each company has a commission agreement (rate or fixed amount). Every deal gets one commission:
-- 'expected' while the deal is open, 'pending_review' once the sale is approved, then the admin approves it
-- (amount + due date). Payments are recorded with proof and move it to partially_paid / paid.
-- Only admins change commissions; companies can read their own. Financial rows are never deleted.

create table public.company_agreements (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references public.brokers(id) on delete restrict,
  rate numeric check (rate is null or (rate > 0 and rate <= 100)),
  fixed_amount numeric check (fixed_amount is null or fixed_amount > 0),
  effective_from date not null default current_date,
  effective_to date,
  notes text check (notes is null or char_length(notes) <= 500),
  approved_by uuid default auth.uid(),
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((rate is null) <> (fixed_amount is null)),
  check (effective_to is null or effective_to >= effective_from)
);
create index company_agreements_broker_idx on public.company_agreements (broker_id, effective_from desc);
grant select, insert, update on public.company_agreements to authenticated;
grant all on public.company_agreements to service_role;
alter table public.company_agreements enable row level security;
create policy "admin manages agreements" on public.company_agreements for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "staff reads agreements" on public.company_agreements for select to authenticated using (public.is_staff());
create policy "company reads own agreements" on public.company_agreements for select to authenticated
  using (broker_id = public.current_broker_id() and public.current_member_role() in ('owner','manager'));

create or replace function public.agreements_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- Terms are history: an agreement can only be closed (effective_to); new terms = new agreement.
    if new.rate is distinct from old.rate or new.fixed_amount is distinct from old.fixed_amount
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
create trigger agreements_guard before insert or update on public.company_agreements for each row execute function public.agreements_guard();

-- Agreement in force for a company on a date.
create or replace function public.agreement_for(_broker uuid, _on date)
returns public.company_agreements language sql stable security definer set search_path = public as $$
  select * from public.company_agreements
  where broker_id = _broker and effective_from <= coalesce(_on, current_date) and (effective_to is null or effective_to >= coalesce(_on, current_date))
  order by effective_from desc limit 1
$$;
revoke execute on function public.agreement_for(uuid, date) from public, anon, authenticated;

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  commission_no bigint generated always as identity unique,
  deal_id uuid not null unique references public.deals(id) on delete restrict,
  broker_id uuid references public.brokers(id) on delete set null,
  agreement_id uuid references public.company_agreements(id) on delete set null,
  basis_value numeric check (basis_value is null or basis_value >= 0),
  rate numeric check (rate is null or (rate > 0 and rate <= 100)),
  fixed_amount numeric check (fixed_amount is null or fixed_amount > 0),
  expected_amount numeric check (expected_amount is null or expected_amount >= 0),
  paid_amount numeric not null default 0 check (paid_amount >= 0),
  due_date date,
  status text not null default 'expected'
    check (status in ('expected','pending_review','approved','partially_paid','paid','disputed','cancelled')),
  status_note text check (status_note is null or char_length(status_note) <= 500),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index commissions_broker_idx on public.commissions (broker_id);
create index commissions_status_idx on public.commissions (status);
grant select, update on public.commissions to authenticated;
grant all on public.commissions to service_role;
alter table public.commissions enable row level security;
create policy "admin reads commissions" on public.commissions for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admin updates commissions" on public.commissions for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create policy "staff reads commissions" on public.commissions for select to authenticated using (public.is_staff());
create policy "company reads own commissions" on public.commissions for select to authenticated
  using (broker_id = public.current_broker_id() and public.current_member_role() in ('owner','manager'));

create or replace function public.commission_amount(_basis numeric, _rate numeric, _fixed numeric)
returns numeric language sql immutable as $$
  select case when _fixed is not null then _fixed when _rate is not null and _basis is not null then round(_basis * _rate / 100, 2) end
$$;

create or replace function public.commissions_guard()
returns trigger language plpgsql security definer set search_path = public as $$
-- Internal updates (from deals and payments) set va.internal for the current transaction.
declare service boolean := coalesce(auth.role(), '') = 'service_role' or auth.uid() is null or current_setting('va.internal', true) = '1';
begin
  new.deal_id := old.deal_id;
  new.updated_at := now();
  if service then return new; end if;
  -- Money received is driven by the payments table only.
  new.paid_amount := old.paid_amount;
  if old.status in ('paid','cancelled') and new.status is not distinct from old.status then
    raise exception 'العمولة دي مقفولة (%) ومينفعش تتعدّل', old.status using errcode = '42501';
  end if;
  if new.rate is distinct from old.rate or new.fixed_amount is distinct from old.fixed_amount or new.basis_value is distinct from old.basis_value then
    if old.status not in ('expected','pending_review','disputed') then
      raise exception 'قيمة العمولة المعتمدة مايتعدّلش — حوّلها لـ «متنازع عليها» الأول' using errcode = '42501';
    end if;
    new.expected_amount := public.commission_amount(new.basis_value, new.rate, new.fixed_amount);
  end if;
  if new.status is distinct from old.status then
    case new.status
      when 'approved' then
        if old.status not in ('pending_review','disputed') then raise exception 'العمولة بتتعتمد بعد اعتماد البيع' using errcode = '23514'; end if;
        if new.expected_amount is null or new.due_date is null then raise exception 'حدد قيمة العمولة وميعاد استحقاقها قبل الاعتماد' using errcode = '23514'; end if;
        new.approved_by := auth.uid(); new.approved_at := now();
        if new.paid_amount > 0 then new.status := case when new.paid_amount >= new.expected_amount then 'paid' else 'partially_paid' end; end if;
      when 'disputed', 'cancelled' then
        if coalesce(trim(new.status_note), '') = '' then raise exception 'اكتب السبب' using errcode = '23514'; end if;
        if new.status = 'cancelled' and new.paid_amount > 0 then raise exception 'فيه مبالغ متحصّلة على العمولة دي — مينفعش تتلغي' using errcode = '23514'; end if;
      when 'pending_review' then
        if old.status <> 'expected' then raise exception 'حالة مش مسموحة' using errcode = '23514'; end if;
      else
        raise exception 'الحالة دي بتتحدّث لوحدها' using errcode = '23514';
    end case;
  end if;
  return new;
end $$;
revoke execute on function public.commissions_guard() from public, anon, authenticated;
create trigger commissions_guard before update on public.commissions for each row execute function public.commissions_guard();

-- One commission per deal, kept in step with the deal until the sale is approved.
create or replace function public.deals_commission_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare a public.company_agreements%rowtype; basis numeric; c public.commissions%rowtype; l public.leads%rowtype;
begin
  basis := coalesce(new.sale_value, new.contract_value);
  a := public.agreement_for(new.broker_id, coalesce(new.sale_date, new.contract_date, current_date));
  if tg_op = 'INSERT' then
    insert into public.commissions (deal_id, broker_id, agreement_id, basis_value, rate, fixed_amount, expected_amount)
    values (new.id, new.broker_id, a.id, basis, a.rate, a.fixed_amount, public.commission_amount(basis, a.rate, a.fixed_amount));
    return new;
  end if;
  select * into c from public.commissions where deal_id = new.id;
  if c.id is null then return new; end if;
  if c.status = 'expected' then
    perform set_config('va.internal', '1', true);
    update public.commissions set broker_id = new.broker_id, agreement_id = a.id, basis_value = basis, rate = a.rate, fixed_amount = a.fixed_amount,
      expected_amount = public.commission_amount(basis, a.rate, a.fixed_amount),
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
create trigger deals_commission_sync after insert or update on public.deals for each row execute function public.deals_commission_sync();

-- Deals opened before this release get their commission now.
insert into public.commissions (deal_id, broker_id, agreement_id, basis_value, rate, fixed_amount, expected_amount, status)
select d.id, d.broker_id, a.id, coalesce(d.sale_value, d.contract_value), a.rate, a.fixed_amount,
  public.commission_amount(coalesce(d.sale_value, d.contract_value), a.rate, a.fixed_amount),
  case when d.review_status = 'approved' then 'pending_review' else 'expected' end
from public.deals d left join lateral (select * from public.agreement_for(d.broker_id, coalesce(d.sale_date, d.contract_date, current_date))) a on true
where not exists (select 1 from public.commissions c where c.deal_id = d.id);

-- Payments (full or partial) with proof; admin-recorded, never edited or deleted.
create table public.commission_payments (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions(id) on delete restrict,
  amount numeric not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'transfer' check (method in ('transfer','cash','cheque','instapay','other')),
  reference text check (reference is null or char_length(reference) <= 100),
  proof_path text check (proof_path is null or char_length(proof_path) <= 300),
  notes text check (notes is null or char_length(notes) <= 300),
  recorded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index commission_payments_commission_idx on public.commission_payments (commission_id, paid_on);
grant select, insert on public.commission_payments to authenticated;
grant all on public.commission_payments to service_role;
alter table public.commission_payments enable row level security;
create policy "admin records payments" on public.commission_payments for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin') and recorded_by = auth.uid());
create policy "payments visible with their commission" on public.commission_payments for select to authenticated
  using (exists (select 1 from public.commissions c where c.id = commission_id));

create or replace function public.commission_payments_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.commissions%rowtype; paid numeric; l public.leads%rowtype;
begin
  select * into c from public.commissions where id = new.commission_id for update;
  if c.status not in ('approved','partially_paid','disputed') then
    raise exception 'الدفعات بتتسجل على عمولة معتمدة بس' using errcode = '23514';
  end if;
  paid := c.paid_amount + new.amount;
  if paid > c.expected_amount then
    raise exception 'المبلغ أكبر من المتبقي (% ج.م)', c.expected_amount - c.paid_amount using errcode = '23514';
  end if;
  perform set_config('va.internal', '1', true);
  update public.commissions set paid_amount = paid,
    status = case when c.status = 'disputed' then 'disputed' when paid >= c.expected_amount then 'paid' else 'partially_paid' end
  where id = c.id;
  perform set_config('va.internal', '', true);
  select l2.* into l from public.deals d join public.leads l2 on l2.id = d.lead_id where d.id = c.deal_id;
  perform public.notify_company(c.broker_id, 'request_status', 'اتسجلت دفعة عمولة',
    'C-' || lpad(c.commission_no::text, 6, '0') || ' — ' || new.amount || ' ج.م — المتبقي ' || (c.expected_amount - paid) || ' ج.م', l.id, '/commissions');
  return new;
end $$;
revoke execute on function public.commission_payments_apply() from public, anon, authenticated;
create trigger commission_payments_apply after insert on public.commission_payments for each row execute function public.commission_payments_apply();

-- Approval notice to the company.
create or replace function public.notify_on_commission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform public.notify_company(new.broker_id, 'request_status', 'عمولة مستحقة لفاليو عقار',
      'C-' || lpad(new.commission_no::text, 6, '0') || ' — ' || new.expected_amount || ' ج.م — الاستحقاق ' || to_char(new.due_date, 'YYYY-MM-DD'),
      null, '/commissions');
  elsif new.status = 'disputed' and old.status is distinct from 'disputed' then
    perform public.notify_company(new.broker_id, 'request_status', 'عمولة متنازع عليها',
      'C-' || lpad(new.commission_no::text, 6, '0') || coalesce(' — ' || new.status_note, ''), null, '/commissions');
  end if;
  return new;
end $$;
revoke execute on function public.notify_on_commission() from public, anon, authenticated;
create trigger commissions_notify after update on public.commissions for each row execute function public.notify_on_commission();

-- Private bucket for payment proofs: commission-docs/<commission id>/...
insert into storage.buckets (id, name, public) values ('commission-docs', 'commission-docs', false) on conflict (id) do nothing;
create policy "commission docs readable with their commission" on storage.objects for select to authenticated
  using (bucket_id = 'commission-docs' and exists (select 1 from public.commissions c where c.id::text = (storage.foldername(name))[1]));
create policy "admin uploads commission docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'commission-docs' and public.has_role(auth.uid(), 'admin'));


-- ================= 20261011210000_audit-log.sql =================
-- Item 20: general audit log for sensitive changes. Append-only: written only by triggers,
-- readable by admins, never updated or deleted (no grants, no policies for writes).

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_label text,
  table_name text not null,
  row_id text,
  action text not null check (action in ('insert','update','delete')),
  changes jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id, at desc);
create index audit_log_actor_idx on public.audit_log (actor, at desc);
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "admins read the audit log" on public.audit_log for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Who did it, in words, captured at the time (names can change later).
create or replace function public.actor_label()
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then case when coalesce(auth.role(), '') = 'service_role' then 'النظام' else 'زائر' end
    when public.has_role(auth.uid(), 'admin') then 'أدمن'
    when public.is_staff() then 'موظف فاليو عقار'
    else coalesce(
      (select 'صاحب حساب: ' || name from public.brokers where user_id = auth.uid() limit 1),
      (select 'فريق: ' || m.member_name || ' (' || b.name || ')' from public.my_membership() m join public.brokers b on b.id = m.company_id limit 1),
      'مستخدم')
  end
$$;
revoke execute on function public.actor_label() from public, anon, authenticated;

-- Generic row audit: inserts and deletes keep the row, updates keep only changed columns as [old, new].
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; diff jsonb := '{}'::jsonb; k text;
  ignore text[] := array['updated_at','stage_changed_at','phone_norm','reminded_follow_up_at','reminded_visit_at','review_reminded_at','docs_reminded_at','due_reminded_on','reminded_at'];
begin
  if tg_op = 'INSERT' then
    n := to_jsonb(new);
    insert into public.audit_log (actor, actor_label, table_name, row_id, action, changes)
    values (auth.uid(), public.actor_label(), tg_table_name, n->>'id', 'insert', n - ignore);
    return new;
  elsif tg_op = 'DELETE' then
    o := to_jsonb(old);
    insert into public.audit_log (actor, actor_label, table_name, row_id, action, changes)
    values (auth.uid(), public.actor_label(), tg_table_name, o->>'id', 'delete', o - ignore);
    return old;
  end if;
  o := to_jsonb(old); n := to_jsonb(new);
  for k in select jsonb_object_keys(n) loop
    if not (k = any(ignore)) and (o->k) is distinct from (n->k) then
      diff := diff || jsonb_build_object(k, jsonb_build_array(o->k, n->k));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.audit_log (actor, actor_label, table_name, row_id, action, changes)
    values (auth.uid(), public.actor_label(), tg_table_name, n->>'id', 'update', diff);
  end if;
  return new;
end $$;
revoke execute on function public.audit_row() from public, anon, authenticated;

-- Sensitive tables: accounts and roles, teams, leads, deals and documents, money, agreements, settings, listings review.
do $$
declare t text;
begin
  foreach t in array array['brokers','user_roles','company_members','leads','deals','deal_documents','commissions',
                           'commission_payments','company_agreements','app_settings','plans','subscriptions','properties','projects']
  loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;


-- ================= 20261011220000_tasks-reminders.sql =================
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


-- ================= 20261011230000_contact-policy.sql =================
-- Item 17: contact-data policy. Customers reach companies through Value Aqar: brokers' phone, WhatsApp and
-- e-mail are no longer readable by the public API. An admin can allow an account to show its contact details
-- (per agreement). Inquiries from a broker's page become leads assigned to that broker on the platform.

alter table public.brokers add column if not exists show_contact boolean not null default false;

-- Column-level read access: safe profile columns only.
revoke select on public.brokers from anon, authenticated;
grant select (id, slug, name, specialty, bio, photo_url, areas, facebook, is_active, is_demo, account_type, show_contact,
              created_at, updated_at, suspended_at) on public.brokers to anon;  -- suspended_at: used by public visibility rules
grant select (id, slug, name, specialty, bio, photo_url, areas, facebook, is_active, is_demo, account_type, show_contact,
              created_at, updated_at, user_id, suspended_at) on public.brokers to authenticated;

-- The signed-in user's own account (any status), or the company they work for.
create or replace function public.my_account()
returns setof public.brokers language sql stable security definer set search_path = public as $$
  select * from public.brokers where user_id = auth.uid()
  union all
  select b.* from public.brokers b
  where not exists (select 1 from public.brokers o where o.user_id = auth.uid())
    and b.id = (select company_id from public.my_membership() limit 1)
$$;
revoke execute on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;

-- Full account rows for admins and Value Aqar staff.
create or replace function public.admin_brokers()
returns setof public.brokers language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or public.is_staff()) then
    raise exception 'غير مصرح لك' using errcode = '42501';
  end if;
  return query select * from public.brokers order by created_at desc;
end $$;
revoke execute on function public.admin_brokers() from public, anon;
grant execute on function public.admin_brokers() to authenticated;

-- Contact details only where allowed: the account itself, admins/staff, or accounts the admin opened up.
create or replace function public.broker_contacts(_ids uuid[])
returns table (id uuid, phone text, whatsapp text, email text)
language sql stable security definer set search_path = public as $$
  select b.id, b.phone, b.whatsapp, b.email from public.brokers b
  where b.id = any(_ids) and b.is_active
    and (b.show_contact or public.has_role(auth.uid(), 'admin') or public.is_staff() or b.id = public.current_broker_id())
$$;
revoke execute on function public.broker_contacts(uuid[]) from public;
grant execute on function public.broker_contacts(uuid[]) to anon, authenticated;

-- Only admins decide who shows contact details.
create or replace function public.brokers_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') and coalesce(auth.role(), '') <> 'service_role' then
    new.is_active := old.is_active;
    new.plan_id := old.plan_id;
    new.user_id := old.user_id;
    new.slug := old.slug;
    new.is_demo := old.is_demo;
    new.account_type := old.account_type;
    new.suspended_at := old.suspended_at;
    new.phone := old.phone;
    new.review_note := old.review_note;
    new.rejected_at := old.rejected_at;
    new.show_contact := old.show_contact;
  end if;
  if new.is_active then new.rejected_at := null; end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.brokers_guard() from public, anon, authenticated;

-- Inquiries from a broker's public page: the visitor names the broker, the platform assigns it.
alter table public.leads add column if not exists via_broker_id uuid references public.brokers(id) on delete set null;

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


-- ================= 20261011240000_deal-units.sql =================
-- Deals can point at a project unit; the unit's status follows the deal
-- (reservation / contract → reserved, approved sale → sold, unit removed from deal → available again).

create or replace function public.deals_unit_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare u public.project_units%rowtype; target text;
begin
  if tg_op = 'UPDATE' and old.project_unit_id is not null and old.project_unit_id is distinct from new.project_unit_id then
    update public.project_units set status = 'available' where id = old.project_unit_id and status = 'reserved';
  end if;
  if new.project_unit_id is null then return new; end if;
  select * into u from public.project_units where id = new.project_unit_id;
  if u.id is null or not exists (select 1 from public.projects p where p.id = u.project_id and p.review_status = 'approved') then
    raise exception 'الوحدة دي مش متاحة على المنصة' using errcode = '23514';
  end if;
  if (tg_op = 'INSERT' or old.project_unit_id is distinct from new.project_unit_id) and u.status in ('sold','unavailable') then
    raise exception 'الوحدة دي % — اختار وحدة تانية', case u.status when 'sold' then 'مباعة' else 'غير متاحة' end using errcode = '23514';
  end if;
  target := case when new.review_status = 'approved' then 'sold'
                 when new.reservation_date is not null or new.contract_date is not null then 'reserved' end;
  if target is not null and u.status is distinct from target and u.status <> 'sold' then
    update public.project_units set status = target where id = u.id;
  end if;
  return new;
end $$;
revoke execute on function public.deals_unit_sync() from public, anon, authenticated;
create trigger deals_unit_sync after insert or update on public.deals for each row execute function public.deals_unit_sync();


commit;

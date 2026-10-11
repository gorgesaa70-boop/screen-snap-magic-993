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

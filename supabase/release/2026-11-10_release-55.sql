-- فاليو عقار — إصدار 55: قسم التنازل (أعمدة جديدة في العقارات + صورة العقد الخاصة). ينفع يتشغل تاني. مستقل عن الإصدارات التانية.
--   20261109200000_tanazul.sql

begin;
-- «تنازل» (release 55): a sale listing that hands over an installment contract.
-- * Same table and purpose as any sale (status 'بيع'), so search, plans, alerts and posting keep working; is_assignment marks it.
-- * price = what the buyer pays the seller now (مبلغ التنازل). The rest of the contract is in asg_* columns, all public.
-- * The contract photo is private: its path lives in property_assignment_docs (never in properties, which visitors read)
--   and the file in the private bucket assignment-docs. Only the uploader and the review team can open it.
-- * A listing is approved only with a contract photo; approving it stamps asg_doc_checked_at («العقد متراجع»).
-- Additive only; re-runnable. Independent of the other releases.

alter table public.properties
  add column if not exists is_assignment boolean not null default false,
  add column if not exists asg_developer text check (asg_developer is null or char_length(asg_developer) <= 120),
  add column if not exists asg_project_id uuid references public.projects(id) on delete set null,
  add column if not exists asg_contract_price numeric check (asg_contract_price is null or asg_contract_price >= 0),
  add column if not exists asg_paid numeric check (asg_paid is null or asg_paid >= 0),
  add column if not exists asg_remaining numeric check (asg_remaining is null or asg_remaining >= 0),
  add column if not exists asg_months smallint check (asg_months is null or asg_months between 0 and 360),
  add column if not exists asg_monthly numeric check (asg_monthly is null or asg_monthly >= 0),
  add column if not exists asg_delivery text check (asg_delivery is null or char_length(asg_delivery) <= 40),
  add column if not exists asg_fee numeric check (asg_fee is null or asg_fee >= 0),
  add column if not exists asg_fee_kind text check (asg_fee_kind is null or asg_fee_kind in ('pct','amount')),
  add column if not exists asg_dev_approval text check (asg_dev_approval is null or asg_dev_approval in ('allowed','needs','unknown')),
  add column if not exists asg_doc_checked_at timestamptz;

alter table public.properties drop constraint if exists properties_assignment_sale;
alter table public.properties add constraint properties_assignment_sale check (not is_assignment or status = 'بيع');
alter table public.properties drop constraint if exists properties_assignment_fee_pct;
alter table public.properties add constraint properties_assignment_fee_pct check (asg_fee_kind is distinct from 'pct' or asg_fee is null or asg_fee <= 100);
create index if not exists properties_assignment_idx on public.properties (created_at desc) where is_assignment;

create table if not exists public.property_assignment_docs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  path text not null check (char_length(path) between 3 and 300),
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists property_assignment_docs_property on public.property_assignment_docs (property_id, created_at desc);
alter table public.property_assignment_docs enable row level security;
revoke all on public.property_assignment_docs from anon;
grant select, insert, delete on public.property_assignment_docs to authenticated;
grant all on public.property_assignment_docs to service_role;

drop policy if exists "review team reads contracts" on public.property_assignment_docs;
create policy "review team reads contracts" on public.property_assignment_docs for select to authenticated
  using (public.staff_can('review', 'view') or uploaded_by = auth.uid());
drop policy if exists "listing owner adds a contract" on public.property_assignment_docs;
create policy "listing owner adds a contract" on public.property_assignment_docs for insert to authenticated
  with check (
    uploaded_by = auth.uid() and path like auth.uid()::text || '/%'
    and (public.staff_can('review', 'edit')
      or exists (select 1 from public.properties p where p.id = property_id and p.broker_id = public.current_broker_id()))
  );
drop policy if exists "review team removes contracts" on public.property_assignment_docs;
create policy "review team removes contracts" on public.property_assignment_docs for delete to authenticated
  using (public.staff_can('review', 'edit'));

insert into storage.buckets (id, name, public) values ('assignment-docs', 'assignment-docs', false) on conflict (id) do nothing;
drop policy if exists "uploader adds contract files" on storage.objects;
create policy "uploader adds contract files" on storage.objects for insert to authenticated
  with check (bucket_id = 'assignment-docs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "uploader and review team read contract files" on storage.objects;
create policy "uploader and review team read contract files" on storage.objects for select to authenticated
  using (bucket_id = 'assignment-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.staff_can('review', 'view')));

-- Keeps the assignment columns consistent and lets only the review team stamp the contract check.
create or replace function public.properties_asg_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare trusted boolean := public.staff_can('review', 'edit') or coalesce(auth.role(), '') = 'service_role';
begin
  if not new.is_assignment then
    new.asg_developer := null; new.asg_project_id := null; new.asg_contract_price := null; new.asg_paid := null;
    new.asg_remaining := null; new.asg_months := null; new.asg_monthly := null; new.asg_delivery := null;
    new.asg_fee := null; new.asg_fee_kind := null; new.asg_dev_approval := null; new.asg_doc_checked_at := null;
    return new;
  end if;
  -- The contract's own schedule replaces the sale installment fields.
  new.payment_method := null; new.down_payment := null; new.installment_years := null; new.monthly_installment := null; new.installment_note := null;
  if not trusted then
    new.asg_doc_checked_at := case when tg_op = 'UPDATE' then old.asg_doc_checked_at end;
  end if;
  if new.review_status = 'approved' and (tg_op = 'INSERT' or old.review_status is distinct from 'approved') then
    if not exists (select 1 from public.property_assignment_docs d where d.property_id = new.id) then
      raise exception 'إعلان التنازل محتاج صورة العقد قبل الاعتماد' using errcode = 'P0001';
    end if;
    new.asg_doc_checked_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.properties_asg_guard() from public, anon, authenticated;
drop trigger if exists properties_asg_guard on public.properties;
create trigger properties_asg_guard before insert or update on public.properties for each row execute function public.properties_asg_guard();
commit;

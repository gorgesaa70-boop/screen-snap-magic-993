-- Item 12: the 10-stage customer pipeline, with the data each stage needs.
-- Reservation / contract / sale details live on a deal (one per lead) with documents; a sale is only
-- confirmed after an admin approves it (the core of the deals center, item 14).

-- 1) Stage becomes text with the new 10 values. Old values map: viewing → visit_scheduled,
--    negotiating → qualified, won → sold. (Text instead of the enum: new enum values can't be used in the
--    same transaction that adds them.)
drop policy if exists "anyone submits leads" on public.leads;
alter table public.leads alter column stage drop default;
alter table public.leads alter column stage type text using (case stage::text
  when 'viewing' then 'visit_scheduled' when 'negotiating' then 'qualified' when 'won' then 'sold' else stage::text end);
alter table public.leads alter column stage set default 'new';
alter table public.leads add constraint leads_stage_check check (stage in
  ('new','contacted','qualified','visit_scheduled','visited','reserved','contracted','sold','lost','postponed'));
create policy "anyone submits leads" on public.leads for insert to anon, authenticated
  with check (stage = 'new' and notes is null);

alter table public.leads
  add column if not exists lost_reason text check (lost_reason is null or char_length(lost_reason) <= 300),
  add column if not exists visit_at timestamptz,
  add column if not exists stage_changed_at timestamptz;

-- 2) Deals.
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  deal_no bigint generated always as identity unique,
  lead_id uuid not null unique references public.leads(id) on delete restrict,
  broker_id uuid references public.brokers(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  project_unit_id uuid references public.project_units(id) on delete set null,
  unit_desc text check (unit_desc is null or char_length(unit_desc) <= 300),
  reservation_date date,
  reservation_amount numeric check (reservation_amount is null or reservation_amount >= 0),
  contract_date date,
  contract_value numeric check (contract_value is null or contract_value >= 0),
  sale_date date,
  sale_value numeric check (sale_value is null or sale_value >= 0),
  sale_requested_at timestamptz,
  review_status text not null default 'draft' check (review_status in ('draft','pending','approved','rejected','needs_info')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contract_date is null or reservation_date is null or contract_date >= reservation_date),
  check (sale_date is null or contract_date is null or sale_date >= contract_date)
);
create index deals_broker_idx on public.deals (broker_id);
create index deals_review_idx on public.deals (review_status);
grant select, insert, update on public.deals to authenticated;
grant all on public.deals to service_role;
alter table public.deals enable row level security;

-- Who can work a lead can see and fill its deal; the lead's own visibility rules decide.
create policy "deal visible with its lead" on public.deals for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));
create policy "deal created on a visible lead" on public.deals for insert to authenticated
  with check (exists (select 1 from public.leads l where l.id = lead_id));
create policy "deal updated on a visible lead" on public.deals for update to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id))
  with check (exists (select 1 from public.leads l where l.id = lead_id));

create or replace function public.deals_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare is_admin boolean := public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    select assigned_broker_id into new.broker_id from public.leads where id = new.lead_id;
    if not is_admin then
      new.review_status := 'draft'; new.review_note := null; new.reviewed_by := null; new.reviewed_at := null; new.sale_requested_at := null;
    end if;
  else
    new.lead_id := old.lead_id;
    new.created_by := old.created_by;
    if not is_admin then
      if old.review_status = 'approved' then
        raise exception 'الصفقة اتعتمدت من الإدارة ومينفعش تتعدّل' using errcode = '42501';
      end if;
      new.broker_id := old.broker_id;
      new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at; new.review_note := old.review_note;
      -- Companies can only submit for review (pending) or keep a draft; editing after rejection resubmits.
      if new.review_status not in ('draft','pending') then new.review_status := old.review_status; end if;
      if new.review_status = 'pending' and old.review_status <> 'pending' then
        if new.sale_date is null or new.sale_value is null then
          raise exception 'اكتب تاريخ وقيمة البيع قبل الإرسال للمراجعة' using errcode = '23514';
        end if;
        if not exists (select 1 from public.deal_documents d where d.deal_id = new.id and d.kind = 'sale') then
          raise exception 'ارفع مستند البيع (العقد النهائي أو إيصال السداد) قبل الإرسال للمراجعة' using errcode = '23514';
        end if;
        new.sale_requested_at := now();
      else
        new.sale_requested_at := old.sale_requested_at;
      end if;
    elsif new.review_status is distinct from old.review_status and new.review_status in ('approved','rejected','needs_info') then
      if new.review_status <> 'approved' and coalesce(new.review_note, '') = '' then
        raise exception 'اكتب سبب الرفض أو البيانات المطلوبة' using errcode = '23514';
      end if;
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.deals_guard() from public, anon, authenticated;
create trigger deals_guard before insert or update on public.deals for each row execute function public.deals_guard();

-- 3) Documents (private storage bucket, files under deal-docs/<deal id>/...).
create table public.deal_documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete restrict,
  kind text not null check (kind in ('reservation','contract','sale','payment','other')),
  file_path text not null unique check (char_length(file_path) <= 300),
  file_name text not null check (char_length(file_name) <= 200),
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index deal_documents_deal_idx on public.deal_documents (deal_id);
grant select, insert, delete on public.deal_documents to authenticated;
grant all on public.deal_documents to service_role;
alter table public.deal_documents enable row level security;
create policy "documents visible with their deal" on public.deal_documents for select to authenticated
  using (exists (select 1 from public.deals d where d.id = deal_id));
create policy "documents added to an open deal" on public.deal_documents for insert to authenticated
  with check (uploaded_by = auth.uid() and file_path like deal_id::text || '/%'
    and exists (select 1 from public.deals d where d.id = deal_id and d.review_status <> 'approved'));
create policy "uploader removes own document from an open deal" on public.deal_documents for delete to authenticated
  using (uploaded_by = auth.uid() and exists (select 1 from public.deals d where d.id = deal_id and d.review_status in ('draft','rejected','needs_info')));

insert into storage.buckets (id, name, public) values ('deal-docs', 'deal-docs', false) on conflict (id) do nothing;
create policy "deal docs readable with their deal" on storage.objects for select to authenticated
  using (bucket_id = 'deal-docs' and exists (select 1 from public.deals d where d.id::text = (storage.foldername(name))[1]));
create policy "deal docs uploaded to an open deal" on storage.objects for insert to authenticated
  with check (bucket_id = 'deal-docs' and exists (select 1 from public.deals d where d.id::text = (storage.foldername(name))[1] and d.review_status <> 'approved'));

-- 4) Stage rules.
create or replace function public.lead_stage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare d public.deals%rowtype;
begin
  if new.stage is not distinct from old.stage then return new; end if;
  new.stage_changed_at := now();
  if coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if old.stage = 'sold' and not public.has_role(auth.uid(), 'admin') then
    raise exception 'البيع المؤكَّد مايتغيّرش غير من الإدارة' using errcode = '42501';
  end if;
  select * into d from public.deals where lead_id = new.id;
  case new.stage
    when 'lost' then
      if coalesce(trim(new.lost_reason), '') = '' then raise exception 'اكتب سبب عدم الاكتمال' using errcode = '23514'; end if;
    when 'postponed' then
      if new.follow_up_at is null or new.follow_up_at < now() then raise exception 'حدد ميعاد متابعة جاي للعميل المؤجَّل' using errcode = '23514'; end if;
    when 'visit_scheduled' then
      if new.visit_at is null then raise exception 'حدد ميعاد الزيارة' using errcode = '23514'; end if;
    when 'reserved' then
      if d.id is null or d.reservation_date is null or d.reservation_amount is null
         or not exists (select 1 from public.deal_documents x where x.deal_id = d.id and x.kind = 'reservation') then
        raise exception 'الحجز محتاج: تاريخ الحجز ومبلغه ومستند الحجز' using errcode = '23514';
      end if;
    when 'contracted' then
      if d.id is null or d.contract_date is null or d.contract_value is null
         or not exists (select 1 from public.deal_documents x where x.deal_id = d.id and x.kind = 'contract') then
        raise exception 'العقد محتاج: تاريخ العقد وقيمته ومستند العقد' using errcode = '23514';
      end if;
    when 'sold' then
      if d.id is null or d.review_status <> 'approved' then
        raise exception 'البيع بيتأكد بعد مراجعة الإدارة للصفقة' using errcode = '23514';
      end if;
    else null;
  end case;
  return new;
end $$;
revoke execute on function public.lead_stage_guard() from public, anon, authenticated;
create trigger lead_stage_guard before update on public.leads for each row execute function public.lead_stage_guard();

-- Approving a sale confirms the lead; a sale request notifies the admins.
create or replace function public.deals_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare l public.leads%rowtype;
begin
  select * into l from public.leads where id = new.lead_id;
  if new.review_status = 'approved' and old.review_status is distinct from 'approved' then
    update public.leads set stage = 'sold' where id = new.lead_id and stage <> 'sold';
  end if;
  if new.review_status = 'pending' and old.review_status is distinct from 'pending' then
    perform public.notify_admins('admin', 'صفقة بانتظار المراجعة',
      'طلب تأكيد بيع للعميل ' || l.name || ' (VA-' || lpad(l.lead_no::text, 6, '0') || ')', new.lead_id, '/leads/' || new.lead_id);
  end if;
  return new;
end $$;
revoke execute on function public.deals_after() from public, anon, authenticated;
create trigger deals_after after update on public.deals for each row execute function public.deals_after();

-- Pipeline history in the lead's log.
alter table public.lead_activities drop constraint if exists lead_activities_kind_check;
alter table public.lead_activities add constraint lead_activities_kind_check
  check (kind in ('call','whatsapp','status','note','follow_up','assign','source','deal'));

create or replace function public.log_deal_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities(lead_id, actor_id, kind, summary) values (new.lead_id, auth.uid(), 'deal', 'فتح صفقة D-' || lpad(new.deal_no::text, 6, '0'));
  elsif new.review_status is distinct from old.review_status then
    insert into public.lead_activities(lead_id, actor_id, kind, summary)
    values (new.lead_id, auth.uid(), 'deal', 'حالة المراجعة: ' || new.review_status || coalesce(' — ' || new.review_note, ''));
  end if;
  return new;
end $$;
revoke execute on function public.log_deal_changes() from public, anon, authenticated;
create trigger deals_log after insert or update on public.deals for each row execute function public.log_deal_changes();

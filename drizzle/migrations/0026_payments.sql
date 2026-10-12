-- Online payments, phase 1 (no gateway yet): plan prices, a payments ledger, applying a confirmed payment
-- (subscription or featured listing) exactly once, and subscription expiry with reminders and a grace period.
-- The gateway (Paymob) only ever calls mark_payment_paid / mark_payment_failed through the server.

alter table public.plans
  add column if not exists yearly_price numeric not null default 0 check (yearly_price >= 0),
  add column if not exists trial_days smallint not null default 0 check (trial_days between 0 and 60);

alter table public.app_settings
  add column if not exists featured_week_price numeric not null default 0 check (featured_week_price >= 0),
  add column if not exists featured_month_price numeric not null default 0 check (featured_month_price >= 0),
  add column if not exists subscription_grace_days smallint not null default 3 check (subscription_grace_days between 0 and 30);

alter table public.subscriptions
  add column if not exists payment_id uuid,
  add column if not exists reminded_7d_at timestamptz,
  add column if not exists reminded_1d_at timestamptz;

-- Listings hidden because the account went back to a smaller plan (nothing is deleted; shown again on renewal).
alter table public.properties add column if not exists hidden_by_plan boolean not null default false;

create or replace function public.properties_plan_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null) then
    new.hidden_by_plan := case when tg_op = 'UPDATE' then old.hidden_by_plan else false end;
  end if;
  return new;
end $$;
revoke execute on function public.properties_plan_guard() from public, anon, authenticated;
drop trigger if exists properties_plan_guard on public.properties;
create trigger properties_plan_guard before insert or update on public.properties for each row execute function public.properties_plan_guard();

drop policy if exists "approved properties public" on public.properties;
create policy "approved properties public" on public.properties for select to anon, authenticated
  using (review_status = 'approved' and not hidden_by_plan and (not is_demo or public.demo_visible())
    and (broker_id is null or exists (select 1 from public.brokers b where b.id = broker_id and b.is_active)));

-- The ledger. Amounts are set by the server from the price lists, never by the browser.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_no bigint generated always as identity,
  broker_id uuid references public.brokers(id) on delete set null,
  purpose text not null check (purpose in ('subscription','featured')),
  plan_id uuid references public.plans(id) on delete set null,
  period text check (period is null or period in ('monthly','yearly')),
  property_id uuid references public.properties(id) on delete set null,
  feature_days smallint check (feature_days is null or feature_days in (7, 30)),
  amount numeric not null check (amount > 0),
  currency text not null default 'EGP',
  status text not null default 'pending' check (status in ('pending','paid','failed','expired','refunded')),
  provider text not null default 'paymob',
  provider_order_id text,
  provider_txn_id text unique,
  method text check (method is null or char_length(method) <= 40),
  failed_reason text check (failed_reason is null or char_length(failed_reason) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz,
  note text check (note is null or char_length(note) <= 300)
);
create index payments_broker_idx on public.payments (broker_id, created_at desc);
grant select on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
-- Money is the account owner's business: owners see their own payments, admins see all. Nobody writes directly.
create policy "owner reads own payments" on public.payments for select to authenticated
  using (exists (select 1 from public.brokers b where b.id = broker_id and b.user_id = auth.uid()));
create policy "admins read payments" on public.payments for select to authenticated using (public.has_role(auth.uid(), 'admin'));
drop trigger if exists zz_audit on public.payments;
create trigger zz_audit after insert or update or delete on public.payments for each row execute function public.audit_row();

-- Start a payment (the account owner only). Returns the payment id; the amount comes from plans / app_settings.
create or replace function public.create_payment(_purpose text, _plan uuid default null, _period text default null, _property uuid default null, _days integer default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare b public.brokers%rowtype; amt numeric; pid uuid; pl public.plans%rowtype;
begin
  select * into b from public.brokers where user_id = auth.uid() and is_active and suspended_at is null;
  if b.id is null then raise exception 'الدفع متاح لصاحب حساب الشركة أو الوسيط بس' using errcode = '42501'; end if;
  if _purpose = 'subscription' then
    select * into pl from public.plans where id = _plan and is_active;
    if pl.id is null or _period not in ('monthly','yearly') then raise exception 'اختار باقة ومدة صحيحة' using errcode = '22023'; end if;
    amt := case _period when 'monthly' then pl.monthly_price else pl.yearly_price end;
  elsif _purpose = 'featured' then
    if _days not in (7, 30) then raise exception 'مدة التمييز أسبوع أو شهر' using errcode = '22023'; end if;
    if not exists (select 1 from public.properties p where p.id = _property and p.broker_id = b.id and p.review_status = 'approved') then
      raise exception 'العقار لازم يكون منشور ومن عقاراتك' using errcode = '22023';
    end if;
    select case _days when 7 then featured_week_price else featured_month_price end into amt from public.app_settings where id = 1;
  else
    raise exception 'نوع دفع غير معروف' using errcode = '22023';
  end if;
  if coalesce(amt, 0) <= 0 then raise exception 'السعر لسه ما اتحددش — كلّم فاليو عقار' using errcode = '22023'; end if;
  insert into public.payments (broker_id, purpose, plan_id, period, property_id, feature_days, amount)
  values (b.id, _purpose, case when _purpose = 'subscription' then _plan end, case when _purpose = 'subscription' then _period end,
          case when _purpose = 'featured' then _property end, case when _purpose = 'featured' then _days end, amt)
  returning id into pid;
  return pid;
end $$;
revoke execute on function public.create_payment(text, uuid, text, uuid, integer) from public, anon;
grant execute on function public.create_payment(text, uuid, text, uuid, integer) to authenticated;

-- Apply a confirmed payment exactly once (server / webhook only). Wrong amounts and reused transaction ids are refused.
create or replace function public.mark_payment_paid(_id uuid, _txn text, _amount numeric, _method text default null)
returns text language plpgsql security definer set search_path = public as $$
declare p public.payments%rowtype; cur public.subscriptions%rowtype; starts timestamptz; ends timestamptz; owner uuid; tag text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service only' using errcode = '42501'; end if;
  select * into p from public.payments where id = _id for update;
  if p.id is null then return 'not_found'; end if;
  if p.status = 'paid' then return 'already_paid'; end if;
  if p.status not in ('pending','failed','expired') then return 'invalid_status'; end if;
  if exists (select 1 from public.payments where provider_txn_id = _txn and id <> p.id) then return 'duplicate_txn'; end if;
  tag := 'PAY-' || lpad(p.payment_no::text, 6, '0');
  if round(_amount, 2) <> round(p.amount, 2) then
    update public.payments set failed_reason = 'المبلغ المدفوع (' || _amount || ') مختلف عن المطلوب' where id = p.id;
    perform public.notify_admins('admin', 'دفعة بمبلغ مختلف', tag || ' — محتاجة مراجعة', p.id, '/admin');
    return 'amount_mismatch';
  end if;

  update public.payments set status = 'paid', paid_at = now(), provider_txn_id = _txn, method = left(_method, 40), failed_reason = null where id = p.id;
  select user_id into owner from public.brokers where id = p.broker_id;

  if p.purpose = 'subscription' then
    -- Renewing the same plan early extends from its end date; a different plan starts now.
    select * into cur from public.subscriptions
    where broker_id = p.broker_id and status in ('active','trial') and ends_at > now()
    order by ends_at desc limit 1;
    starts := case when cur.id is not null and cur.plan_id = p.plan_id then cur.ends_at else now() end;
    ends := starts + case p.period when 'yearly' then interval '1 year' else interval '1 month' end;
    if cur.id is not null and cur.plan_id <> p.plan_id then update public.subscriptions set status = 'canceled', ends_at = now() where id = cur.id; end if;
    insert into public.subscriptions (broker_id, plan_id, status, starts_at, ends_at, provider, provider_ref, payment_id)
    values (p.broker_id, p.plan_id, 'active', starts, ends, p.provider, _txn, p.id);
    update public.brokers set plan_id = p.plan_id where id = p.broker_id;
    update public.properties set hidden_by_plan = false where broker_id = p.broker_id and hidden_by_plan;
    if owner is not null then
      perform public.notify_user(owner, 'request_status', 'اتفعّلت باقتك ✓', (select name from public.plans where id = p.plan_id) || ' لحد ' || to_char(ends at time zone 'Africa/Cairo', 'YYYY-MM-DD'), p.id, '/dashboard');
    end if;
  else
    update public.properties set is_featured = true,
      featured_until = greatest(now(), coalesce(featured_until, now())) + make_interval(days => p.feature_days)
    where id = p.property_id;
    if owner is not null then
      perform public.notify_user(owner, 'request_status', 'عقارك بقى مميز ✓', 'لمدة ' || p.feature_days || ' يوم', p.property_id, '/dashboard');
    end if;
  end if;
  perform public.notify_admins('admin', 'دفعة جديدة ✓', tag || ' — ' || p.amount || ' ج.م — ' || coalesce((select name from public.brokers where id = p.broker_id), ''), p.id, '/admin');
  return 'paid';
end $$;
revoke execute on function public.mark_payment_paid(uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.mark_payment_paid(uuid, text, numeric, text) to service_role;

create or replace function public.mark_payment_failed(_id uuid, _reason text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service only' using errcode = '42501'; end if;
  update public.payments set status = 'failed', failed_reason = left(_reason, 200) where id = _id and status = 'pending';
  return case when found then 'failed' else 'ignored' end;
end $$;
revoke execute on function public.mark_payment_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payment_failed(uuid, text) to service_role;

-- Scheduled: renewal reminders (7 days / 1 day), expiry after the grace period (back to the free plan, extra
-- listings hidden — nothing deleted), featured listings ending, abandoned checkouts expiring. Logged in job_runs.
create or replace function public.run_subscription_expiry()
returns jsonb language plpgsql security definer set search_path = public as $$
declare s record; grace int; free_plan uuid; lim int; owner uuid; n_rem int := 0; n_exp int := 0; n_feat int := 0; n_pay int := 0; run_id bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.has_role(auth.uid(), 'admin') then raise exception 'غير مصرح' using errcode = '42501'; end if;
  insert into public.job_runs (job) values ('subscription_expiry') returning id into run_id;
  select subscription_grace_days into grace from public.app_settings where id = 1;
  select id into free_plan from public.plans where code = 'free';

  for s in select su.*, b.user_id, pl.name plan_name from public.subscriptions su join public.brokers b on b.id = su.broker_id join public.plans pl on pl.id = su.plan_id
           where su.status = 'active' and su.ends_at is not null loop
    if s.ends_at > now() and s.ends_at <= now() + interval '7 days' and s.reminded_7d_at is null and s.ends_at > now() + interval '1 day' then
      if s.user_id is not null then perform public.notify_user(s.user_id, 'request_status', 'باقتك هتخلص خلال أسبوع', s.plan_name || ' — جدّدها من «باقتي»', s.id, '/dashboard'); end if;
      update public.subscriptions set reminded_7d_at = now() where id = s.id; n_rem := n_rem + 1;
    elsif s.ends_at > now() and s.ends_at <= now() + interval '1 day' and s.reminded_1d_at is null then
      if s.user_id is not null then perform public.notify_user(s.user_id, 'request_status', 'باقتك بتخلص بكرة', s.plan_name || ' — جدّدها عشان عقاراتك تفضل ظاهرة', s.id, '/dashboard'); end if;
      update public.subscriptions set reminded_1d_at = now(), reminded_7d_at = coalesce(reminded_7d_at, now()) where id = s.id; n_rem := n_rem + 1;
    elsif s.ends_at <= now() - make_interval(days => coalesce(grace, 3)) then
      update public.subscriptions set status = 'canceled' where id = s.id;
      -- Back to the free plan unless another paid period is running.
      if not exists (select 1 from public.subscriptions o where o.broker_id = s.broker_id and o.id <> s.id and o.status = 'active' and o.ends_at > now()) then
        update public.brokers set plan_id = free_plan where id = s.broker_id;
        select max_properties into lim from public.plans where id = free_plan;
        update public.properties set hidden_by_plan = true
        where id in (select id from public.properties where broker_id = s.broker_id and not hidden_by_plan
                     order by is_featured desc, updated_at desc offset coalesce(lim, 5));
        if s.user_id is not null then perform public.notify_user(s.user_id, 'request_status', 'باقتك انتهت', 'رجعت للباقة المجانية؛ العقارات الزيادة عن الحد مخفية لحد ما تجدد — مفيش حاجة اتمسحت', s.id, '/dashboard'); end if;
      end if;
      n_exp := n_exp + 1;
    end if;
  end loop;

  update public.properties set is_featured = false where is_featured and featured_until is not null and featured_until <= now();
  get diagnostics n_feat = row_count;
  update public.payments set status = 'expired' where status = 'pending' and created_at < now() - interval '2 hours';
  get diagnostics n_pay = row_count;

  update public.job_runs set finished_at = now(), result = jsonb_build_object('reminders', n_rem, 'expired', n_exp, 'featured_ended', n_feat, 'checkouts_expired', n_pay) where id = run_id;
  return jsonb_build_object('reminders', n_rem, 'expired', n_exp, 'featured_ended', n_feat, 'checkouts_expired', n_pay);
end $$;
revoke execute on function public.run_subscription_expiry() from public, anon;
grant execute on function public.run_subscription_expiry() to authenticated, service_role;
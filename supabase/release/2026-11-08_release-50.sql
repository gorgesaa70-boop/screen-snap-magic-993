-- فاليو عقار — إصدار 50: متابعة الباقات والتحصيل، وشريط الأخبار. إضافة بس، ينفع يتشغل تاني. مستقل عن الإصدارات التانية.
--   20261108100000_plan-money-and-news.sql

begin;
-- Plan money and the news ticker (release 50). Plans are tracked on their own, nothing here touches commissions.
-- * Each subscription / owner plan keeps what it costs and what was paid. amount null = old row nobody priced yet.
-- * New rows price themselves: free trial 0, otherwise the plan's price for the term, unpaid until recorded.
-- * «اتدفع — فعّل» on a plan request records the full amount as paid.
-- Re-runnable.

alter table public.subscriptions
  add column if not exists amount numeric check (amount is null or amount >= 0),
  add column if not exists paid_amount numeric not null default 0 check (paid_amount >= 0),
  add column if not exists paid_at timestamptz,
  add column if not exists payment_method text check (payment_method is null or char_length(payment_method) <= 30),
  add column if not exists payment_note text check (payment_note is null or char_length(payment_note) <= 300);
alter table public.owner_plan_grants
  add column if not exists amount numeric check (amount is null or amount >= 0),
  add column if not exists paid_amount numeric not null default 0 check (paid_amount >= 0),
  add column if not exists paid_at timestamptz,
  add column if not exists payment_method text check (payment_method is null or char_length(payment_method) <= 30),
  add column if not exists payment_note text check (payment_note is null or char_length(payment_note) <= 300);

create or replace function public.plan_money_defaults()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.amount is not null then return new; end if;
  if tg_table_name = 'subscriptions' then
    if new.status = 'trial' then new.amount := 0; return new; end if;
    if new.months is null then return new; end if;
    new.amount := public.plan_price(new.plan_id, new.months);
    -- Paid online through the website.
    if new.payment_id is not null then new.paid_amount := new.amount; new.paid_at := now(); new.payment_method := 'online'; end if;
  else
    if new.is_trial then new.amount := 0; return new; end if;
    if new.months is null then return new; end if;
    new.amount := public.plan_price(new.plan_id, new.months);
  end if;
  return new;
end $$;
drop trigger if exists plan_money_defaults on public.subscriptions;
create trigger plan_money_defaults before insert on public.subscriptions for each row execute function public.plan_money_defaults();
drop trigger if exists plan_money_defaults on public.owner_plan_grants;
create trigger plan_money_defaults before insert on public.owner_plan_grants for each row execute function public.plan_money_defaults();

-- The request's button says «اتدفع», and the term it created is the newest one for that account and plan.
create or replace function public.plan_request_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'activated' and old.status is distinct from 'activated' then
    if new.broker_id is not null then
      update public.subscriptions set amount = new.amount, paid_amount = new.amount, paid_at = now(), payment_method = 'plan_request'
      where id = (select id from public.subscriptions where broker_id = new.broker_id and plan_id = new.plan_id order by created_at desc limit 1);
    else
      update public.owner_plan_grants set amount = new.amount, paid_amount = new.amount, paid_at = now(), payment_method = 'plan_request'
      where id = (select id from public.owner_plan_grants where phone = new.phone and plan_id = new.plan_id order by created_at desc limit 1);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists plan_request_paid on public.plan_requests;
create trigger plan_request_paid after update of status on public.plan_requests for each row execute function public.plan_request_paid();

-- Rows from before this release: trials are free, and terms that came from a paid request are known.
update public.subscriptions set amount = 0 where amount is null and status = 'trial';
update public.owner_plan_grants set amount = 0 where amount is null and is_trial;
update public.subscriptions s set amount = r.amount, paid_amount = r.amount, paid_at = r.handled_at, payment_method = 'plan_request'
from public.plan_requests r
where s.amount is null and r.status = 'activated' and r.broker_id = s.broker_id and r.plan_id = s.plan_id
  and s.created_at between r.handled_at - interval '1 minute' and r.handled_at + interval '1 minute';
update public.owner_plan_grants g set amount = r.amount, paid_amount = r.amount, paid_at = r.handled_at, payment_method = 'plan_request'
from public.plan_requests r
where g.amount is null and r.status = 'activated' and r.phone = g.phone and r.plan_id = g.plan_id
  and g.created_at between r.handled_at - interval '1 minute' and r.handled_at + interval '1 minute';

-- Everything the plans money page lists: account subscriptions and owner plans together.
create or replace function public.admin_plan_finance()
returns table (
  kind text, id uuid, holder text, phone text, account_type text, plan_name text, months integer, status text, is_trial boolean,
  starts_at timestamptz, ends_at timestamptz, amount numeric, paid_amount numeric, paid_at timestamptz,
  payment_method text, payment_note text, renew_amount numeric
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staff_can('plans', 'view') then raise exception 'غير مسموح' using errcode = '42501'; end if;
  return query
    select 'account'::text, s.id, b.name::text, b.phone::text, b.account_type::text, p.name::text, s.months::integer, s.status::text, s.status = 'trial',
      s.starts_at, s.ends_at, s.amount, s.paid_amount, s.paid_at, s.payment_method, s.payment_note, public.plan_price(s.plan_id, coalesce(s.months::integer, 1))::numeric
    from public.subscriptions s join public.brokers b on b.id = s.broker_id join public.plans p on p.id = s.plan_id
    union all
    select 'owner'::text, g.id, g.phone::text, g.phone::text, 'owner'::text, p.name::text, g.months::integer, g.status::text, g.is_trial,
      g.starts_at, g.ends_at, g.amount, g.paid_amount, g.paid_at, g.payment_method, g.payment_note, public.plan_price(g.plan_id, coalesce(g.months::integer, 1))::numeric
    from public.owner_plan_grants g join public.plans p on p.id = g.plan_id;
end $$;
revoke execute on function public.admin_plan_finance() from public, anon;
grant execute on function public.admin_plan_finance() to authenticated;

-- Set what a term costs and what was paid so far; the holder is told when money is added.
create or replace function public.admin_record_plan_payment(_kind text, _id uuid, _amount numeric, _paid numeric, _method text default null, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare before_paid numeric; uid uuid; link text;
begin
  if not public.staff_can('plans', 'edit') then raise exception 'غير مسموح' using errcode = '42501'; end if;
  if _amount is null or _amount < 0 or _paid is null or _paid < 0 then raise exception 'اكتب المبلغ صح' using errcode = '22023'; end if;
  if _paid > _amount then raise exception 'المدفوع أكتر من قيمة الباقة' using errcode = '22023'; end if;
  if _kind = 'account' then
    select s.paid_amount, b.user_id into before_paid, uid from public.subscriptions s join public.brokers b on b.id = s.broker_id where s.id = _id for update of s;
    if not found then raise exception 'الاشتراك مش موجود' using errcode = 'P0001'; end if;
    update public.subscriptions set amount = _amount, paid_amount = _paid, payment_method = left(_method, 30), payment_note = left(_note, 300),
      paid_at = case when _paid = 0 then null when _paid <> before_paid then now() else paid_at end where id = _id;
    link := '/dashboard?tab=plan';
  elsif _kind = 'owner' then
    select g.paid_amount, public.phone_user_id(g.phone) into before_paid, uid from public.owner_plan_grants g where g.id = _id for update of g;
    if not found then raise exception 'الاشتراك مش موجود' using errcode = 'P0001'; end if;
    update public.owner_plan_grants set amount = _amount, paid_amount = _paid, payment_method = left(_method, 30), payment_note = left(_note, 300),
      paid_at = case when _paid = 0 then null when _paid <> before_paid then now() else paid_at end where id = _id;
    link := '/my-listings';
  else
    raise exception 'نوع غير معروف' using errcode = '22023';
  end if;
  if uid is not null and _paid > before_paid then
    perform public.notify_user(uid, 'request_status', 'اتسجلت دفعة لباقتك ✓', 'اتسجل ' || trim(to_char(_paid - before_paid, 'FM999,999,999')) || ' ج.م، والمدفوع لحد دلوقتي ' || trim(to_char(_paid, 'FM999,999,999')) || ' من ' || trim(to_char(_amount, 'FM999,999,999')) || ' ج.م', _id, link);
  end if;
end $$;
revoke execute on function public.admin_record_plan_payment(text, uuid, numeric, numeric, text, text) from public, anon;
grant execute on function public.admin_record_plan_payment(text, uuid, numeric, numeric, text, text) to authenticated;

-- News lines written by hand from the admin panel, shown one after another over the site header.
create table if not exists public.site_news (
  id uuid primary key default gen_random_uuid(),
  text_ar text not null check (char_length(btrim(text_ar)) between 2 and 200),
  text_en text check (text_en is null or char_length(text_en) <= 200),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists site_news_live on public.site_news (sort_order, created_at desc) where is_active;
alter table public.site_news enable row level security;
grant select on public.site_news to anon;
grant select, insert, update, delete on public.site_news to authenticated;
grant all on public.site_news to service_role;
drop policy if exists "anyone reads live news" on public.site_news;
create policy "anyone reads live news" on public.site_news for select to anon, authenticated using (is_active);
drop policy if exists "staff reads (news)" on public.site_news;
create policy "staff reads (news)" on public.site_news for select to authenticated using (public.staff_can('news', 'view'));
drop policy if exists "staff edits (news)" on public.site_news;
create policy "staff edits (news)" on public.site_news for all to authenticated using (public.staff_can('news', 'edit')) with check (public.staff_can('news', 'edit'));
commit;

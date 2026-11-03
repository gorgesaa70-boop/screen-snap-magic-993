-- فاليو عقار — إصدار 47: شروط المتاجر — زرار «إبلاغ» على صفحات العقارات والوسطاء والخدمات، و«حظر الحساب» في الرسايل بين الحسابات.
-- * البلاغات بتوصل للأدمن (والموظف اللي معاه قسم «البلاغات») كإشعار، وبتتقفل من لوحة الإدارة ← التقارير ← البلاغات.
-- * الحظر بيوقف الرسايل في الاتجاهين، وفاليو عقار بتقدر تكتب. إضافة بس، ينفع يتشغل تاني. بعد إصدار 46.
--   20261104100000_reports-and-blocks.sql

begin;
-- Store review (Apple 1.2, Google Play user-generated content): anyone signed in can report a listing, an account
-- page or a service provider (its reviews included), and two accounts in a direct conversation can block each other.
-- * Reports reach admins and employees holding «البلاغات» (content_reports) as a bell notification.
-- * A block stops new messages both ways in that conversation; the history stays. Value Aqar can't be blocked.

-- 1) Reports about public content.
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('property','mall','compound','project','industrial','investment','broker','provider')),
  target_id uuid not null,
  title text check (title is null or char_length(title) <= 200),
  url text check (url is null or char_length(url) <= 300),
  reason text not null check (char_length(reason) between 1 and 300),
  reporter uuid not null default auth.uid(),
  status text not null default 'open' check (status in ('open','done')),
  note text check (note is null or char_length(note) <= 300),
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists content_reports_open_uq on public.content_reports (reporter, kind, target_id) where status = 'open';
create index if not exists content_reports_status_idx on public.content_reports (status, created_at desc);

grant select on public.content_reports to authenticated;
grant all on public.content_reports to service_role;
alter table public.content_reports enable row level security;
drop policy if exists "team reads content reports" on public.content_reports;
create policy "team reads content reports" on public.content_reports for select to authenticated
  using (public.staff_can('content_reports'));

create or replace function public.report_content(_kind text, _target uuid, _reason text, _title text default null, _url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r text := left(nullif(btrim(coalesce(_reason, '')), ''), 300); new_id uuid;
begin
  if me is null then raise exception 'سجّل دخول الأول عشان تبلّغ' using errcode = '42501'; end if;
  if r is null then raise exception 'اكتب سبب البلاغ'; end if;
  if (select count(*) from public.content_reports where reporter = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'بلاغات كتير ورا بعض، جرّب بعد شوية';
  end if;
  insert into public.content_reports (kind, target_id, title, url, reason, reporter)
  values (_kind, _target, left(nullif(btrim(coalesce(_title, '')), ''), 200), left(nullif(_url, ''), 300), r, me)
  on conflict (reporter, kind, target_id) where status = 'open' do nothing
  returning id into new_id;
  if new_id is null then return; end if;
  perform public.notify_team('admin', 'بلاغ عن محتوى', coalesce(left(_title, 80) || ' — ', '') || left(r, 100),
    new_id, '/admin?tab=content_reports');
end $$;
revoke execute on function public.report_content(text, uuid, text, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text, text) to authenticated;

create or replace function public.resolve_content_report(_report uuid, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_can('content_reports', 'edit') then raise exception 'مش مسموحلك' using errcode = '42501'; end if;
  update public.content_reports set status = 'done', note = left(nullif(btrim(coalesce(_note, '')), ''), 300),
    handled_by = auth.uid(), handled_at = now()
  where id = _report and status = 'open';
end $$;
revoke execute on function public.resolve_content_report(uuid, text) from public, anon;
grant execute on function public.resolve_content_report(uuid, text) to authenticated;

-- 2) Blocks between two accounts (broker ↔ broker conversations).
create table if not exists public.broker_blocks (
  broker_id uuid not null references public.brokers(id) on delete cascade,  -- the account that blocks
  blocked_id uuid not null references public.brokers(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (broker_id, blocked_id),
  check (broker_id <> blocked_id)
);
grant all on public.broker_blocks to service_role;
alter table public.broker_blocks enable row level security;
-- No direct reads: the conversation asks through direct_block_state.

create or replace function public.direct_block_state(_thread uuid)
returns table (can_block boolean, blocked_by_me boolean, blocked_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare side text := public.direct_thread_side(_thread); t public.direct_threads%rowtype; mine uuid; other uuid;
begin
  select * into t from public.direct_threads where id = _thread;
  if side is null or not found or t.broker_b is null then return query select false, false, false; return; end if;
  if side = 'platform' then
    return query select false,
      exists (select 1 from public.broker_blocks b where b.broker_id = t.broker_a and b.blocked_id = t.broker_b)
        or exists (select 1 from public.broker_blocks b where b.broker_id = t.broker_b and b.blocked_id = t.broker_a),
      false;
    return;
  end if;
  mine := side::uuid;
  other := case when mine = t.broker_a then t.broker_b else t.broker_a end;
  return query select true,
    exists (select 1 from public.broker_blocks b where b.broker_id = mine and b.blocked_id = other),
    exists (select 1 from public.broker_blocks b where b.broker_id = other and b.blocked_id = mine);
end $$;
revoke execute on function public.direct_block_state(uuid) from public, anon;
grant execute on function public.direct_block_state(uuid) to authenticated;

create or replace function public.set_direct_block(_thread uuid, _blocked boolean)
returns void language plpgsql security definer set search_path = public as $$
declare side text := public.direct_thread_side(_thread); t public.direct_threads%rowtype; mine uuid; other uuid;
begin
  select * into t from public.direct_threads where id = _thread;
  if side is null or side = 'platform' or not found or t.broker_b is null then
    raise exception 'الحظر متاح بس في المحادثات بين حسابين' using errcode = '42501';
  end if;
  mine := side::uuid;
  other := case when mine = t.broker_a then t.broker_b else t.broker_a end;
  if _blocked then
    insert into public.broker_blocks (broker_id, blocked_id) values (mine, other) on conflict do nothing;
    perform public.notify_team('admin', 'حظر بين حسابين',
      coalesce((select name from public.brokers where id = mine), 'حساب') || ' حظر ' || coalesce((select name from public.brokers where id = other), 'حساب'),
      _thread, '/messages?dm=' || _thread);
  else
    delete from public.broker_blocks where broker_id = mine and blocked_id = other;
  end if;
end $$;
revoke execute on function public.set_direct_block(uuid, boolean) from public, anon;
grant execute on function public.set_direct_block(uuid, boolean) to authenticated;

-- 3) Sending: same as release 27, plus the block check between two accounts.
create or replace function public.send_direct_message(_thread uuid, _body text, _attachment_path text default null,
  _attachment_name text default null, _attachment_type text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.direct_threads%rowtype; side text; me uuid := auth.uid(); label text; b text; mk boolean := false; new_id uuid;
begin
  side := public.direct_thread_side(_thread);
  if side is null then raise exception 'مش مسموحلك تراسل في المحادثة دي' using errcode = '42501'; end if;
  select * into t from public.direct_threads where id = _thread;
  if t.closed_at is not null and side <> 'platform' then
    raise exception 'المحادثة دي اتقفلت من فاليو عقار' using errcode = '42501';
  end if;
  if side <> 'platform' and t.broker_b is not null and exists (
    select 1 from public.broker_blocks k
    where (k.broker_id = t.broker_a and k.blocked_id = t.broker_b) or (k.broker_id = t.broker_b and k.blocked_id = t.broker_a)
  ) then
    raise exception 'المحادثة دي متوقفة بسبب حظر' using errcode = '42501';
  end if;
  b := nullif(btrim(coalesce(_body, '')), '');
  _attachment_path := nullif(_attachment_path, '');
  if b is null and _attachment_path is null then raise exception 'الرسالة فاضية'; end if;
  if _attachment_path is not null then
    if _attachment_type not in ('image','pdf') then raise exception 'نوع الملف مش مسموح'; end if;
    -- Files live in the conversation's own folder: dm/<conversation>/...
    if split_part(_attachment_path, '/', 1) <> 'dm' or split_part(_attachment_path, '/', 2) <> _thread::text then
      raise exception 'مكان الملف غلط';
    end if;
  else
    _attachment_name := null; _attachment_type := null;
  end if;
  if (select count(*) from public.direct_messages where sender_id = me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'رسايل كتير ورا بعض، استنى دقيقة';
  end if;
  -- Between two accounts, contact details stay hidden.
  if side <> 'platform' and t.broker_b is not null then
    select m.body, m.masked into b, mk from public.mask_contacts(b) m;
  end if;
  label := case when side = 'platform' then 'فاليو عقار'
    else coalesce((select name from public.brokers where id = side::uuid), 'وسيط') end;
  insert into public.direct_messages (thread_id, sender_id, sender_side, sender_label, body, attachment_path, attachment_name, attachment_type, masked)
  values (_thread, me, side, left(label, 120), b, _attachment_path, left(_attachment_name, 150), _attachment_type, mk)
  returning id into new_id;
  update public.direct_threads set last_message_at = now() where id = _thread;
  insert into public.direct_message_reads (thread_id, user_id, side, last_read_at) values (_thread, me, side, now())
  on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at, side = excluded.side;
  return new_id;
end $$;
revoke execute on function public.send_direct_message(uuid, text, text, text, text) from public, anon;
grant execute on function public.send_direct_message(uuid, text, text, text, text) to authenticated;

commit;

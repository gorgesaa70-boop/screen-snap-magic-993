create table if not exists public.direct_threads (
 id uuid primary key default gen_random_uuid(), broker_a uuid not null references public.brokers(id) on delete cascade,
 broker_b uuid references public.brokers(id) on delete cascade, created_by uuid, created_at timestamptz not null default now(),
 last_message_at timestamptz, closed_at timestamptz, closed_by uuid,
 constraint direct_threads_pair check (broker_b is null or broker_a < broker_b));
grant select on public.direct_threads to authenticated;
grant all on public.direct_threads to service_role;
alter table public.direct_threads enable row level security;
create unique index if not exists direct_threads_platform_uq on public.direct_threads (broker_a) where broker_b is null;
create unique index if not exists direct_threads_pair_uq on public.direct_threads (broker_a, broker_b) where broker_b is not null;
create index if not exists direct_threads_b_idx on public.direct_threads (broker_b) where broker_b is not null;
create table if not exists public.direct_messages (
 id uuid primary key default gen_random_uuid(), thread_id uuid not null references public.direct_threads(id) on delete cascade,
 sender_id uuid not null, sender_side text not null check (char_length(sender_side) between 1 and 40),
 sender_label text not null check (char_length(sender_label) between 1 and 120),
 body text check (body is null or char_length(body) between 1 and 2000),
 attachment_path text check (attachment_path is null or char_length(attachment_path) <= 300),
 attachment_name text check (attachment_name is null or char_length(attachment_name) <= 150),
 attachment_type text check (attachment_type is null or attachment_type in ('image','pdf')),
 masked boolean not null default false, reported_at timestamptz, reported_by uuid,
 report_reason text check (report_reason is null or char_length(report_reason) <= 300), created_at timestamptz not null default now(),
 constraint direct_messages_has_content check (body is not null or attachment_path is not null),
 constraint direct_messages_attachment_pair check ((attachment_path is null) = (attachment_type is null)));
grant select on public.direct_messages to authenticated;
grant all on public.direct_messages to service_role;
alter table public.direct_messages enable row level security;
create index if not exists direct_messages_thread_idx on public.direct_messages (thread_id, created_at);
create index if not exists direct_messages_sender_idx on public.direct_messages (sender_id, created_at desc);
create table if not exists public.direct_message_reads (
 thread_id uuid not null references public.direct_threads(id) on delete cascade, user_id uuid not null,
 side text not null check (char_length(side) between 1 and 40), last_read_at timestamptz not null default now(), primary key (thread_id, user_id));
grant select on public.direct_message_reads to authenticated;
grant all on public.direct_message_reads to service_role;
alter table public.direct_message_reads enable row level security;
create or replace function public.direct_thread_side(_thread uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare t public.direct_threads%rowtype; me uuid := auth.uid(); mine uuid;
begin
 if me is null then return null; end if;
 select * into t from public.direct_threads where id = _thread;
 if not found then return null; end if;
 if public.has_role(me, 'admin') or public.is_staff() then return 'platform'; end if;
 if coalesce(public.current_member_role(), '') not in ('owner','manager') then return null; end if;
 mine := public.current_broker_id();
 if mine is not null and (mine = t.broker_a or mine = t.broker_b) then return mine::text; end if;
 return null;
end $$;
revoke execute on function public.direct_thread_side(uuid) from public, anon;
grant execute on function public.direct_thread_side(uuid) to authenticated;
drop policy if exists "conversation members read direct threads" on public.direct_threads;
create policy "conversation members read direct threads" on public.direct_threads for select to authenticated using (public.direct_thread_side(id) is not null);
drop policy if exists "conversation members read direct messages" on public.direct_messages;
create policy "conversation members read direct messages" on public.direct_messages for select to authenticated using (public.direct_thread_side(thread_id) is not null);
drop policy if exists "conversation members read direct read-marks" on public.direct_message_reads;
create policy "conversation members read direct read-marks" on public.direct_message_reads for select to authenticated using (public.direct_thread_side(thread_id) is not null);
create or replace function public.start_direct_thread(_broker uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); mine uuid; a uuid; b uuid; tid uuid; o public.brokers%rowtype;
begin
 if me is null then raise exception 'سجّل دخول الأول' using errcode = '42501'; end if;
 if public.has_role(me, 'admin') or public.is_staff() then
  if _broker is null then raise exception 'اختار الحساب اللي هتراسله'; end if;
  if not exists (select 1 from public.brokers where id = _broker) then raise exception 'الحساب ده مش موجود'; end if;
  a := _broker; b := null;
 else
  if coalesce(public.current_member_role(), '') not in ('owner','manager') then raise exception 'الرسايل المباشرة لصاحب الحساب والمديرين بس' using errcode = '42501'; end if;
  mine := public.current_broker_id();
  if mine is null then raise exception 'حسابك مش مفعّل لسه' using errcode = '42501'; end if;
  if _broker is null then a := mine; b := null;
  else
   if _broker = mine then raise exception 'مينفعش تراسل حسابك'; end if;
   select * into o from public.brokers where id = _broker;
   if not found or not o.is_active or o.is_demo or o.suspended_at is not null
    or o.account_type not in ('individual','office','company','developer')
    or (select account_type from public.brokers where id = mine) not in ('individual','office','company','developer') then raise exception 'الحساب ده مش متاح للرسايل'; end if;
   a := least(mine, _broker); b := greatest(mine, _broker);
  end if;
 end if;
 select id into tid from public.direct_threads where broker_a = a and broker_b is not distinct from b;
 if tid is null then
  begin
   insert into public.direct_threads (broker_a, broker_b, created_by) values (a, b, me) returning id into tid;
  exception when unique_violation then
   select id into tid from public.direct_threads where broker_a = a and broker_b is not distinct from b;
  end;
 end if;
 return tid;
end $$;
revoke execute on function public.start_direct_thread(uuid) from public, anon;
grant execute on function public.start_direct_thread(uuid) to authenticated;
create or replace function public.send_direct_message(_thread uuid, _body text, _attachment_path text default null, _attachment_name text default null, _attachment_type text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.direct_threads%rowtype; side text; me uuid := auth.uid(); label text; b text; mk boolean := false; new_id uuid;
begin
 side := public.direct_thread_side(_thread);
 if side is null then raise exception 'مش مسموحلك تراسل في المحادثة دي' using errcode = '42501'; end if;
 select * into t from public.direct_threads where id = _thread;
 if t.closed_at is not null and side <> 'platform' then raise exception 'المحادثة دي اتقفلت من فاليو عقار' using errcode = '42501'; end if;
 b := nullif(btrim(coalesce(_body, '')), ''); _attachment_path := nullif(_attachment_path, '');
 if b is null and _attachment_path is null then raise exception 'الرسالة فاضية'; end if;
 if _attachment_path is not null then
  if _attachment_type not in ('image','pdf') then raise exception 'نوع الملف مش مسموح'; end if;
  if split_part(_attachment_path, '/', 1) <> 'dm' or split_part(_attachment_path, '/', 2) <> _thread::text then raise exception 'مكان الملف غلط'; end if;
 else _attachment_name := null; _attachment_type := null;
 end if;
 if (select count(*) from public.direct_messages where sender_id = me and created_at > now() - interval '1 minute') >= 20 then raise exception 'رسايل كتير ورا بعض، استنى دقيقة'; end if;
 if side <> 'platform' and t.broker_b is not null then select m.body, m.masked into b, mk from public.mask_contacts(b) m; end if;
 label := case when side = 'platform' then 'فاليو عقار' else coalesce((select name from public.brokers where id = side::uuid), 'وسيط') end;
 insert into public.direct_messages (thread_id, sender_id, sender_side, sender_label, body, attachment_path, attachment_name, attachment_type, masked)
 values (_thread, me, side, left(label, 120), b, _attachment_path, left(_attachment_name, 150), _attachment_type, mk) returning id into new_id;
 update public.direct_threads set last_message_at = now() where id = _thread;
 insert into public.direct_message_reads (thread_id, user_id, side, last_read_at) values (_thread, me, side, now())
 on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at, side = excluded.side;
 return new_id;
end $$;
revoke execute on function public.send_direct_message(uuid, text, text, text, text) from public, anon;
grant execute on function public.send_direct_message(uuid, text, text, text, text) to authenticated;
create or replace function public.mark_direct_read(_thread uuid)
returns void language plpgsql security definer set search_path = public as $$
declare side text := public.direct_thread_side(_thread);
begin
 if side is null then return; end if;
 insert into public.direct_message_reads (thread_id, user_id, side, last_read_at) values (_thread, auth.uid(), side, now())
 on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at, side = excluded.side;
 update public.notifications set is_read = true where user_id = auth.uid() and type = 'new_message' and related_id = _thread and not is_read;
end $$;
revoke execute on function public.mark_direct_read(uuid) from public, anon;
grant execute on function public.mark_direct_read(uuid) to authenticated;
create or replace function public.account_people(_broker uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
 select b.user_id from public.brokers b where b.id = _broker and b.user_id is not null
 union select public.member_user_id(m.id) from public.company_members m where m.company_id = _broker and m.is_active and m.role = 'manager'
$$;
revoke execute on function public.account_people(uuid) from public, anon, authenticated;
create or replace function public.direct_messages_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.direct_threads%rowtype; uid uuid; preview text;
begin
 select * into t from public.direct_threads where id = new.thread_id;
 preview := coalesce(left(new.body, 120), case new.attachment_type when 'image' then 'صورة' else 'ملف PDF' end);
 for uid in
 select p from public.account_people(t.broker_a) p where new.sender_side is distinct from t.broker_a::text
 union select p from public.account_people(t.broker_b) p where t.broker_b is not null and new.sender_side is distinct from t.broker_b::text
 union select r.user_id from public.user_roles r where t.broker_b is null and new.sender_side <> 'platform' and r.role::text in ('admin','staff')
 loop
  continue when uid is null or uid = new.sender_id;
  continue when exists (select 1 from public.notifications n where n.user_id = uid and n.type = 'new_message' and n.related_id = new.thread_id and not n.is_read and n.created_at > now() - interval '5 minutes');
  perform public.notify_user(uid, 'new_message', 'رسالة جديدة من ' || new.sender_label, preview, new.thread_id, '/messages?dm=' || new.thread_id);
 end loop;
 return null;
end $$;
revoke execute on function public.direct_messages_after() from public, anon, authenticated;
drop trigger if exists direct_messages_after on public.direct_messages;
create trigger direct_messages_after after insert on public.direct_messages for each row execute function public.direct_messages_after();
create or replace function public.my_direct_threads()
returns table (thread_id uuid, kind text, side text, other_label text, other_slug text, last_body text, last_at timestamptz, last_mine boolean, unread int, closed boolean)
language sql stable security definer set search_path = public as $$
 with mine as (
 select t.*, public.direct_thread_side(t.id) as my_side from public.direct_threads t where t.last_message_at is not null
 ), last_msg as (
 select distinct on (m.thread_id) m.thread_id, m.body, m.attachment_type, m.created_at, m.sender_side
 from public.direct_messages m join mine on mine.id = m.thread_id where mine.my_side is not null order by m.thread_id, m.created_at desc
 )
 select mine.id, case when mine.broker_b is null then 'platform' else 'broker' end, mine.my_side,
 case
 when mine.my_side = 'platform' and mine.broker_b is null then (select name from public.brokers where id = mine.broker_a)
 when mine.my_side = 'platform' then (select name from public.brokers where id = mine.broker_a) || ' ↔ ' || (select name from public.brokers where id = mine.broker_b)
 when mine.broker_b is null then 'فاليو عقار'
 else (select name from public.brokers where id = case when mine.my_side = mine.broker_a::text then mine.broker_b else mine.broker_a end) end,
 case
 when mine.my_side = 'platform' and mine.broker_b is null then (select slug from public.brokers where id = mine.broker_a)
 when mine.my_side = 'platform' or mine.broker_b is null then null
 else (select slug from public.brokers where id = case when mine.my_side = mine.broker_a::text then mine.broker_b else mine.broker_a end) end,
 coalesce(left(lm.body, 120), case lm.attachment_type when 'image' then 'صورة' else 'ملف PDF' end), lm.created_at, lm.sender_side = mine.my_side,
 (select count(*)::int from public.direct_messages m where m.thread_id = mine.id and m.sender_side <> mine.my_side
 and m.created_at > coalesce((select r.last_read_at from public.direct_message_reads r where r.thread_id = mine.id and r.user_id = auth.uid()), '-infinity')),
 mine.closed_at is not null
 from mine join last_msg lm on lm.thread_id = mine.id where mine.my_side is not null order by lm.created_at desc limit 200
$$;
revoke execute on function public.my_direct_threads() from public, anon;
grant execute on function public.my_direct_threads() to authenticated;
create or replace function public.my_unread_messages()
returns int language sql stable security definer set search_path = public as $$
 select ((select coalesce(sum(c.unread), 0) from public.my_conversations() c) + (select coalesce(sum(d.unread), 0) from public.my_direct_threads() d))::int
$$;
revoke execute on function public.my_unread_messages() from public, anon;
grant execute on function public.my_unread_messages() to authenticated;
create or replace function public.report_direct_message(_message uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.direct_messages%rowtype;
begin
 select * into m from public.direct_messages where id = _message;
 if not found or public.direct_thread_side(m.thread_id) is null then raise exception 'الرسالة مش موجودة' using errcode = '42501'; end if;
 if m.sender_id = auth.uid() then raise exception 'مينفعش تبلّغ عن رسالتك'; end if;
 if m.reported_at is not null then return; end if;
 update public.direct_messages set reported_at = now(), reported_by = auth.uid(), report_reason = left(nullif(btrim(_reason), ''), 300) where id = _message;
 perform public.notify_team('admin', 'بلاغ عن رسالة', m.sender_label || coalesce(' — ' || left(_reason, 100), ''), m.thread_id, '/messages?dm=' || m.thread_id);
end $$;
revoke execute on function public.report_direct_message(uuid, text) from public, anon;
grant execute on function public.report_direct_message(uuid, text) to authenticated;
create or replace function public.set_direct_thread_closed(_thread uuid, _closed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
 if not (public.has_role(auth.uid(), 'admin') or public.is_staff()) then raise exception 'للإدارة بس' using errcode = '42501'; end if;
 update public.direct_threads set closed_at = case when _closed then now() end, closed_by = case when _closed then auth.uid() end where id = _thread;
end $$;
revoke execute on function public.set_direct_thread_closed(uuid, boolean) from public, anon;
grant execute on function public.set_direct_thread_closed(uuid, boolean) to authenticated;
create or replace function public.direct_folder_side(_name text, _upload boolean default false)
returns text language plpgsql stable security definer set search_path = public as $$
declare folder text := split_part(_name, '/', 2);
begin
 if split_part(_name, '/', 1) <> 'dm' or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
 if _upload and exists (select 1 from public.direct_threads t where t.id = folder::uuid and t.closed_at is not null) then return null; end if;
 return public.direct_thread_side(folder::uuid);
end $$;
revoke execute on function public.direct_folder_side(text, boolean) from public, anon;
grant execute on function public.direct_folder_side(text, boolean) to authenticated;
drop policy if exists "direct conversation members read attachments" on storage.objects;
drop policy if exists "direct conversation members upload attachments" on storage.objects;
create policy "direct conversation members read attachments" on storage.objects for select to authenticated using (bucket_id = 'lead-messages' and public.direct_folder_side(name) is not null);
create policy "direct conversation members upload attachments" on storage.objects for insert to authenticated with check (bucket_id = 'lead-messages' and public.direct_folder_side(name, true) is not null);
do $$ begin alter publication supabase_realtime add table public.direct_messages; exception when duplicate_object or undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.direct_message_reads; exception when duplicate_object or undefined_object then null; end $$;
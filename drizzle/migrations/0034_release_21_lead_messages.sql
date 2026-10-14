alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('saved_search_match','new_inquiry','new_request','broker_reply','request_status','admin','new_message'));
alter table public.lead_activities drop constraint if exists lead_activities_kind_check;
alter table public.lead_activities add constraint lead_activities_kind_check
  check (kind in ('call','whatsapp','status','note','follow_up','assign','source','deal','message'));

alter table public.leads
  add column if not exists chat_closed_at timestamptz,
  add column if not exists chat_closed_by uuid;

create table if not exists public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  sender_id uuid not null,
  sender_side text not null check (sender_side in ('customer','company','platform')),
  sender_label text not null check (char_length(sender_label) between 1 and 120),
  body text check (body is null or char_length(body) between 1 and 2000),
  attachment_path text check (attachment_path is null or char_length(attachment_path) <= 300),
  attachment_name text check (attachment_name is null or char_length(attachment_name) <= 150),
  attachment_type text check (attachment_type is null or attachment_type in ('image','pdf')),
  masked boolean not null default false,
  reported_at timestamptz,
  reported_by uuid,
  report_reason text check (report_reason is null or char_length(report_reason) <= 300),
  created_at timestamptz not null default now(),
  constraint lead_messages_has_content check (body is not null or attachment_path is not null),
  constraint lead_messages_attachment_pair check ((attachment_path is null) = (attachment_type is null))
);
create index if not exists lead_messages_lead_idx on public.lead_messages (lead_id, created_at);
create index if not exists lead_messages_sender_idx on public.lead_messages (sender_id, created_at desc);
create index if not exists lead_messages_reported_idx on public.lead_messages (reported_at) where reported_at is not null;

create table if not exists public.lead_message_reads (
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null,
  side text not null check (side in ('customer','company','platform')),
  last_read_at timestamptz not null default now(),
  primary key (lead_id, user_id)
);

create or replace function public.lead_chat_enabled(_l public.leads)
returns boolean language sql stable security definer set search_path = public as $$
  select _l.kind in ('request','inquiry')
    and coalesce(_l.details, '') not like 'دليل الخدمات%'
$$;
revoke execute on function public.lead_chat_enabled(public.leads) from public, anon, authenticated;

create or replace function public.lead_chat_side(_lead uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare l public.leads%rowtype; me uuid := auth.uid(); role text;
begin
  if me is null then return null; end if;
  select * into l from public.leads where id = _lead;
  if not found or not public.lead_chat_enabled(l) then return null; end if;
  if public.has_role(me, 'admin') or public.is_staff() then return 'platform'; end if;
  if l.assigned_broker_id is not null and l.assigned_broker_id = public.current_broker_id() then
    role := public.current_member_role();
    if role in ('owner','manager') or (l.assigned_member_id is not null and l.assigned_member_id = public.my_member_id()) then
      return 'company';
    end if;
  end if;
  if l.customer_id = me
     or (l.customer_id is null and l.phone_norm is not null and l.phone_norm = public.my_phone()) then
    return 'customer';
  end if;
  return null;
end $$;
revoke execute on function public.lead_chat_side(uuid) from public, anon;
grant execute on function public.lead_chat_side(uuid) to authenticated;

grant select on public.lead_messages to authenticated;
grant all on public.lead_messages to service_role;
alter table public.lead_messages enable row level security;
drop policy if exists "conversation members read messages" on public.lead_messages;
create policy "conversation members read messages" on public.lead_messages for select to authenticated
  using (public.lead_chat_side(lead_id) is not null);

grant select on public.lead_message_reads to authenticated;
grant all on public.lead_message_reads to service_role;
alter table public.lead_message_reads enable row level security;
drop policy if exists "conversation members read read-marks" on public.lead_message_reads;
create policy "conversation members read read-marks" on public.lead_message_reads for select to authenticated
  using (public.lead_chat_side(lead_id) is not null);

create or replace function public.mask_contacts(_body text, out body text, out masked boolean)
language plpgsql immutable set search_path = public as $$
declare latin text; m text; digits int;
begin
  body := _body; masked := false;
  if _body is null then return; end if;
  latin := translate(_body, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  for m in select (regexp_matches(latin, '\+?[0-9][0-9 ().-]{6,}[0-9]', 'g'))[1] loop
    digits := char_length(regexp_replace(m, '[^0-9]', '', 'g'));
    if digits >= 10 then
      latin := replace(latin, m, '[رقم مخفي]');
      masked := true;
    end if;
  end loop;
  if latin ~* '(wa\.me|whatsapp\.com|t\.me/|telegram\.me|m\.me/|messenger\.com)' then
    latin := regexp_replace(latin, '(https?://)?(www\.)?(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|whatsapp\.com|t\.me|telegram\.me|m\.me|messenger\.com)\S*', '[رابط مخفي]', 'gi');
    masked := true;
  end if;
  if masked then body := latin; end if;
end $$;
revoke execute on function public.mask_contacts(text) from public, anon, authenticated;

create or replace function public.send_lead_message(_lead uuid, _body text, _attachment_path text default null,
  _attachment_name text default null, _attachment_type text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare l public.leads%rowtype; side text; me uuid := auth.uid(); label text; b text; mk boolean := false; new_id uuid;
begin
  side := public.lead_chat_side(_lead);
  if side is null then raise exception 'مش مسموحلك تراسل على الطلب ده' using errcode = '42501'; end if;
  select * into l from public.leads where id = _lead;
  if l.chat_closed_at is not null and side <> 'platform' then
    raise exception 'المحادثة دي اتقفلت من فاليو عقار' using errcode = '42501';
  end if;
  b := nullif(btrim(coalesce(_body, '')), '');
  if b is null and _attachment_path is null then raise exception 'الرسالة فاضية'; end if;
  if _attachment_path is not null then
    if _attachment_type not in ('image','pdf') then raise exception 'نوع الملف مش مسموح'; end if;
    if split_part(_attachment_path, '/', 1) <> _lead::text then raise exception 'مكان الملف غلط'; end if;
  end if;
  if (select count(*) from public.lead_messages where sender_id = me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'رسايل كتير ورا بعض، استنى دقيقة';
  end if;
  if side <> 'platform' and l.stage::text not in ('reserved','contracted','sold') then
    select m.body, m.masked into b, mk from public.mask_contacts(b) m;
  end if;
  label := case side
    when 'platform' then 'فاليو عقار'
    when 'company' then coalesce((select name from public.brokers where id = l.assigned_broker_id), 'الشركة')
    else coalesce(nullif(btrim(l.name), ''), 'العميل') end;
  insert into public.lead_messages (lead_id, sender_id, sender_side, sender_label, body, attachment_path, attachment_name, attachment_type, masked)
  values (_lead, me, side, left(label, 120), b, _attachment_path, left(_attachment_name, 150), _attachment_type, mk)
  returning id into new_id;
  insert into public.lead_message_reads (lead_id, user_id, side, last_read_at) values (_lead, me, side, now())
  on conflict (lead_id, user_id) do update set last_read_at = excluded.last_read_at, side = excluded.side;
  return new_id;
end $$;
revoke execute on function public.send_lead_message(uuid, text, text, text, text) from public, anon;
grant execute on function public.send_lead_message(uuid, text, text, text, text) to authenticated;

create or replace function public.mark_lead_messages_read(_lead uuid)
returns void language plpgsql security definer set search_path = public as $$
declare side text := public.lead_chat_side(_lead);
begin
  if side is null then return; end if;
  insert into public.lead_message_reads (lead_id, user_id, side, last_read_at) values (_lead, auth.uid(), side, now())
  on conflict (lead_id, user_id) do update set last_read_at = excluded.last_read_at, side = excluded.side;
  update public.notifications set is_read = true
  where user_id = auth.uid() and type = 'new_message' and related_id = _lead and not is_read;
end $$;
revoke execute on function public.mark_lead_messages_read(uuid) from public, anon;
grant execute on function public.mark_lead_messages_read(uuid) to authenticated;

create or replace function public.lead_message_recipients(_l public.leads, _sender_side text)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare cust uuid;
begin
  if _sender_side <> 'customer' then
    cust := coalesce(_l.customer_id, (select u.id from auth.users u where public.normalize_phone(u.phone) = _l.phone_norm and _l.phone_norm is not null limit 1));
    if cust is not null then return next cust; end if;
  end if;
  if _sender_side <> 'company' and _l.assigned_broker_id is not null then
    return query
      select b.user_id from public.brokers b where b.id = _l.assigned_broker_id and b.user_id is not null
      union
      select public.member_user_id(m.id) from public.company_members m
      where m.company_id = _l.assigned_broker_id and m.is_active
        and (m.role = 'manager' or m.id = _l.assigned_member_id);
  end if;
  if _sender_side = 'customer' then
    if _l.assigned_staff_id is not null then
      return next _l.assigned_staff_id;
    elsif _l.assigned_broker_id is null then
      return query select distinct r.user_id from public.user_roles r where r.role::text in ('admin','staff');
    end if;
  end if;
end $$;
revoke execute on function public.lead_message_recipients(public.leads, text) from public, anon, authenticated;

create or replace function public.lead_messages_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare l public.leads%rowtype; uid uuid; preview text; ttl text;
begin
  select * into l from public.leads where id = new.lead_id;
  if new.sender_side = 'company' then
    update public.leads set first_response_at = new.created_at, first_response_by = new.sender_id, first_response_outcome = 'message'
    where id = new.lead_id and first_response_at is null and assigned_broker_id is not null
      and (referred_at is null or referred_at <= new.created_at);
  end if;
  if not exists (select 1 from public.lead_activities a where a.lead_id = new.lead_id and a.kind = 'message'
                 and a.actor_id = new.sender_id and a.created_at > now() - interval '1 day') then
    insert into public.lead_activities (lead_id, actor_id, kind, summary)
    values (new.lead_id, new.sender_id, 'message',
      case new.sender_side when 'customer' then 'العميل بعت رسالة' when 'company' then 'الشركة ردت في الرسايل' else 'فاليو عقار بعتت رسالة' end);
  end if;
  preview := coalesce(left(new.body, 120), case new.attachment_type when 'image' then 'صورة' else 'ملف PDF' end);
  ttl := 'رسالة جديدة: ' || public.lead_title(l);
  for uid in select distinct r from public.lead_message_recipients(l, new.sender_side) r loop
    continue when uid is null or uid = new.sender_id;
    continue when exists (select 1 from public.notifications n where n.user_id = uid and n.type = 'new_message'
      and n.related_id = new.lead_id and not n.is_read and n.created_at > now() - interval '5 minutes');
    perform public.notify_user(uid, 'new_message', ttl, new.sender_label || ': ' || preview, new.lead_id,
      case when uid = l.customer_id or uid in (select u.id from auth.users u where public.normalize_phone(u.phone) = l.phone_norm)
           then '/messages?lead=' || new.lead_id else '/leads/' || new.lead_id || '#messages' end);
  end loop;
  return null;
end $$;
revoke execute on function public.lead_messages_after() from public, anon, authenticated;
drop trigger if exists lead_messages_after on public.lead_messages;
create trigger lead_messages_after after insert on public.lead_messages for each row execute function public.lead_messages_after();

create or replace function public.my_conversations()
returns table (lead_id uuid, lead_no bigint, title text, side text, other_label text, last_body text, last_at timestamptz,
  last_side text, unread int, closed boolean, stage text)
language sql stable security definer set search_path = public as $$
  with mine as (
    select l.*, public.lead_chat_side(l.id) as my_side
    from public.leads l
    where exists (select 1 from public.lead_messages m where m.lead_id = l.id)
  ), last_msg as (
    select distinct on (m.lead_id) m.lead_id, m.body, m.attachment_type, m.created_at, m.sender_side
    from public.lead_messages m join mine on mine.id = m.lead_id
    where mine.my_side is not null
    order by m.lead_id, m.created_at desc
  )
  select mine.id, mine.lead_no, public.lead_title((select x from public.leads x where x.id = mine.id)), mine.my_side,
    case when mine.my_side = 'customer' then coalesce((select name from public.brokers where id = mine.assigned_broker_id), 'فاليو عقار')
         else mine.name end,
    coalesce(left(lm.body, 120), case lm.attachment_type when 'image' then 'صورة' else 'ملف PDF' end),
    lm.created_at, lm.sender_side,
    (select count(*)::int from public.lead_messages m where m.lead_id = mine.id and m.sender_id <> auth.uid()
       and m.created_at > coalesce((select r.last_read_at from public.lead_message_reads r where r.lead_id = mine.id and r.user_id = auth.uid()), '-infinity')),
    mine.chat_closed_at is not null, mine.stage::text
  from mine join last_msg lm on lm.lead_id = mine.id
  where mine.my_side is not null
  order by lm.created_at desc
  limit 200
$$;
revoke execute on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

create or replace function public.my_unread_messages()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(c.unread), 0)::int from public.my_conversations() c
$$;
revoke execute on function public.my_unread_messages() from public, anon;
grant execute on function public.my_unread_messages() to authenticated;

create or replace function public.report_lead_message(_message uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.lead_messages%rowtype;
begin
  select * into m from public.lead_messages where id = _message;
  if not found or public.lead_chat_side(m.lead_id) is null then raise exception 'الرسالة مش موجودة' using errcode = '42501'; end if;
  if m.sender_id = auth.uid() then raise exception 'مينفعش تبلّغ عن رسالتك'; end if;
  if m.reported_at is not null then return; end if;
  update public.lead_messages set reported_at = now(), reported_by = auth.uid(), report_reason = left(nullif(btrim(_reason), ''), 300)
  where id = _message;
  perform public.notify_team('admin', 'بلاغ عن رسالة',
    (select 'VA-' || lpad(l.lead_no::text, 6, '0') || ' — ' || m.sender_label || coalesce(' — ' || left(_reason, 100), '') from public.leads l where l.id = m.lead_id),
    m.lead_id, '/leads/' || m.lead_id || '#messages');
end $$;
revoke execute on function public.report_lead_message(uuid, text) from public, anon;
grant execute on function public.report_lead_message(uuid, text) to authenticated;

create or replace function public.set_lead_chat_closed(_lead uuid, _closed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or public.is_staff()) then raise exception 'للإدارة بس' using errcode = '42501'; end if;
  update public.leads set chat_closed_at = case when _closed then now() end, chat_closed_by = case when _closed then auth.uid() end
  where id = _lead;
end $$;
revoke execute on function public.set_lead_chat_closed(uuid, boolean) from public, anon;
grant execute on function public.set_lead_chat_closed(uuid, boolean) to authenticated;

create or replace function public.lead_chat_folder_side(_name text, _upload boolean default false)
returns text language plpgsql stable security definer set search_path = public as $$
declare folder text := split_part(_name, '/', 1);
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  if _upload and exists (select 1 from public.leads l where l.id = folder::uuid and l.chat_closed_at is not null) then return null; end if;
  return public.lead_chat_side(folder::uuid);
end $$;
revoke execute on function public.lead_chat_folder_side(text, boolean) from public, anon;
grant execute on function public.lead_chat_folder_side(text, boolean) to authenticated;

drop policy if exists "conversation members read attachments" on storage.objects;
drop policy if exists "conversation members upload attachments" on storage.objects;
create policy "conversation members read attachments" on storage.objects for select to authenticated
  using (bucket_id = 'lead-messages' and public.lead_chat_folder_side(name) is not null);
create policy "conversation members upload attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'lead-messages' and public.lead_chat_folder_side(name, true) is not null);

do $$ begin
  alter publication supabase_realtime add table public.lead_messages;
exception when duplicate_object or undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.lead_message_reads;
exception when duplicate_object or undefined_object then null; end $$;
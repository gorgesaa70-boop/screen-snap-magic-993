-- WhatsApp chats about a listing go to the listing's owner (broker, company or developer), who answers from the
-- platform. Replies leave from the Value Aqar number and the owner never sees the customer's number (all contact
-- goes through the platform).
-- * wa_conversations: an opaque id (what the owner's screen uses instead of the phone), the owner the chat is with
--   now, the listing it's about, when it was handed over / first answered / flagged to the team, the owner's unread.
-- * wa_messages: broker_id = the owner the chat was with when the message was written; an owner reads only those.
--   sender 'owner' = a reply from the owner's dashboard.
-- * wa_assign_owner (service role): the bot hands a chat to a listing's owner and rings their bell.
-- * wa_owner_threads / wa_owner_messages: the owner's inbox (no phone numbers).
-- * wa_release_owner: the team takes a chat back.
-- Additive only; re-runnable.

alter table public.wa_conversations add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists wa_conversations_id on public.wa_conversations (id);
alter table public.wa_conversations add column if not exists owner_broker_id uuid references public.brokers(id) on delete set null;
alter table public.wa_conversations add column if not exists owner_property_id uuid references public.properties(id) on delete set null;
alter table public.wa_conversations add column if not exists owner_assigned_at timestamptz;
alter table public.wa_conversations add column if not exists owner_replied_at timestamptz;
alter table public.wa_conversations add column if not exists owner_alerted_at timestamptz;
alter table public.wa_conversations add column if not exists owner_unread integer not null default 0;
create index if not exists wa_conversations_owner on public.wa_conversations (owner_broker_id) where owner_broker_id is not null;

alter table public.wa_messages add column if not exists broker_id uuid references public.brokers(id) on delete set null;
create index if not exists wa_messages_broker on public.wa_messages (broker_id, phone, created_at desc) where broker_id is not null;
alter table public.wa_messages drop constraint if exists wa_messages_sender_check;
alter table public.wa_messages add constraint wa_messages_sender_check check (sender in ('customer', 'bot', 'staff', 'owner'));

-- Every message written while a chat is with an owner belongs to that owner's history.
create or replace function public.wa_messages_stamp_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.broker_id is null then
    select c.owner_broker_id into new.broker_id from public.wa_conversations c where c.phone = new.phone;
  end if;
  return new;
end $$;
drop trigger if exists wa_messages_stamp_owner on public.wa_messages;
create trigger wa_messages_stamp_owner before insert on public.wa_messages for each row execute function public.wa_messages_stamp_owner();

-- The bot hands the chat to the owner of an approved listing (an active broker / company / developer account).
-- Listings without one (owner listings, Value Aqar's own) stay with the team: returns null.
-- The last hour of the chat goes with it, so the owner sees what the customer asked.
create or replace function public.wa_assign_owner(_phone text, _property uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare b uuid; code bigint; title text; who text;
begin
  select p.broker_id, p.listing_no, p.title into b, code, title
  from public.properties p join public.brokers br on br.id = p.broker_id and br.is_active
  where p.id = _property and p.review_status = 'approved';
  if b is null then return null; end if;
  select coalesce(c.name, 'عميل') into who from public.wa_conversations c where c.phone = _phone;
  if not found then return null; end if;
  update public.wa_conversations set owner_broker_id = b, owner_property_id = _property, owner_assigned_at = now(),
    owner_replied_at = null, owner_alerted_at = null, owner_unread = 1
  where phone = _phone;
  update public.wa_messages set broker_id = b where phone = _phone and broker_id is null and created_at > now() - interval '1 hour';
  perform public.notify_company(b, 'new_message', 'عميل بيسأل على إعلانك على الواتساب',
    who || ' سأل على ' || coalesce('VA-' || code, title, 'إعلانك') || ' — رد عليه من «محادثات الواتساب».', null, '/dashboard?tab=wa');
  return b;
end $$;
revoke execute on function public.wa_assign_owner(text, uuid) from public, anon, authenticated;
grant execute on function public.wa_assign_owner(text, uuid) to service_role;

-- The owner's bell for a new message in a chat that's with them (the webhook runs as the service role).
create or replace function public.wa_notify_owner(_phone text, _msg text)
returns void language plpgsql security definer set search_path = public as $$
declare b uuid; who text;
begin
  select c.owner_broker_id, coalesce(c.name, 'عميل') into b, who from public.wa_conversations c where c.phone = _phone;
  if b is null then return; end if;
  perform public.notify_company(b, 'new_message', 'رسالة واتساب جديدة من عميل', who || ': ' || left(_msg, 140), null, '/dashboard?tab=wa');
end $$;
revoke execute on function public.wa_notify_owner(text, text) from public, anon, authenticated;
grant execute on function public.wa_notify_owner(text, text) to service_role;

-- The owner's chats: name, the last 3 digits only, the listing, the last message they can see.
create or replace function public.wa_owner_threads()
returns table (id uuid, name text, phone_tail text, property_id uuid, property_code bigint, property_title text,
  last_message text, last_at timestamptz, unread integer, is_current boolean, can_reply boolean)
language sql stable security definer set search_path = public as $$
  with me as (select public.current_broker_id() as b)
  select c.id, c.name, right(c.phone, 3),
    case when c.owner_broker_id = me.b then c.owner_property_id end,
    case when c.owner_broker_id = me.b then p.listing_no end,
    case when c.owner_broker_id = me.b then p.title end,
    m.body, m.created_at,
    case when c.owner_broker_id = me.b then c.owner_unread else 0 end,
    c.owner_broker_id = me.b,
    c.owner_broker_id = me.b and c.last_inbound_at > now() - interval '24 hours'
  from me
  join public.wa_conversations c on me.b is not null
  join lateral (select x.body, x.created_at from public.wa_messages x where x.phone = c.phone and x.broker_id = me.b
    order by x.created_at desc limit 1) m on true
  left join public.properties p on p.id = c.owner_property_id
  order by m.created_at desc
  limit 200
$$;
revoke execute on function public.wa_owner_threads() from public, anon;
grant execute on function public.wa_owner_threads() to authenticated;

-- One chat's messages (only the ones written while it was with this owner); opening it clears the owner's unread.
create or replace function public.wa_owner_messages(_id uuid)
returns table (id uuid, direction text, sender text, body text, status text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare me uuid := public.current_broker_id(); ph text; cur uuid;
begin
  if me is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select c.phone, c.owner_broker_id into ph, cur from public.wa_conversations c where c.id = _id;
  if ph is null then return; end if;
  if cur = me then update public.wa_conversations set owner_unread = 0 where phone = ph; end if;
  return query select m.id, m.direction, m.sender, m.body, m.status, m.created_at
    from public.wa_messages m where m.phone = ph and m.broker_id = me order by m.created_at desc limit 200;
end $$;
revoke execute on function public.wa_owner_messages(uuid) from public, anon;
grant execute on function public.wa_owner_messages(uuid) to authenticated;

-- The team takes a chat back from the owner (the owner keeps the history they already had).
create or replace function public.wa_release_owner(_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_can('wa_inbox', 'edit') then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.wa_conversations set owner_broker_id = null, owner_property_id = null, owner_assigned_at = null,
    owner_replied_at = null, owner_alerted_at = null, owner_unread = 0
  where phone = _phone;
end $$;
revoke execute on function public.wa_release_owner(text) from public, anon;
grant execute on function public.wa_release_owner(text) to authenticated;

-- فاليو عقار — إصدار 36: بوت الواتساب + صندوق محادثات الواتساب في لوحة الإدارة.
-- * جدولين جداد: wa_conversations (محادثة لكل رقم) و wa_messages (كل رسالة داخلة وخارجة).
-- * app_settings: زرارين تشغيل/إيقاف (الرد الآلي، والذكاء الاصطناعي)، شغالين من الأول.
-- إضافة بس، مفيش حاجة بتتمسح. مرة واحدة، كله أو مفيش. لو اتشغل تاني مفيش ضرر. مستقل.
--   20261019100000_whatsapp-bot.sql

begin;
-- WhatsApp bot + team inbox on the API number.
-- * wa_conversations: one row per customer number (last activity, unread count, bot paused until).
-- * wa_messages: every message in and out (customer / bot / staff), with Meta's delivery status.
-- * app_settings.wa_bot_enabled / wa_bot_ai: the admin's on/off switches (bot replies, AI answers).
-- The webhook and the reply server function write with the service role; the team (admin / staff) reads.
-- Additive only; re-runnable.

create table if not exists public.wa_conversations (
  phone text primary key check (phone ~ '^[0-9]{8,15}$'),
  name text,
  lead_id uuid references public.leads(id) on delete set null,
  last_message text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  unread integer not null default 0,
  bot_paused_until timestamptz,
  handoff_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists wa_conversations_updated on public.wa_conversations (updated_at desc);

create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  phone text not null references public.wa_conversations(phone) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  sender text not null check (sender in ('customer', 'bot', 'staff')),
  staff_id uuid,
  body text not null default '',
  wa_message_id text unique,
  status text,
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_phone_time on public.wa_messages (phone, created_at desc);

alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;

drop policy if exists "team reads wa conversations" on public.wa_conversations;
create policy "team reads wa conversations" on public.wa_conversations for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.is_staff());
drop policy if exists "team reads wa messages" on public.wa_messages;
create policy "team reads wa messages" on public.wa_messages for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.is_staff());
-- Writes only through the service role (webhook / reply function); opening a conversation clears its unread count.
revoke insert, update, delete on public.wa_conversations from anon, authenticated;
revoke insert, update, delete on public.wa_messages from anon, authenticated;
grant select on public.wa_conversations to authenticated;
grant select on public.wa_messages to authenticated;

create or replace function public.wa_mark_read(_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(), 'admin') or public.is_staff()) then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.wa_conversations set unread = 0 where phone = _phone;
end $$;
revoke execute on function public.wa_mark_read(text) from public, anon;
grant execute on function public.wa_mark_read(text) to authenticated;

-- Bell notification for the team (the webhook runs as the service role).
create or replace function public.wa_notify_team(_title text, _msg text, _phone text)
returns void language sql security definer set search_path = public as $$
  select public.notify_team('admin', _title, _msg, null, '/admin?tab=wa_inbox&phone=' || _phone)
$$;
revoke execute on function public.wa_notify_team(text, text, text) from public, anon, authenticated;
grant execute on function public.wa_notify_team(text, text, text) to service_role;

alter table public.app_settings add column if not exists wa_bot_enabled boolean not null default true;
alter table public.app_settings add column if not exists wa_bot_ai boolean not null default true;
commit;

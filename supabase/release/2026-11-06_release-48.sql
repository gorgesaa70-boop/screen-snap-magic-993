-- فاليو عقار — إصدار 48: واتساب للعميل (تأكيد استلام طلبه) وللمالك اللي من غير حساب (استفسار جديد على عقاره) مع كل طلب أو استفسار.
-- * الرسايل بتستنى في wa_outbox (للسيرفر بس) والموقع بيبعتها كل دقيقة بقالب valueaqar_notify. إضافة بس، ينفع يتشغل تاني. بعد إصدار 47.
--   20261106100000_wa-outbox.sql

begin;
-- WhatsApp to people without an account on every new request or inquiry (release 48):
-- * the customer: a confirmation from Value Aqar with the request's name and number (not for WhatsApp chats, where the
--   bot already answers, nor Excel imports);
-- * a private owner (a listing with owner_lead_id and no account): a heads-up that their listing got an inquiry —
--   never the customer's name or number (all contact goes through the platform).
-- They wait in service-only wa_outbox; the whatsapp-dispatch job (every minute) sends them with the approved template.
-- Accounts (owner, managers, assigned member, assigned staff) keep getting theirs as notification copies.
-- Additive only; re-runnable. After release 47.

create table if not exists public.wa_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('customer','owner')),
  phone text not null check (char_length(phone) <= 20),
  title text not null check (char_length(title) <= 200),
  message text not null check (char_length(message) <= 500),
  lead_id uuid references public.leads(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  error text,
  message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists wa_outbox_pending_idx on public.wa_outbox (created_at) where status = 'pending';
create index if not exists wa_outbox_phone_idx on public.wa_outbox (kind, phone, created_at desc);
alter table public.wa_outbox enable row level security;
revoke all on public.wa_outbox from anon, authenticated;
grant all on public.wa_outbox to service_role;

create or replace function public.wa_outbox_on_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare ttl text; code text; prop record; owner_phone text;
begin
  if new.kind not in ('request','inquiry','investment') then return new; end if;
  ttl := public.lead_title(new);
  code := 'VA-' || lpad(new.lead_no::text, 6, '0');

  -- The customer (once a day per number, so duplicates and quick retries don't repeat it).
  if new.source not in ('whatsapp','excel') and new.phone is not null
     and not exists (select 1 from public.wa_outbox o where o.kind = 'customer' and o.phone = new.phone and o.created_at > now() - interval '1 day') then
    insert into public.wa_outbox (kind, phone, title, message, lead_id)
    values ('customer', new.phone, 'فاليو عقار',
      left('أهلاً ' || coalesce(nullif(trim(new.name), ''), 'بيك') || ' 👋 استلمنا طلبك: ' || ttl || '. رقم طلبك ' || code
           || '. فريق فاليو عقار هيتواصل معاك قريب.', 500), new.id);
  end if;

  -- A private owner's listing.
  if new.property_id is not null then
    select p.title, p.broker_id, p.owner_lead_id into prop from public.properties p where p.id = new.property_id;
    if prop.broker_id is null and prop.owner_lead_id is not null then
      select l.phone into owner_phone from public.leads l where l.id = prop.owner_lead_id;
      if owner_phone is not null and owner_phone is distinct from new.phone then
        insert into public.wa_outbox (kind, phone, title, message, lead_id)
        values ('owner', owner_phone, 'استفسار جديد على عقارك',
          left('عقارك «' || left(prop.title, 80) || '» عليه استفسار جديد على فاليو عقار. فريقنا بيتابع مع العميل وهنكلمك.', 500), new.id);
      end if;
    end if;
  end if;
  return new;
exception when others then
  -- Never block a customer's request because of a message.
  perform public.log_app_error('server', left('wa_outbox_on_lead: ' || sqlerrm, 500), '', 'trigger wa_outbox_on_lead', '');
  return new;
end $$;
revoke execute on function public.wa_outbox_on_lead() from public, anon, authenticated;

drop trigger if exists leads_wa_outbox on public.leads;
create trigger leads_wa_outbox after insert on public.leads for each row execute function public.wa_outbox_on_lead();
commit;

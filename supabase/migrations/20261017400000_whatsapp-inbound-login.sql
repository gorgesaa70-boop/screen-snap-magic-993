-- WhatsApp sign-in without a message template ("send us the code").
-- The site shows a 6-digit code; the customer sends it from their own WhatsApp to Value Aqar's API number.
-- The webhook matches sender + code and sets confirmed_at; only the browser that holds the ticket can then use it.
-- * ticket_hash: HMAC of the random ticket returned to the browser that started the sign-in (null = code sent by template).
-- * confirmed_at: when the matching WhatsApp message arrived from the same number.
-- Additive only; re-runnable. The table stays service-only (RLS on, no policies).
alter table public.whatsapp_otps add column if not exists ticket_hash text;
alter table public.whatsapp_otps add column if not exists confirmed_at timestamptz;

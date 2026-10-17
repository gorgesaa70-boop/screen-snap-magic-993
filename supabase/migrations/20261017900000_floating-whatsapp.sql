-- The floating WhatsApp button's number, set by the admin from لوحة الإدارة ← الإعدادات ← رقم الواتساب العائم.
-- Empty = the site's built-in Value Aqar number. Digits only with the country code (e.g. 201012345678).
-- Lives on app_settings (one row, public read, admin update, already audited). Additive only; re-runnable.
alter table public.app_settings
  add column if not exists floating_whatsapp text check (floating_whatsapp is null or floating_whatsapp ~ '^[1-9][0-9]{7,14}$');

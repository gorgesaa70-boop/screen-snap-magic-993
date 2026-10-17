-- «غلق الموقع»: the admin closes the site for visitors from لوحة الإدارة ← الإعدادات ← غلق الموقع.
-- Visitors see one full-screen page with the admin's message; admins and Value Aqar staff keep using the site.
-- Lives on app_settings (one row, public read, admin update, already audited). Additive only; re-runnable.
alter table public.app_settings
  add column if not exists site_closed boolean not null default false,
  add column if not exists site_closed_message text check (site_closed_message is null or char_length(site_closed_message) <= 500);

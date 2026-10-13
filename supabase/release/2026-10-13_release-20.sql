-- فاليو عقار — إصدار 20: رسالة التثبيت على الموقع (شريط فوق الهيدر، ونافذة منبثقة اختيارية) بيكتبها الأدمن من لوحة الإدارة.
-- مرة واحدة، كله أو مفيش. بيضيف خانات جديدة بس على إعدادات التطبيق. لو اتشغل تاني بالغلط مفيش ضرر.
--   20261013800000_site-announcement.sql

begin;
-- Pinned site announcement: one message the admin writes from the dashboard and every visitor sees on every page
-- (website and the mobile apps, which load the same site). Shown as a bar over the header, or also as a one-time
-- popup for big announcements. Lives on app_settings (one row, public read, admin update, already audited).
-- Additive only: new nullable/defaulted columns.
alter table public.app_settings
  add column if not exists announce_on boolean not null default false,
  add column if not exists announce_ar text check (announce_ar is null or char_length(announce_ar) <= 300),
  add column if not exists announce_en text check (announce_en is null or char_length(announce_en) <= 300),
  add column if not exists announce_url text check (announce_url is null or (char_length(announce_url) <= 300 and announce_url ~ '^(https://|/)[^\s<>"]*$')),
  add column if not exists announce_popup boolean not null default false,
  add column if not exists announce_starts_at timestamptz,
  add column if not exists announce_ends_at timestamptz;

do $$ begin
  alter table public.app_settings add constraint app_settings_announce_text
    check (not announce_on or char_length(btrim(coalesce(announce_ar, ''))) >= 2);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.app_settings add constraint app_settings_announce_dates
    check (announce_starts_at is null or announce_ends_at is null or announce_ends_at > announce_starts_at);
exception when duplicate_object then null; end $$;

commit;

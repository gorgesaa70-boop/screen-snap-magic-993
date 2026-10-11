-- فاليو عقار — الإصدار 0: بيتنفذ الأول خالص، لوحده، قبل 2026-10-11_release.sql.
-- بيزوّد مراحل العميل الجديدة على النوع الموجود (إضافة بس — آمن على الموقع القديم). لو اتشغّل تاني مش بيعمل حاجة.
-- ملاحظة: مش جوه begin/commit عن قصد — القيم الجديدة لازم تتحفظ قبل ما الملف اللي بعده يستخدمها.

-- ================= 20261011175000_lead-stage-values.sql =================
-- The 10-stage pipeline (item 12) as new values of the existing lead_stage type. Additive only, so the platform
-- accepts it without allowing backward-incompatible migrations, and the old site keeps working. It runs (and
-- commits) on its own, before the next release file, because a new enum value can't be used in the same
-- transaction that adds it. The old values (viewing, negotiating, won) stay in the type but are no longer used.
alter type public.lead_stage add value if not exists 'qualified';
alter type public.lead_stage add value if not exists 'visit_scheduled';
alter type public.lead_stage add value if not exists 'visited';
alter type public.lead_stage add value if not exists 'reserved';
alter type public.lead_stage add value if not exists 'contracted';
alter type public.lead_stage add value if not exists 'sold';
alter type public.lead_stage add value if not exists 'postponed';

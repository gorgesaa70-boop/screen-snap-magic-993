-- فاليو عقار — إصدار 28: الدخول بواتساب من غير قالب («ابعتلنا الكود»).
-- * الموقع بيدي العميل كود، والعميل بيبعته من واتساب بتاعه لرقم فاليو عقار؛ الويب هوك بيتأكد إن الرسالة من نفس الرقم.
-- * whatsapp_otps: خانتين جداد (ticket_hash، confirmed_at). إضافة بس، مفيش بيانات بتتمسح.
-- مرة واحدة، كله أو مفيش. لو اتشغل تاني بالغلط مفيش ضرر. مستقل عن الإصدارات 20–27.
--   20261017400000_whatsapp-inbound-login.sql

begin;
alter table public.whatsapp_otps add column if not exists ticket_hash text;
alter table public.whatsapp_otps add column if not exists confirmed_at timestamptz;
commit;

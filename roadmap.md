# Roadmap

- [x] Broker system: public brokers page + profiles, broker dashboard, admin dashboard, roles & RLS, plans
- [x] Phone + SMS OTP login (country code, 6-digit code, 60s resend, 5-min expiry, attempt limits)
- [x] Role-based redirect after login
- [x] Change phone number with verification
- [x] Security event log (no plain OTP stored)
- [ ] Real SMS provider connection — waiting on user to add provider credentials in Cloud auth settings
- [ ] WhatsApp OTP live test — user chose Lovable's built-in WhatsApp connection; connect card pending user completion, then adapt send code to gateway and test with 01021075553
- [ ] Social platforms request — unclear: social login (Google/Facebook) vs social profile links on site; asked user to clarify
- [ ] CRM انجاز (Injaz) integration — user asked how to connect it; check if a connector exists, else explain API-key route
- [x] TikTok icon in footer with account link @value.square8
- [x] Dedicated inquiries dashboard (/inquiries): stats, search, kind/stage filters, assign (admin), stages & notes
- [x] Inquiries: CSV export of filtered list, follow-up date + due reminders, AI WhatsApp reply drafting
- [x] Maps integration: connected Google Maps (managed); map picker + property map verified. NOTE: managed key only works on *.lovable.app — custom domain needs user-owned API key
- [x] Lead activity timeline (calls, WhatsApp, status, notes) + AI intent/urgency/next-action analysis
- [x] صفحة خريطة العقارات (/map) بمفتاح VITE_GOOGLE_MAPS_API_KEY مع بديل المفتاح الحالي
- [x] ENGAZ CRM test: demo listing page /demo/central-point (Central Point shop, static, no DB) — pending: real ENGAZ listing URL from user
- [x] خانة رابط إنجاز في نموذج العقار + زر المصدر في صفحة العقار

- [x] قسم المصانع والأراضي الصناعية
- [x] قسم المولات
- [x] نظام الإشعارات (المرحلة 1): جرس + صفحة + تلقائي للطلبات والمراجعة
- [ ] الإشعارات المرحلة 2: البحث المحفوظ للعملاء، رد الوسيط، Web Push/واتساب/إنجاز
- [ ] إشعارات إدارية في لوحة المدير (طلب عقار من وسيط، رفض، تمييز) + فلتر بالوقت
- [ ] ربط الإشعارات بواتساب وإنجاز — يعتمد على بيانات Meta وAPI إنجاز
- [ ] حساب وسيط وعميل تجريبيين + إشعارين اختبار + التحقق من عداد الجرس والقراءة
- [ ] الإشعار يفتح داخل صفحة الإشعارات (تفاصيل) بدل صفحة منفصلة

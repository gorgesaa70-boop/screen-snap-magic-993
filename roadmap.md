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
- [x] Maps integration: connected Google Maps (managed); map picker + property map verified. NOTE: managed key only works on *.lovable.app — custom domain needs user-owned API key

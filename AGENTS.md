<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Access control is enforced in Postgres RLS + guard triggers (brokers_guard, properties_guard, leads_guard); UI checks are UX only.
- Roles live in `user_roles` (admin, broker) checked via `has_role()`; brokers map to users through `brokers.user_id`.
- Privileged admin actions (creating/inviting accounts, banning) go through `src/lib/admin.functions.ts` server functions that verify admin before using the service client.
- Phone sign-in: SMS uses built-in phone OTP (provider set in Cloud auth settings); WhatsApp OTP uses server functions in `src/lib/whatsapp-otp.functions.ts` (hashed codes in service-only `whatsapp_otps`, Meta creds in env), which mint a session via admin magic-link token only after the code is verified.
- Images go to the private `media` bucket under `<user_id>/` and are stored as long-lived signed URLs (public buckets are blocked by workspace policy).
- Industrial listings live in `properties` with `category` = industrial | mall (zone/activity/malls lookup tables are admin-editable); residential fetchers must filter `category = residential`. Why: reuses review, broker limits and RLS without touching existing rows.
- Notifications are created only by SECURITY DEFINER DB triggers (notify_user/notify_admins); clients may only read, mark is_read, or delete their own rows. Why: prevents spoofed notifications.
- WhatsApp copies of notifications are sent by the cron-authenticated /api/public/notifications/whatsapp-dispatch route from notifications.whatsapp_status='pending', honoring notification_preferences. Why: keeps DB triggers fast and retry-safe.
- Native mobile apps use Capacitor loading the published site via server.url (`capacitor.config.ts`, offline page in `mobile-shell/`); native-only behavior lives in `src/lib/native-links.ts` behind `Capacitor.isNativePlatform()`. Why: site updates reach the app without store releases while the website stays unaffected.
- Detail pages (properties, industrial, brokers, malls) load data in the route loader via queryClient.ensureQueryData and build head() with src/lib/seo.ts; /sitemap.xml queries only public rows. Why: search engines get real titles and content in server HTML without duplicate queries.
- Phone sign-in resolves the original account via `decideLogin` (src/lib/broker-login.ts) over service-only `brokers_by_phone`/`auth_user_ids_by_phone` (normalized with `normalize_phone`); any ambiguity stops sign-in, suspension is `brokers.suspended_at`, office vs individual is `brokers.account_type`, and login phone changes only via a verified code. Why: never guess or duplicate accounts, and keep account type independent of the plan.
- WhatsApp inbound events arrive at /api/public/whatsapp/webhook (Meta-signed, verified with X-Hub-Signature-256) and are stored once in service-only whatsapp_webhook_events keyed by event_key. Why: dedupes Meta retries and stays separate from OTP/dispatch code.

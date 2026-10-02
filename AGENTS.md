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

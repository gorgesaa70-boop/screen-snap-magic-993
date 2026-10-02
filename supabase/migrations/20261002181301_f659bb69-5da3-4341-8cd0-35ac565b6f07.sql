create table public.whatsapp_otps (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index whatsapp_otps_phone_idx on public.whatsapp_otps (phone, created_at desc);
create index whatsapp_otps_ip_idx on public.whatsapp_otps (ip_hash, created_at desc);
grant all on public.whatsapp_otps to service_role;
alter table public.whatsapp_otps enable row level security;
-- no policies: only the server (service role) can read/write codes

create or replace function public.auth_user_id_by_phone(_phone text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where phone = _phone limit 1
$$;
revoke all on function public.auth_user_id_by_phone(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_phone(text) to service_role;

alter table public.auth_events drop constraint auth_events_event_check;
alter table public.auth_events add constraint auth_events_event_check check (event = any (array[
 'otp_requested','otp_resent','otp_verified','otp_failed','otp_locked','signed_out','phone_change_requested','phone_changed','join_requested',
 'wa_otp_sent','wa_otp_send_failed','wa_otp_verified','wa_otp_failed','wa_otp_locked','wa_otp_rate_limited']));
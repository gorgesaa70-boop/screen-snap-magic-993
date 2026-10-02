create table public.auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event text not null check (event in ('otp_requested','otp_resent','otp_verified','otp_failed','otp_locked','signed_out','phone_change_requested','phone_changed','join_requested')),
  phone_masked text check (char_length(phone_masked) <= 20),
  detail text check (char_length(detail) <= 200),
  created_at timestamptz not null default now()
);
create index on public.auth_events (created_at desc);
grant insert on public.auth_events to anon;
grant select, insert on public.auth_events to authenticated;
grant all on public.auth_events to service_role;
alter table public.auth_events enable row level security;
create policy "log own events" on public.auth_events for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
create policy "admin reads events" on public.auth_events for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- New users can submit a join request as an inactive broker profile (activated by admin)
create policy "user requests to join" on public.brokers for insert to authenticated
  with check (user_id = auth.uid() and is_active = false and is_demo = false and plan_id is null);
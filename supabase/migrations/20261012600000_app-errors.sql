-- Item 37: free error tracking. Website (browser) and server errors are grouped by fingerprint per day,
-- counted, kept 30 days, and readable by admins only. Plus the date of the last data backup download.

create table public.app_errors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  day date not null default (now() at time zone 'Africa/Cairo')::date,
  kind text not null check (kind in ('client','server')),
  message text not null check (char_length(message) <= 500),
  stack text check (stack is null or char_length(stack) <= 4000),
  path text check (path is null or char_length(path) <= 300),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  user_id uuid,
  count integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (fingerprint, day)
);
create index on public.app_errors (last_seen desc);
grant select, delete on public.app_errors to authenticated;
grant all on public.app_errors to service_role;
alter table public.app_errors enable row level security;
create policy "admins read errors" on public.app_errors for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admins clear errors" on public.app_errors for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Anyone (even visitors) can report an error, but only through this function: trimmed, grouped, and capped
-- at 300 distinct errors a day so a bad page or a bot can't flood the table.
create or replace function public.log_app_error(_kind text, _message text, _stack text, _path text, _ua text)
returns void language plpgsql security definer set search_path = public as $$
declare
  k text := case when _kind = 'server' and coalesce(auth.role(), '') = 'service_role' then 'server' else 'client' end;
  msg text := left(coalesce(nullif(trim(_message), ''), 'خطأ غير معروف'), 500);
  pth text := left(regexp_replace(coalesce(_path, ''), '[?#].*$', ''), 300);
  fp text := md5(k || '|' || msg || '|' || coalesce(split_part(coalesce(_stack, ''), E'\n', 2), '') || '|' || regexp_replace(pth, '[0-9a-f-]{36}', ':id', 'g'));
  today date := (now() at time zone 'Africa/Cairo')::date;
begin
  update public.app_errors set count = count + 1, last_seen = now() where fingerprint = fp and day = today;
  if found then return; end if;
  if (select count(*) from public.app_errors where day = today) >= 300 then return; end if;
  insert into public.app_errors (fingerprint, day, kind, message, stack, path, user_agent, user_id)
  values (fp, today, k, msg, left(_stack, 4000), nullif(pth, ''), left(_ua, 300), auth.uid())
  on conflict (fingerprint, day) do update set count = public.app_errors.count + 1, last_seen = now();
  -- Housekeeping: keep 30 days.
  delete from public.app_errors where day < today - 30;
end $$;
revoke execute on function public.log_app_error(text, text, text, text, text) from public;
grant execute on function public.log_app_error(text, text, text, text, text) to anon, authenticated, service_role;

-- Backups: when an admin last downloaded a full copy of the data (shown in the admin panel).
alter table public.app_settings add column if not exists last_backup_at timestamptz;

-- Store links for the mobile app, edited by admins from the dashboard (no code change needed).
-- Empty link = the app is not published on that store yet; the site then shows "coming soon".
create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  ios_url text check (ios_url is null or ios_url ~ '^https://apps\.apple\.com/'),
  android_url text check (android_url is null or android_url ~ '^https://play\.google\.com/store/apps/'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.app_settings (id) values (1);
grant select on public.app_settings to anon, authenticated;
grant update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "app settings public read" on public.app_settings for select to anon, authenticated using (true);
create policy "admin updates app settings" on public.app_settings for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.app_settings_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.id := 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
revoke execute on function public.app_settings_touch() from public, anon, authenticated;
create trigger app_settings_touch before update on public.app_settings for each row execute function public.app_settings_touch();

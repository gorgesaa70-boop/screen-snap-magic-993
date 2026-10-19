-- «تعليمات المساعد»: what the admin tells the AI assistant (WhatsApp bot + the site's floating assistant).
-- * instructions: extra facts and tone (office hours, offers, FAQs, topics to avoid). The fixed safety rules stay in code.
-- * welcome: optional custom greeting (empty = the built-in one).
-- * floating: which floating button the public site shows — assistant (WhatsApp inside it), whatsapp, both, or none.
-- Admin-only table (one row); the server reads it with the service role. Additive only; re-runnable.

create table if not exists public.assistant_settings (
  id integer primary key default 1 check (id = 1),
  instructions text not null default '' check (char_length(instructions) <= 4000),
  welcome text not null default '' check (char_length(welcome) <= 600),
  floating text not null default 'assistant' check (floating in ('assistant', 'whatsapp', 'both', 'none')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.assistant_settings (id) values (1) on conflict (id) do nothing;

alter table public.assistant_settings enable row level security;
drop policy if exists "admin reads assistant settings" on public.assistant_settings;
create policy "admin reads assistant settings" on public.assistant_settings for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "admin updates assistant settings" on public.assistant_settings;
create policy "admin updates assistant settings" on public.assistant_settings for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
revoke all on public.assistant_settings from anon;
revoke insert, delete on public.assistant_settings from authenticated;
grant select, update on public.assistant_settings to authenticated;

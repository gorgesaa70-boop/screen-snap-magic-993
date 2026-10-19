-- Staff permissions, per employee and per section (phase 1).
-- * staff_permissions: one row per employee; perms = {"<section>": "view" | "edit", "leads_scope": "mine" | "all"}.
--   Sections are the admin tabs and staff pages (leads, wa_inbox, deals, commissions, review, svc_requests, …).
--   No row / missing section = hidden. Only the admin edits them; an employee reads their own.
-- * staff_can(section, 'view' | 'edit'): true for the admin; for staff, what the admin granted.
-- * my_permissions(): what the signed-in user may open (the admin gets {"*": "edit"}).
-- Phase 1 also enforces the sensitive areas in the database: customer leads (scope mine / all), commissions and
-- agreements (view only), deals (staff never create or change them), and the WhatsApp inbox.
-- Existing employees start with NO permissions until the admin grants them. Additive; re-runnable.

create table if not exists public.staff_permissions (
  user_id uuid primary key,
  perms jsonb not null default '{}'::jsonb check (jsonb_typeof(perms) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.staff_permissions enable row level security;
drop policy if exists "admin manages staff permissions" on public.staff_permissions;
create policy "admin manages staff permissions" on public.staff_permissions for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "staff reads own permissions" on public.staff_permissions;
create policy "staff reads own permissions" on public.staff_permissions for select to authenticated using (user_id = auth.uid());
revoke all on public.staff_permissions from anon;
grant select, insert, update, delete on public.staff_permissions to authenticated;

create or replace function public.staff_can(_section text, _need text default 'view')
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when public.has_role(auth.uid(), 'admin') then true
    when not public.is_staff() then false
    else coalesce((
      select case _need when 'edit' then p.perms ->> _section = 'edit' else p.perms ->> _section in ('view', 'edit') end
      from public.staff_permissions p where p.user_id = auth.uid()), false)
  end
$$;
revoke execute on function public.staff_can(text, text) from public, anon;
grant execute on function public.staff_can(text, text) to authenticated;

-- Leads: «all» or only the ones assigned to this employee.
create or replace function public.staff_leads_all()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin')
      or coalesce((select p.perms ->> 'leads_scope' = 'all' from public.staff_permissions p where p.user_id = auth.uid()), false)
$$;
revoke execute on function public.staff_leads_all() from public, anon;
grant execute on function public.staff_leads_all() to authenticated;

create or replace function public.my_permissions()
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then '{}'::jsonb
    when public.has_role(auth.uid(), 'admin') then '{"*": "edit", "leads_scope": "all"}'::jsonb
    when public.is_staff() then coalesce((select p.perms from public.staff_permissions p where p.user_id = auth.uid()), '{}'::jsonb)
    else '{}'::jsonb
  end
$$;
revoke execute on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;

-- Customer leads.
drop policy if exists "staff reads leads" on public.leads;
create policy "staff reads leads" on public.leads for select to authenticated
  using (public.staff_can('leads', 'view') and (public.staff_leads_all() or assigned_staff_id = auth.uid()));
drop policy if exists "staff updates leads" on public.leads;
create policy "staff updates leads" on public.leads for update to authenticated
  using (public.staff_can('leads', 'edit') and (public.staff_leads_all() or assigned_staff_id = auth.uid()))
  with check (public.staff_can('leads', 'edit') and (public.staff_leads_all() or assigned_staff_id = auth.uid()));

-- Money: staff may only look, and only when granted.
drop policy if exists "staff reads commissions" on public.commissions;
create policy "staff reads commissions" on public.commissions for select to authenticated using (public.staff_can('commissions', 'view'));
drop policy if exists "staff reads agreements" on public.company_agreements;
create policy "staff reads agreements" on public.company_agreements for select to authenticated using (public.staff_can('commissions', 'view'));

drop policy if exists "staff reads deals" on public.deals;
create policy "staff reads deals" on public.deals for select to authenticated using (public.staff_can('deals', 'view'));
-- An employee who is ALSO a broker / company (one account, both roles) still works on their own company's deals.
drop policy if exists "staff never writes deals" on public.deals;
create policy "staff never writes deals" on public.deals as restrictive for insert to authenticated
  with check (not public.is_staff() or public.has_role(auth.uid(), 'admin') or broker_id = public.current_broker_id());
drop policy if exists "staff never changes deals" on public.deals;
create policy "staff never changes deals" on public.deals as restrictive for update to authenticated
  using (not public.is_staff() or public.has_role(auth.uid(), 'admin') or broker_id = public.current_broker_id());
drop policy if exists "staff never deletes deals" on public.deals;
create policy "staff never deletes deals" on public.deals as restrictive for delete to authenticated
  using (not public.is_staff() or public.has_role(auth.uid(), 'admin') or broker_id = public.current_broker_id());
-- Staff without the deals permission don't see them through a visible lead either (their own company's still show).
drop policy if exists "staff sees deals only when granted" on public.deals;
create policy "staff sees deals only when granted" on public.deals as restrictive for select to authenticated
  using (not public.is_staff() or public.staff_can('deals', 'view') or broker_id = public.current_broker_id());

-- WhatsApp inbox (release 36), only when that table exists.
do $$
begin
  if to_regclass('public.wa_conversations') is not null then
    execute 'drop policy if exists "team reads wa conversations" on public.wa_conversations';
    execute 'create policy "team reads wa conversations" on public.wa_conversations for select to authenticated using (public.staff_can(''wa_inbox'', ''view''))';
    execute 'drop policy if exists "team reads wa messages" on public.wa_messages';
    execute 'create policy "team reads wa messages" on public.wa_messages for select to authenticated using (public.staff_can(''wa_inbox'', ''view''))';
    execute $f$
      create or replace function public.wa_mark_read(_phone text)
      returns void language plpgsql security definer set search_path = public as $b$
      begin
        if not public.staff_can('wa_inbox', 'view') then raise exception 'not allowed' using errcode = '42501'; end if;
        update public.wa_conversations set unread = 0 where phone = _phone;
      end $b$;
    $f$;
  end if;
end $$;

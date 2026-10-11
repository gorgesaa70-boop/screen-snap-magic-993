-- Item 20: general audit log for sensitive changes. Append-only: written only by triggers,
-- readable by admins, never updated or deleted (no grants, no policies for writes).

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_label text,
  table_name text not null,
  row_id text,
  action text not null check (action in ('insert','update','delete')),
  changes jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id, at desc);
create index audit_log_actor_idx on public.audit_log (actor, at desc);
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "admins read the audit log" on public.audit_log for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Who did it, in words, captured at the time (names can change later).
create or replace function public.actor_label()
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then case when coalesce(auth.role(), '') = 'service_role' then 'النظام' else 'زائر' end
    when public.has_role(auth.uid(), 'admin') then 'أدمن'
    when public.is_staff() then 'موظف فاليو عقار'
    else coalesce(
      (select 'صاحب حساب: ' || name from public.brokers where user_id = auth.uid() limit 1),
      (select 'فريق: ' || m.member_name || ' (' || b.name || ')' from public.my_membership() m join public.brokers b on b.id = m.company_id limit 1),
      'مستخدم')
  end
$$;
revoke execute on function public.actor_label() from public, anon, authenticated;

-- Generic row audit: inserts and deletes keep the row, updates keep only changed columns as [old, new].
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; diff jsonb := '{}'::jsonb; k text;
  ignore text[] := array['updated_at','stage_changed_at','phone_norm'];
begin
  if tg_op = 'INSERT' then
    n := to_jsonb(new);
    insert into public.audit_log (actor, actor_label, table_name, row_id, action, changes)
    values (auth.uid(), public.actor_label(), tg_table_name, n->>'id', 'insert', n - ignore);
    return new;
  elsif tg_op = 'DELETE' then
    o := to_jsonb(old);
    insert into public.audit_log (actor, actor_label, table_name, row_id, action, changes)
    values (auth.uid(), public.actor_label(), tg_table_name, o->>'id', 'delete', o - ignore);
    return old;
  end if;
  o := to_jsonb(old); n := to_jsonb(new);
  for k in select jsonb_object_keys(n) loop
    if not (k = any(ignore)) and (o->k) is distinct from (n->k) then
      diff := diff || jsonb_build_object(k, jsonb_build_array(o->k, n->k));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.audit_log (actor, actor_label, table_name, row_id, action, changes)
    values (auth.uid(), public.actor_label(), tg_table_name, n->>'id', 'update', diff);
  end if;
  return new;
end $$;
revoke execute on function public.audit_row() from public, anon, authenticated;

-- Sensitive tables: accounts and roles, teams, leads, deals and documents, money, agreements, settings, listings review.
do $$
declare t text;
begin
  foreach t in array array['brokers','user_roles','company_members','leads','deals','deal_documents','commissions',
                           'commission_payments','company_agreements','app_settings','plans','subscriptions','properties','projects']
  loop
    execute format('drop trigger if exists zz_audit on public.%I', t);
    execute format('create trigger zz_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

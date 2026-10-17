-- Deleting an account from the admin removes the broker / company / developer itself, not only its login.
-- * admin_delete_broker(id): for an account without a login (the login is removed first by deleteAccountAsAdmin).
--   With money records (deals, agreements, commissions, referrals, payments) the row stays for the records but is
--   anonymised and marked deleted_at, so it leaves every list; otherwise it is deleted with its listings.
-- Additive only; re-runnable.

alter table public.brokers add column if not exists deleted_at timestamptz;

create or replace function public.admin_delete_broker(_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  b public.brokers%rowtype;
  keep boolean;
  r text;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'الحذف للإدارة بس' using errcode = '42501';
  end if;
  select * into b from public.brokers where id = _id;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if b.user_id is not null then
    raise exception 'login_first: امسح تسجيل الدخول الأول' using errcode = 'P0001';
  end if;

  keep := exists (select 1 from public.deals where broker_id = _id)
    or exists (select 1 from public.company_agreements where broker_id = _id)
    or exists (select 1 from public.referrals where referrer_id = _id or owner_id = _id)
    or exists (select 1 from public.payments where broker_id = _id);

  if keep then
    -- Kept for the money records only: off the site and out of every list, contact details cleared.
    update public.properties set review_status = 'draft', review_note = 'الحساب اتمسح من الإدارة' where broker_id = _id;
    update public.brokers set deleted_at = now(), is_active = false, suspended_at = coalesce(suspended_at, now()),
      phone = null, whatsapp = null, email = null, review_note = 'الحساب اتمسح من الإدارة'
    where id = _id;
    update public.company_members set is_active = false where company_id = _id;
    r := 'hidden';
  else
    perform public.admin_drop_property(p.id) from public.properties p where p.broker_id = _id;
    delete from public.brokers where id = _id;
    r := 'deleted';
  end if;

  insert into public.audit_log (actor, actor_label, table_name, row_id, action, changes)
  values (auth.uid(), 'admin_delete', 'broker', _id::text, case when r = 'deleted' then 'delete' else 'update' end,
          jsonb_build_object('result', r, 'name', b.name));
  return r;
end $$;
revoke execute on function public.admin_delete_broker(uuid) from public, anon;
grant execute on function public.admin_delete_broker(uuid) to authenticated;

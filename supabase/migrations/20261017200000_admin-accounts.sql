-- Release 26: the admin sees every login (brokers, companies, developers, owners, customers, service providers, staff)
-- with its details, can stop or delete any account except an admin's, and the search engine button sends only new pages.
-- * admin_accounts(): one row per login with roles, linked company / provider and counts.
-- * prepare_account_deletion(_uid, _by): also used when the admin deletes. The login and its e-mail go away (so the same
--   e-mail can sign up again); listings are removed, except ones with customers / deals / payments / referrals, which
--   are taken off the site and kept for the records.
-- Tables from releases 20–24 are touched only if they exist, so this runs before or after them.

-- 1) Every login for the admin.
create or replace function public.admin_accounts()
returns table (
  user_id uuid, email text, phone text, full_name text, created_at timestamptz, last_sign_in_at timestamptz,
  banned_until timestamptz, roles text[], broker_id uuid, broker_name text, account_type text, broker_active boolean,
  provider_id uuid, provider_name text, provider_status text, member_of text, listings integer, owner_listings integer,
  requests integer, favorites integer
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'غير مصرح لك' using errcode = '42501'; end if;
  return query
  select u.id, u.email::text, u.phone::text,
    coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')::text,
    u.created_at, u.last_sign_in_at, u.banned_until,
    coalesce((select array_agg(r.role::text order by r.role::text) from public.user_roles r where r.user_id = u.id), '{}'),
    b.id, b.name, b.account_type, b.is_active,
    sp.id, sp.name, sp.status,
    (select c.name from public.company_members m join public.brokers c on c.id = m.company_id
      where m.is_active and u.phone is not null and public.normalize_phone(m.phone) = public.normalize_phone(u.phone) limit 1),
    (select count(*)::int from public.properties p where b.id is not null and p.broker_id = b.id),
    (select count(*)::int from public.properties p join public.leads l on l.id = p.owner_lead_id
      where p.broker_id is null and u.phone is not null and l.phone_norm = public.normalize_phone(u.phone)),
    (select count(*)::int from public.leads l where l.customer_id = u.id),
    (select count(*)::int from public.favorites f where f.user_id = u.id)
  from auth.users u
  left join lateral (select * from public.brokers x where x.user_id = u.id order by x.created_at limit 1) b on true
  left join lateral (select * from public.service_providers y where y.user_id = u.id order by y.created_at limit 1) sp on true
  order by u.created_at desc;
end $$;
revoke execute on function public.admin_accounts() from public, anon;
grant execute on function public.admin_accounts() to authenticated;

-- 2) Removing an account's data before its login is deleted (by the person, or by an admin when _by is set).
drop function if exists public.prepare_account_deletion(uuid);
create or replace function public.prepare_account_deletion(_uid uuid, _by uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare ph text := (select public.normalize_phone(u.phone) from auth.users u where u.id = _uid);
  who text := (select coalesce(u.email, '+' || u.phone) from auth.users u where u.id = _uid);
  hidden integer := 0; removed integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service only' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users where id = _uid) then return 'missing'; end if;
  -- The platform must always keep an admin: an admin removes their own role (another admin does it) first.
  if public.has_role(_uid, 'admin') then return 'admin'; end if;

  -- Listings: those with customers, deals, payments or referrals stay in the records but leave the site; the rest go.
  -- (Hidden ones become drafts: off the site, and no "listing rejected" notifications.)
  create temp table if not exists _gone_props (id uuid primary key, keep boolean not null) on commit drop;
  delete from _gone_props;
  insert into _gone_props
  select p.id,
    exists (select 1 from public.leads l where l.property_id = p.id)
    or exists (select 1 from public.deals d where d.property_id = p.id)
    or exists (select 1 from public.payments y where y.property_id = p.id)
  from public.properties p
  where p.broker_id in (select id from public.brokers where user_id = _uid)
     or (p.broker_id is null and ph is not null and p.owner_lead_id in (select l.id from public.leads l where l.phone_norm = ph))
  on conflict do nothing;
  if to_regclass('public.referrals') is not null then
    execute 'update _gone_props g set keep = true where exists (select 1 from public.referrals r where r.property_id = g.id)';
  end if;
  update public.properties p set review_status = 'draft', review_note = 'الحساب اتمسح'
  where p.id in (select id from _gone_props where keep);
  get diagnostics hidden = row_count;
  delete from public.properties p where p.id in (select id from _gone_props where not keep);
  get diagnostics removed = row_count;

  delete from public.favorites where user_id = _uid;
  delete from public.saved_searches where user_id = _uid;
  delete from public.investor_profiles where user_id = _uid;
  delete from public.notifications where user_id = _uid;
  delete from public.notification_preferences where user_id = _uid;
  delete from public.investment_requests where investor_id = _uid and status = 'pending';
  delete from public.compound_members where staff_user_id = _uid;
  update public.leads set customer_id = null where customer_id = _uid;
  update public.service_requests set customer_id = null where customer_id = _uid;
  update public.service_providers set status = 'suspended', user_id = null, review_note = 'الحساب اتمسح' where user_id = _uid;
  if to_regclass('public.lead_message_reads') is not null then
    execute 'delete from public.lead_message_reads where user_id = $1' using _uid;
  end if;
  if to_regclass('public.push_subscriptions') is not null then
    execute 'delete from public.push_subscriptions where user_id = $1' using _uid;
  end if;

  -- A broker / company account: hidden from the site, contact details cleared (kept for past deals and commissions).
  update public.brokers set is_active = false, suspended_at = coalesce(suspended_at, now()), user_id = null,
    phone = null, whatsapp = null, email = null,
    review_note = case when _by is null then 'الحساب اتمسح بطلب صاحبه' else 'الحساب اتمسح من الإدارة' end
  where user_id = _uid;
  -- A team member: removed from the company's team.
  if ph is not null then
    update public.company_members set is_active = false where public.normalize_phone(phone) = ph;
  end if;
  delete from public.user_roles where user_id = _uid;

  insert into public.audit_log (actor, actor_label, table_name, row_id, action, changes)
  values (_by, case when _by is null then 'صاحب الحساب' else 'الأدمن' end, 'accounts', _uid::text, 'delete',
    jsonb_build_object('account', who, 'listings_removed', removed, 'listings_hidden', hidden));
  if _by is null then
    perform public.notify_admins('admin', 'حساب اتمسح بطلب صاحبه', 'بيانات الحساب الشخصية اتمسحت من المنصة.', null, '/admin');
  end if;
  return 'ok';
end $$;
revoke execute on function public.prepare_account_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid, uuid) to service_role;

-- 3) Search engines: remember the last successful send, so the button only sends pages changed since then.
alter table public.app_settings add column if not exists indexnow_sent_at timestamptz;

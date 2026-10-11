-- Account deletion (Apple App Store 5.1.1(v), Google Play account-deletion policy): a user can delete their account
-- from inside the app. This function removes / unlinks the user's personal data; the server function then deletes
-- the login itself. Business records other people rely on (requests already sent to a company, deals, commissions,
-- audit log) are kept without the personal link, as the privacy policy says.
create or replace function public.prepare_account_deletion(_uid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare ph text := (select public.normalize_phone(u.phone) from auth.users u where u.id = _uid);
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service only' using errcode = '42501'; end if;
  -- The platform must always keep an admin: an admin removes their own role (another admin does it) first.
  if public.has_role(_uid, 'admin') then return 'admin'; end if;

  delete from public.favorites where user_id = _uid;
  delete from public.saved_searches where user_id = _uid;
  delete from public.investor_profiles where user_id = _uid;
  delete from public.notifications where user_id = _uid;
  delete from public.notification_preferences where user_id = _uid;
  delete from public.investment_requests where investor_id = _uid and status = 'pending';
  update public.leads set customer_id = null where customer_id = _uid;

  -- A broker / company account: hidden from the site (its listings follow), contact details cleared.
  update public.brokers set is_active = false, suspended_at = coalesce(suspended_at, now()), user_id = null,
    phone = null, whatsapp = null, email = null, review_note = 'الحساب اتمسح بطلب صاحبه'
  where user_id = _uid;
  -- A team member: removed from the company's team.
  if ph is not null then
    update public.company_members set is_active = false where public.normalize_phone(phone) = ph;
  end if;
  delete from public.user_roles where user_id = _uid;

  perform public.notify_admins('admin', 'حساب اتمسح بطلب صاحبه', 'بيانات الحساب الشخصية اتمسحت من المنصة.', null, '/admin');
  return 'ok';
end $$;
revoke execute on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

-- فاليو عقار — إصدار 30: حالة الوحدة (متاحة / محجوزة / مباعة) + حذف من الأدمن لكل حاجة بقواعد آمنة.
-- * properties.availability: صاحب الحساب أو المدير أو الأدمن يغيّرها، ومش بترجّع الإعلان للمراجعة.
-- * admin_delete(): الأدمن يمسح عقار، مول (ينقل وحداته أو يمسحها)، مشروع، فرصة، عميل، طلب خدمة، مقدم خدمة، باقة، منطقة.
--   اللي عليه صفقة أو عمولة مش بيتمسح: بيتخفى أو بيتوقف. كل حذف بيتسجل في سجل التدقيق.
-- مرة واحدة، كله أو مفيش. لو اتشغل تاني بالغلط مفيش ضرر. لازم يتنفذ **بعد** إصدار 25 (المناطق والمراجعة).
--   20261017600000_manage-everything.sql

begin;
-- Manage everything: availability of listings / mall units, and one admin delete with safe rules.
-- 1) properties.availability: available | reserved | sold (set by the listing's owner/manager or the admin).
--    Reserved and sold listings stay on the site with a badge; «متاحة» counts only available ones.
-- 2) admin_delete(kind, id, target): the admin deletes anything from the dashboard. Anything tied to a deal or a
--    commission is never deleted: it is hidden / deactivated instead, so the money records stay whole.
-- Additive only; re-runnable.

-- 1) Availability.
alter table public.properties add column if not exists availability text not null default 'available';
alter table public.properties drop constraint if exists properties_availability_check;
alter table public.properties add constraint properties_availability_check check (availability in ('available', 'reserved', 'sold'));
alter table public.properties add column if not exists availability_at timestamptz;

create or replace function public.properties_availability_stamp()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.availability is distinct from old.availability then
    new.availability_at := case when new.availability = 'available' then null else now() end;
  end if;
  return new;
end $$;
revoke execute on function public.properties_availability_stamp() from public, anon, authenticated;
drop trigger if exists properties_availability_stamp on public.properties;
create trigger properties_availability_stamp before insert or update of availability on public.properties
  for each row execute function public.properties_availability_stamp();

-- Marking a listing reserved / sold is not a content change: it doesn't send an approved listing back to review.
create or replace function public.properties_review_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare skip text[] := array['review_status','review_note','updated_at','created_at','listed_until','listing_notice','hidden_by_plan',
  'is_featured','featured_until','is_highlight','highlight_reason','highlight_yield','highlight_requested_at',
  'verified_at','verified_note','co_broke_share','activity_id','availability','availability_at'];
begin
  if public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    return new;
  end if;
  if new.review_status = 'draft' then return new; end if;
  if tg_op = 'INSERT' then
    new.review_status := 'pending';
  elsif old.review_status = 'approved' and (to_jsonb(new) - skip) = (to_jsonb(old) - skip) then
    new.review_status := 'approved';
  else
    new.review_status := 'pending';
  end if;
  return new;
end $$;
revoke execute on function public.properties_review_guard() from public, anon, authenticated;
drop trigger if exists properties_guard_review on public.properties;
create trigger properties_guard_review before insert or update on public.properties for each row execute function public.properties_review_guard();

-- 2) Admin delete.
-- A listing tied to a deal (directly, or through a customer request on it) is hidden, never deleted.
create or replace function public.admin_drop_property(_id uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.deals d where d.property_id = _id)
     or exists (select 1 from public.leads l join public.deals d on d.lead_id = l.id where l.property_id = _id) then
    update public.properties set review_status = 'rejected', review_note = 'اتشال بواسطة الإدارة (عليه صفقة)' where id = _id;
    return 'hidden';
  end if;
  delete from public.properties where id = _id;
  return 'deleted';
end $$;
revoke execute on function public.admin_drop_property(uuid) from public, anon, authenticated;

create or replace function public.admin_delete(_kind text, _id uuid, _target uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  r text;
  label text;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'الحذف للإدارة بس' using errcode = '42501';
  end if;

  if _kind = 'property' then
    if not exists (select 1 from public.properties where id = _id) then raise exception 'not found' using errcode = 'P0002'; end if;
    r := public.admin_drop_property(_id);

  elsif _kind = 'mall' then
    select name into label from public.malls where id = _id;
    if label is null then raise exception 'not found' using errcode = 'P0002'; end if;
    if _target is not null then
      if _target = _id or not exists (select 1 from public.malls where id = _target) then
        raise exception 'المول اللي هتنقل له الوحدات مش موجود' using errcode = '22023';
      end if;
      update public.properties set mall_id = _target, area = (select name from public.malls where id = _target) where mall_id = _id;
    else
      perform public.admin_drop_property(p.id) from public.properties p where p.mall_id = _id;
    end if;
    delete from public.malls where id = _id;
    r := 'deleted';

  elsif _kind = 'project' then
    if not exists (select 1 from public.projects where id = _id) then raise exception 'not found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.leads l join public.deals d on d.lead_id = l.id where l.project_id = _id) then
      update public.projects set review_status = 'rejected', review_note = 'اتشال بواسطة الإدارة (عليه صفقة)' where id = _id;
      r := 'hidden';
    else
      delete from public.projects where id = _id;
      r := 'deleted';
    end if;

  elsif _kind = 'opportunity' then
    if not exists (select 1 from public.investment_opportunities where id = _id) then raise exception 'not found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.leads l join public.deals d on d.lead_id = l.id where l.opportunity_id = _id) then
      update public.investment_opportunities set review_status = 'closed' where id = _id;
      r := 'hidden';
    else
      delete from public.investment_opportunities where id = _id;
      r := 'deleted';
    end if;

  elsif _kind = 'lead' then
    if not exists (select 1 from public.leads where id = _id) then raise exception 'not found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.deals where lead_id = _id) then
      raise exception 'العميل ده عليه صفقة — مينفعش يتمسح عشان سجل العمولات. اقفله بدل كده.' using errcode = 'P0001';
    end if;
    -- A customer's owner listing keeps its property (the link is cleared by the foreign key).
    delete from public.leads where id = _id;
    r := 'deleted';

  elsif _kind = 'service_request' then
    delete from public.service_requests where id = _id;
    if not found then raise exception 'not found' using errcode = 'P0002'; end if;
    r := 'deleted';

  elsif _kind = 'service_provider' then
    if not exists (select 1 from public.service_providers where id = _id) then raise exception 'not found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.service_requests where _id in (assigned_provider_id, offer_provider_id, target_provider_id))
       or exists (select 1 from public.service_subscriptions where provider_id = _id) then
      update public.service_providers set status = 'suspended' where id = _id;
      r := 'deactivated';
    else
      delete from public.service_providers where id = _id;
      r := 'deleted';
    end if;

  elsif _kind = 'service_plan' then
    if not exists (select 1 from public.service_plans where id = _id) then raise exception 'not found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.service_subscriptions where plan_id = _id) then
      update public.service_plans set is_active = false where id = _id;
      r := 'deactivated';
    else
      delete from public.service_plans where id = _id;
      r := 'deleted';
    end if;

  elsif _kind = 'location' then
    delete from public.locations where id = _id;
    if not found then raise exception 'not found' using errcode = 'P0002'; end if;
    r := 'deleted';

  else
    raise exception 'unknown kind %', _kind using errcode = '22023';
  end if;

  insert into public.audit_log (actor, actor_label, table_name, row_id, action, changes)
  values (auth.uid(), 'admin_delete', _kind, _id::text, case when r = 'deleted' then 'delete' else 'update' end,
          jsonb_build_object('result', r) || case when _target is not null then jsonb_build_object('moved_to', _target) else '{}'::jsonb end);
  return r;
end $$;
revoke execute on function public.admin_delete(text, uuid, uuid) from public, anon;
grant execute on function public.admin_delete(text, uuid, uuid) to authenticated;
commit;

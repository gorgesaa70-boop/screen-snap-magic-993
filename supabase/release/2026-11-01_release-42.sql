-- فاليو عقار — إصدار 42: الحساب المعفي من الباقات مالوش حد إعلانات.
-- * الحساب المعفي ينزّل إعلانات جديدة ويجدّدها من غير «وصلت لحد باقتك».
-- * باقي الحسابات على حدود باقاتها زي ما هي.
-- إضافة بس، مفيش بيانات بتتمسح. ينفع يتشغل تاني. بعد إصدار 41.
--   20261101200000_exempt-no-limit.sql

begin;
-- Accounts exempt from plans (and demo accounts) have no listing limit (release 42):
-- * Putting up a new listing (or sending a draft) no longer stops at the plan's «وصلت لحد باقتك».
-- * Renewing a listing doesn't count against the limit either.
-- Everyone else keeps their plan's limits. Additive only; re-runnable. After release 41.

create or replace function public.broker_unlimited(_broker uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select b.plan_exempt or b.is_demo from public.brokers b where b.id = _broker), false)
$$;
revoke execute on function public.broker_unlimited(uuid) from public, anon, authenticated;

-- Same as release 40 (plan perks), plus: no limit for exempt / demo accounts.
create or replace function public.properties_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim integer;
begin
  if public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null
     or coalesce(current_setting('va.plan_sync', true), '') = '1' then
    new.updated_at := now();
    return new;
  end if;
  if public.current_member_role() in ('sales','broker') then
    raise exception 'صلاحيتك في الشركة لا تسمح بإدارة العقارات' using errcode = '42501';
  end if;
  new.is_featured := coalesce(case when tg_op = 'UPDATE' then old.is_featured end, false);
  new.featured_until := case when tg_op = 'UPDATE' then old.featured_until end;
  new.is_demo := false;
  new.owner_lead_id := case when tg_op = 'UPDATE' then old.owner_lead_id end;
  if new.review_status <> 'draft' then
    if tg_op = 'UPDATE' and old.review_status = 'rejected' then
      new.review_status := 'pending';
    else
      new.review_status := 'approved';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.broker_id := old.broker_id;
    new.review_note := old.review_note;
  end if;
  if new.review_status <> 'draft' and (tg_op = 'INSERT' or old.review_status = 'draft') and not public.broker_unlimited(new.broker_id) then
    select bp.max_properties into lim from public.broker_plan(new.broker_id) bp;
    if public.live_listings_of_broker(new.broker_id) >= coalesce(lim, 2) then
      raise exception 'وصلت لحد باقتك (% إعلان ظاهر في نفس الوقت). جدّد أو احذف إعلان قديم، أو اطلب باقة أكبر من «باقتي».', coalesce(lim, 2) using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.properties_guard() from public, anon, authenticated;


-- Same as release 40, plus: renewing a listing of an exempt / demo account doesn't count against a limit.
create or replace function public.renew_listing(_property uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare p public.properties; ph text; mine boolean; days integer; lim integer; res timestamptz;
begin
  select * into p from public.properties where id = _property;
  if p.id is null then raise exception 'الإعلان مش موجود' using errcode = 'P0001'; end if;
  if p.broker_id is not null then
    mine := p.broker_id = public.current_broker_id() and public.current_member_role() in ('owner','manager');
    select bp.listing_days, bp.max_properties into days, lim from public.broker_plan(p.broker_id) bp;
  else
    select l.phone_norm into ph from public.leads l where l.id = p.owner_lead_id;
    mine := ph is not null and ph = public.my_phone();
    select op.listing_days, op.max_properties into days, lim from public.owner_plan(ph) op;
  end if;
  if not (coalesce(mine, false) or public.has_role(auth.uid(), 'admin')) then
    raise exception 'مش من حقك تجدّد الإعلان ده' using errcode = '42501';
  end if;
  if days is null then raise exception 'إعلاناتك بتفضل ظاهرة طول مدة باقتك. جدّد الباقة نفسها من «باقتي»' using errcode = 'P0001'; end if;
  if p.review_status <> 'approved' then raise exception 'الإعلان لازم يكون معتمد عشان يتجدّد' using errcode = 'P0001'; end if;
  if p.hidden_by_plan then raise exception 'الإعلان ده مخفي لحد ما تجدّد باقتك' using errcode = 'P0001'; end if;
  if p.listed_until is null then raise exception 'الإعلان ده ظاهر من غير مدة' using errcode = 'P0001'; end if;
  if p.listed_until > now() + interval '7 days' then
    raise exception 'التجديد بيفتح في آخر أسبوع من مدة الإعلان (بيخلص %)', to_char(p.listed_until at time zone 'Africa/Cairo', 'YYYY-MM-DD') using errcode = 'P0001';
  end if;
  if p.listed_until <= now() and not (p.broker_id is not null and public.broker_unlimited(p.broker_id))
     and (case when p.broker_id is not null then public.live_listings_of_broker(p.broker_id) else public.live_listings_of_phone(ph) end) >= coalesce(lim, 2) then
    raise exception 'وصلت لحد باقتك (% إعلان ظاهر في نفس الوقت). اطلب باقة أكبر من «باقتي»، أو جدّد بعد ما إعلان تاني يخلص.', coalesce(lim, 2) using errcode = 'P0001';
  end if;
  res := greatest(now(), p.listed_until) + make_interval(days => days);
  perform set_config('va.listing_renew', '1', true);
  update public.properties set listed_until = res, listing_notice = 0 where id = _property;
  perform set_config('va.listing_renew', '', true);
  return res;
end $$;
revoke execute on function public.renew_listing(uuid) from public, anon;
grant execute on function public.renew_listing(uuid) to authenticated;
commit;

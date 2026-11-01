-- فاليو عقار — إصدار 41: حدود الباقات بتتطبق على طول.
-- * «معفي من الباقات» بيطلّع كل إعلانات الحساب اللي كانت مستخبية بسبب حد الباقة، والحد مايتطبقش عليه.
-- * تغيير «عدد الإعلانات» في باقة بيتطبق على طول على كل الحسابات اللي عليها (زيادة = الإعلانات المستخبية ترجع).
-- إضافة بس، مفيش بيانات بتتمسح. ينفع يتشغل تاني. بعد إصدار 40.
--   20261101100000_plan-limit-resync.sql

begin;
-- Plan limits apply right away (release 41):
-- * Exempting an account from plans (admin → الباقات → «معفي من الباقات») brings back every listing that was hidden for
--   being over its plan's limit, and the limit no longer applies to it. Before this, exempt accounts kept them hidden.
-- * Changing a plan's listing limit («عدد الإعلانات») applies to every account on it: a higher limit brings hidden
--   listings back, a lower one hides the extra ones (featured, then newest stay up). Before this, only at renewal.
-- Additive only; re-runnable.

-- Same as release 40, plus: exempt / demo accounts get all their plan-hidden listings back and no limit.
create or replace function public.sync_broker_access(_broker uuid, _limit boolean default false)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare b public.brokers; acc timestamptz; grace int; lim int; live int;
begin
  select * into b from public.brokers where id = _broker;
  if b.id is null then return null; end if;
  select subscription_grace_days into grace from public.app_settings where id = 1;
  if b.plan_exempt or b.is_demo then
    acc := null;
  else
    select max(case when status = 'trial' then ends_at else ends_at + make_interval(days => coalesce(grace, 3)) end) into acc
    from public.subscriptions where broker_id = _broker and status in ('trial','active') and ends_at is not null;
    acc := coalesce(acc, now());
  end if;
  perform set_config('va.plan_sync', '1', true);
  update public.brokers set access_until = acc where id = _broker and access_until is distinct from acc;
  if _limit and (b.plan_exempt or b.is_demo) then
    update public.properties set hidden_by_plan = false where broker_id = _broker and hidden_by_plan;
  elsif _limit then
    select bp.max_properties into lim from public.broker_plan(_broker) bp;
    update public.properties set hidden_by_plan = true
    where id in (select id from public.properties where broker_id = _broker and not hidden_by_plan and review_status in ('approved','pending')
                 order by is_featured desc, updated_at desc offset coalesce(lim, 0));
    live := public.live_listings_of_broker(_broker);
    update public.properties set hidden_by_plan = false
    where id in (select id from public.properties where broker_id = _broker and hidden_by_plan
                 order by updated_at desc limit greatest(coalesce(lim, 0) - live, 0));
  end if;
  perform set_config('va.plan_sync', '', true);
  return acc;
end $$;
revoke execute on function public.sync_broker_access(uuid, boolean) from public, anon, authenticated;

-- Exempting an account (or ending the exemption) applies right away, listings included.
create or replace function public.brokers_exempt_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_broker_access(new.id, true);
  return null;
end $$;
revoke execute on function public.brokers_exempt_sync() from public, anon, authenticated;

-- A plan's new listing limit reaches every account on it.
create or replace function public.plans_limit_resync()
returns trigger language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  for b in select id from public.brokers where plan_id = new.id loop
    perform public.sync_broker_access(b, true);
  end loop;
  return null;
end $$;
revoke execute on function public.plans_limit_resync() from public, anon, authenticated;

drop trigger if exists plans_limit_resync on public.plans;
create trigger plans_limit_resync after update of max_properties on public.plans for each row
  when (old.max_properties is distinct from new.max_properties) execute function public.plans_limit_resync();
commit;

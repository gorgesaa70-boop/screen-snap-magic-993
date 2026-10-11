-- Property photo galleries, owner listings as pending properties, and instant publishing for active brokers.

alter table public.properties
  add column if not exists images text[] not null default '{}' check (cardinality(images) <= 12),
  add column if not exists owner_lead_id uuid references public.leads(id) on delete set null;
create index if not exists properties_owner_lead_idx on public.properties (owner_lead_id) where owner_lead_id is not null;

-- Keep existing single-image listings visible in galleries.
update public.properties set images = array[image_url] where image_url is not null and cardinality(images) = 0;

-- Brokers (only active ones reach here through RLS) publish immediately.
-- A listing the admin rejected goes back to review when the broker edits it.
-- Owner listings are created by the server (service_role) as 'pending' and approved by an admin.
create or replace function public.properties_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim integer; cnt integer;
begin
  if public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    new.updated_at := now();
    return new;
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
  if tg_op = 'INSERT' then
    select p.max_properties into lim from public.brokers b left join public.plans p on p.id = b.plan_id where b.id = new.broker_id;
    select count(*) into cnt from public.properties where broker_id = new.broker_id;
    if cnt >= coalesce(lim, 5) then raise exception 'تم الوصول للحد الأقصى من العقارات في باقتك (%)', coalesce(lim,5); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.properties_guard() from public, anon, authenticated;

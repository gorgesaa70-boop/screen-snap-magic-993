-- Mall photo gallery: up to 10 photos per mall, the first one is the cover (kept in logo_url for every existing page).
-- * Admins edit malls directly (existing policy). The mall's developer (account owner or manager) sets its photos
--   only through set_mall_images(), which changes nothing else on the mall.
-- Additive only; re-runnable.

alter table public.malls add column if not exists images text[] not null default '{}';
alter table public.malls drop constraint if exists malls_images_max;
alter table public.malls add constraint malls_images_max check (cardinality(images) <= 10);

-- Existing single photo becomes the first gallery photo.
update public.malls set images = array[logo_url] where logo_url is not null and cardinality(images) = 0;

create or replace function public.set_mall_images(_mall uuid, _images text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  imgs text[] := coalesce(_images, '{}');
begin
  if not (
    public.has_role(auth.uid(), 'admin')
    or (exists (select 1 from public.malls where id = _mall and developer_id is not null and developer_id = public.current_broker_id())
        and public.current_member_role() in ('owner', 'manager'))
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if cardinality(imgs) > 10 then raise exception 'max 10 photos' using errcode = '22023'; end if;
  if exists (select 1 from unnest(imgs) u where u !~ '^https://' or length(u) > 2000) then
    raise exception 'bad photo url' using errcode = '22023';
  end if;
  update public.malls set images = imgs, logo_url = imgs[1] where id = _mall;
end $$;
revoke execute on function public.set_mall_images(uuid, text[]) from public, anon;
grant execute on function public.set_mall_images(uuid, text[]) to authenticated;

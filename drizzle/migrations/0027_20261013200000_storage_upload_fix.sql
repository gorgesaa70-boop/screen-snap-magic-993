begin;
-- Fix: every file upload failed with "permission denied for table investment_opportunities".
-- The investment-docs insert rule read investment_opportunities.submitted_by directly, a column regular users
-- may not read (column-level grants). Postgres checks all upload rules together, whatever the bucket, so that one
-- rule blocked uploads to every bucket (profile photos, listing photos, deal papers…).
-- The checks now run inside SECURITY DEFINER helpers that take the folder name as text (no unsafe uuid casts).

create or replace function public.can_upload_investment_doc(_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.investment_opportunities o
    where o.id::text = _folder and (o.submitted_by = auth.uid() or public.has_role(auth.uid(), 'admin'))
  )
$$;
revoke execute on function public.can_upload_investment_doc(text) from public, anon;
grant execute on function public.can_upload_investment_doc(text) to authenticated;

create or replace function public.can_read_investment_doc(_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select _folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (select 1 from public.opportunity_private(_folder::uuid))
$$;
revoke execute on function public.can_read_investment_doc(text) from public, anon;
grant execute on function public.can_read_investment_doc(text) to authenticated;

drop policy if exists "submitter or admin uploads investment docs" on storage.objects;
create policy "submitter or admin uploads investment docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'investment-docs' and public.can_upload_investment_doc((storage.foldername(name))[1]));

drop policy if exists "investment docs for people with access" on storage.objects;
create policy "investment docs for people with access" on storage.objects for select to authenticated
  using (bucket_id = 'investment-docs' and public.can_read_investment_doc((storage.foldername(name))[1]));

commit;
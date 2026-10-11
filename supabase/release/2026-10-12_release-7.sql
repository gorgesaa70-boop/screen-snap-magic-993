-- فاليو عقار — الإصدار السابع: بيتنفذ بعد الإصدارات من 1 لـ 6، مرة واحدة بس.
-- بيتنفذ كله أو مفيش حاجة بتتغيّر (transaction واحدة). ما تشغلوش مرتين.
-- الملفات بالترتيب:
--   20261012500000_lead-sources.sql

begin;

-- ================= 20261012500000_lead-sources.sql =================
-- Items 29–30: where a lead came from.
-- 30. Ad / campaign attribution sent by the website (UTM tags, click ids, outside referrer) → source + campaign.
-- 29. Leads created automatically from new WhatsApp chats and Meta (Facebook / Instagram) Lead Ads.

alter table public.leads
  add column if not exists campaign text check (campaign is null or char_length(campaign) <= 200),
  add column if not exists utm jsonb check (utm is null or (jsonb_typeof(utm) = 'object' and pg_column_size(utm) <= 2000)),
  -- Id of the outside record the lead came from (Meta lead id, WhatsApp message id): each is imported once.
  add column if not exists external_ref text check (external_ref is null or char_length(external_ref) <= 120);
create unique index if not exists leads_external_ref_key on public.leads (external_ref) where external_ref is not null;

-- utm_source / click id / referrer → one of the LEAD_SOURCES keys (null = unknown, keep 'website').
create or replace function public.source_from_utm(_u jsonb)
returns text language sql immutable set search_path = public as $$
  select case
    when s ~ 'instagram' or s ~ '(^|[^a-z])ig([^a-z]|$)' then 'instagram'
    when s ~ 'facebook|meta' or s ~ '(^|[^a-z])fb([^a-z]|$)' then 'facebook'
    when s ~ 'tiktok' then 'tiktok'
    when s ~ 'google' or _u ? 'gclid' then 'google_ads'
    when s ~ 'whatsapp' or s ~ '(^|[^a-z])wa([^a-z]|$)' then 'whatsapp'
    when s <> '' then null
    when _u ? 'fbclid' then 'facebook'
    when _u ? 'ttclid' then 'tiktok'
    when r ~ '(^|\.)instagram\.com$' then 'instagram'
    when r ~ '(^|\.)(facebook\.com|fb\.com|fb\.me)$' then 'facebook'
    when r ~ '(^|\.)tiktok\.com$' then 'tiktok'
    when r ~ '(^|\.)(wa\.me|whatsapp\.com)$' then 'whatsapp'
  end
  from (select lower(coalesce(_u->>'utm_source', '')) s, lower(coalesce(_u->>'ref', '')) r) x
$$;

-- Runs after leads_guard (name order) so the guard's 'website' is replaced, and before leads_pick_company
-- so routing rules by source see the real source.
create or replace function public.leads_ad_source()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  privileged boolean := public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role' or public.is_staff();
  src text;
begin
  if tg_op = 'UPDATE' then
    if not (public.has_role(auth.uid(), 'admin') or coalesce(auth.role(), '') = 'service_role') then
      new.utm := old.utm; new.campaign := old.campaign; new.external_ref := old.external_ref;
    end if;
    return new;
  end if;
  if new.utm is not null then
    select jsonb_object_agg(k, left(v, 120)) into new.utm from jsonb_each_text(new.utm) e(k, v)
    where k in ('utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','ttclid','ref','landing') and v <> '';
  end if;
  if not privileged then new.campaign := null; new.external_ref := null; end if;
  if new.utm is not null and new.source = 'website' then
    src := public.source_from_utm(new.utm);
    if src is not null then new.source := src; new.original_source := src; end if;
    new.campaign := coalesce(nullif(left(new.utm->>'utm_campaign', 200), ''), new.campaign);
    if new.source_note is null and coalesce(new.utm->>'utm_content', '') <> '' then
      new.source_note := left('إعلان: ' || (new.utm->>'utm_content'), 200);
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.leads_ad_source() from public, anon, authenticated;
drop trigger if exists leads_h_ad_source on public.leads;
create trigger leads_h_ad_source before insert or update on public.leads
  for each row execute function public.leads_ad_source();

-- 29a. A WhatsApp message from a number Value Aqar doesn't know yet → new lead (source WhatsApp), routed and
-- notified like any lead. A known open customer → a note on their lead (at most one per 12 hours).
-- Numbers of companies, brokers, team members and staff are ignored. Called only by the webhook (service role).
create or replace function public.whatsapp_inbound_lead(_phone text, _name text, _text text, _msg_id text)
returns text language plpgsql security definer set search_path = public as $$
declare p text := public.normalize_phone(_phone); existing uuid;
begin
  if p is null or char_length(p) < 8 then return 'ignored'; end if;
  if exists (select 1 from public.brokers b where public.normalize_phone(b.phone) = p or public.normalize_phone(b.whatsapp) = p)
     or exists (select 1 from public.company_members m where public.normalize_phone(m.phone) = p and m.is_active)
     or exists (select 1 from auth.users u join public.user_roles r on r.user_id = u.id
                where r.role::text in ('admin','staff') and public.normalize_phone(u.phone) = p) then
    return 'team';
  end if;
  select id into existing from public.leads
  where phone_norm = p and stage not in ('sold','lost') and created_at > now() - interval '90 days'
  order by created_at desc limit 1;
  if existing is not null then
    if not exists (select 1 from public.lead_activities where lead_id = existing and kind = 'whatsapp' and actor_id is null and created_at > now() - interval '12 hours') then
      insert into public.lead_activities (lead_id, actor_id, kind, summary)
      values (existing, null, 'whatsapp', left('العميل بعت رسالة واتساب: ' || coalesce(nullif(_text, ''), '(مش نص)'), 1000));
    end if;
    return 'existing';
  end if;
  insert into public.leads (name, phone, kind, source, details, external_ref)
  values (left(coalesce(nullif(trim(_name), ''), 'عميل واتساب'), 100), left(_phone, 20), 'request', 'whatsapp',
          left('رسالة واتساب: ' || coalesce(nullif(_text, ''), '(مش نص)'), 1000), left('wa:' || _msg_id, 120))
  on conflict (external_ref) where external_ref is not null do nothing;
  return 'created';
end $$;
revoke execute on function public.whatsapp_inbound_lead(text, text, text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_inbound_lead(text, text, text, text) to service_role;

-- 29b. Meta Lead Ads (Facebook / Instagram forms): imported once per Meta lead id. A phone that is already an
-- open customer gets a note instead of a duplicate lead. Called only by the webhook (service role).
create or replace function public.meta_inbound_lead(_ref text, _name text, _phone text, _platform text, _campaign text, _ad text, _details text)
returns text language plpgsql security definer set search_path = public as $$
declare p text := public.normalize_phone(_phone); existing uuid; src text := case when lower(coalesce(_platform, '')) in ('ig','instagram') then 'instagram' else 'facebook' end;
begin
  if p is null or char_length(p) < 8 then return 'no_phone'; end if;
  if exists (select 1 from public.leads where external_ref = 'meta:' || _ref) then return 'duplicate'; end if;
  select id into existing from public.leads
  where phone_norm = p and stage not in ('sold','lost') and created_at > now() - interval '90 days'
  order by created_at desc limit 1;
  if existing is not null then
    insert into public.lead_activities (lead_id, actor_id, kind, summary)
    values (existing, null, 'note', left('سجّل تاني من إعلان ' || case src when 'instagram' then 'إنستجرام' else 'فيسبوك' end
      || coalesce(' — ' || nullif(_campaign, ''), '') || coalesce(E'\n' || nullif(_details, ''), ''), 1000));
    return 'existing';
  end if;
  insert into public.leads (name, phone, kind, source, campaign, source_note, details, external_ref)
  values (left(coalesce(nullif(trim(_name), ''), 'عميل من إعلان'), 100), left(_phone, 20), 'request', src,
          left(nullif(_campaign, ''), 200), left('Lead Ads' || coalesce(': ' || nullif(_ad, ''), ''), 200),
          left(nullif(_details, ''), 1000), left('meta:' || _ref, 120));
  return 'created';
end $$;
revoke execute on function public.meta_inbound_lead(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.meta_inbound_lead(text, text, text, text, text, text, text) to service_role;


commit;

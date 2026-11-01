-- فاليو عقار — إصدار 44: نسخ الإشعارات على الواتساب بتتبعت كل دقيقة.
-- * قاعدة البيانات بتنادي صفحة الإرسال في الموقع كل دقيقة (زي إشعارات الموبايل بالظبط)، والموقع يبعت بقالب
--   valueaqar_notify للي مفعّل إشعارات الواتساب بس. الإشعارات القديمة (أكتر من يوم) مش هتتبعت.
-- إضافة بس، ينفع يتشغل تاني. بعد إصدار 43. محتاج Publish + Secret اسمه WHATSAPP_NOTIFY_TEMPLATE.
--   20261101400000_wa-dispatch-cron.sql

begin;
-- WhatsApp copies of notifications go out every minute (release 44): the database calls the site's
-- /api/public/notifications/whatsapp-dispatch (pg_net) with the secret kept in push_config, the same way it already
-- calls /api/public/push/dispatch. The route sends pending copies with the approved template (WHATSAPP_NOTIFY_TEMPLATE)
-- to users who turned WhatsApp notifications on. Without pg_net / push_config this does nothing.
-- Additive only; re-runnable. After release 43.

create or replace function public.call_wa_dispatch()
returns void language plpgsql security definer set search_path = public as $$
declare site text; sec text;
begin
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null or to_regclass('public.push_config') is null then return; end if;
  execute 'select site_url, secret from public.push_config where id = 1' into site, sec;
  if sec is null then return; end if;
  execute 'select net.http_post(url := $1, body := $2, params := ''{}''::jsonb, headers := $3, timeout_milliseconds := 20000)'
    using site || '/api/public/notifications/whatsapp-dispatch', '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', sec);
exception when others then
  perform public.log_app_error('server', left('call_wa_dispatch: ' || sqlerrm, 500), '', 'pg_cron call_wa_dispatch', '');
end $$;
revoke execute on function public.call_wa_dispatch() from public, anon, authenticated;
grant execute on function public.call_wa_dispatch() to service_role;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'value-aqar-wa-dispatch';
    perform cron.schedule('value-aqar-wa-dispatch', '* * * * *', 'select public.call_wa_dispatch()');
  end if;
end $$;
commit;

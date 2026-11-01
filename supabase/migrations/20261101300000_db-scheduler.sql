-- The scheduled jobs run from inside the database every minute (pg_cron), instead of waiting for an outside
-- scheduler to call /api/public/notifications/whatsapp-dispatch (which never ran). Each job is safe to run again:
-- * run_lead_transfers: customers nobody answered in time move to the next company (app_settings.transfer_enabled).
-- * run_subscription_expiry / run_service_subscriptions: plan reminders and endings.
-- * run_listing_expiry: listing-term reminders and endings.
-- * run_service_offers / run_referrals: unanswered service requests and referrals move on / expire.
-- * run_reminders: follow-ups, visits, overdue tasks… as bell notifications.
-- Not here: WhatsApp copies of notifications and the push safety net — those still need the server route.
-- One job failing doesn't stop the others; failures go to the error log. Additive only; re-runnable.

create or replace function public.run_scheduled_jobs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare job text; failed text[] := '{}';
begin
  -- The jobs accept only the server (service role) or the admin; pg_cron runs as the database owner with no
  -- request, so act as the server for this run only (transaction-local). Only the service role / owner reach here.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  foreach job in array array['run_lead_transfers', 'run_subscription_expiry', 'run_service_subscriptions', 'run_listing_expiry',
                              'run_service_offers', 'run_referrals', 'run_reminders'] loop
    begin
      execute format('select public.%I()', job);
    exception when others then
      failed := failed || job;
      perform public.log_app_error('server', left(job || ': ' || sqlerrm, 500), '', 'pg_cron run_scheduled_jobs', '');
    end;
  end loop;
  return jsonb_build_object('failed', to_jsonb(failed));
end $$;
revoke execute on function public.run_scheduled_jobs() from public, anon, authenticated;
grant execute on function public.run_scheduled_jobs() to service_role;

-- Every minute (where pg_cron exists — Lovable Cloud / Supabase; skipped in local test databases).
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron not available: %', sqlerrm;
  end;
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'value-aqar-jobs';
    perform cron.schedule('value-aqar-jobs', '* * * * *', 'select public.run_scheduled_jobs()');
  end if;
end $$;

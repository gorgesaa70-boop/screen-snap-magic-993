revoke execute on function public.brokers_guard() from public, anon, authenticated;
revoke execute on function public.properties_guard() from public, anon, authenticated;
revoke execute on function public.leads_guard() from public, anon, authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.current_broker_id() from public, anon;
revoke execute on function public.admin_exists() from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.current_broker_id() to authenticated;
grant execute on function public.admin_exists() to authenticated;
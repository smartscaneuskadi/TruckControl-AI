-- Preserve legacy workshop behavior and policy OIDs while removing privileged
-- helper implementations from the exposed API schema.
do $$ begin
 if to_regprocedure('public.is_workshop_member(uuid)') is not null then
  alter function public.is_workshop_member(uuid) set schema private;
  alter function private.is_workshop_member(uuid) rename to tc_legacy_workshop_member;
  revoke all on function private.tc_legacy_workshop_member(uuid) from public,anon,authenticated;
  grant execute on function private.tc_legacy_workshop_member(uuid) to authenticated;
  execute $fn$create function public.is_workshop_member(p_workshop_id uuid) returns boolean
    language sql stable security invoker set search_path='' as 'select private.tc_legacy_workshop_member(p_workshop_id)'$fn$;
  revoke all on function public.is_workshop_member(uuid) from public,anon,authenticated;
  grant execute on function public.is_workshop_member(uuid) to authenticated;
 end if;
 if to_regprocedure('public.is_workshop_admin(uuid)') is not null then
  alter function public.is_workshop_admin(uuid) set schema private;
  alter function private.is_workshop_admin(uuid) rename to tc_legacy_workshop_admin;
  revoke all on function private.tc_legacy_workshop_admin(uuid) from public,anon,authenticated;
  grant execute on function private.tc_legacy_workshop_admin(uuid) to authenticated;
  execute $fn$create function public.is_workshop_admin(p_workshop_id uuid) returns boolean
    language sql stable security invoker set search_path='' as 'select private.tc_legacy_workshop_admin(p_workshop_id)'$fn$;
  revoke all on function public.is_workshop_admin(uuid) from public,anon,authenticated;
  grant execute on function public.is_workshop_admin(uuid) to authenticated;
 end if;
end $$;
-- Explicit server-only policies; browsers retain no table privileges or policies.
do $$ declare t text;begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  foreach t in array array['gmail_oauth_pending','gmail_oauth_states','gmail_tokens','invoice_ai_usage',
    'tc_admin_audit','tc_admins','tc_customers','tc_modules','tc_payment_events','tc_payment_requests','tc_plans','tc_settings'] loop
    execute format('create policy tc_server_only on private.%I for all to service_role using(true) with check(true)',t);
  end loop;
 end if;
end $$;

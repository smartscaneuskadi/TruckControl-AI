-- The checkout workers may read the approval for one merchant, but cannot set it.
create function private.tc_manual_stripe_checkout_ready(p_account text)
returns boolean language sql stable security definer set search_path = '' as $$
  select current_setting('role', true) = 'service_role' and exists (
    select 1
    from private.tc_manual_stripe_channels c
    join private.tc_settings s on s.id and s.payments_enabled
    where c.provider_account_id = p_account and c.mode = 'live'
      and c.enabled and not c.isolated_test_instance
      and c.commercial_approved_at <= now()
      and length(btrim(c.approval_reference)) >= 3
  );
$$;
create function public.tc_manual_stripe_checkout_ready(p_account text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.tc_manual_stripe_checkout_ready(p_account);
$$;
revoke all on function private.tc_manual_stripe_checkout_ready(text) from public, anon, authenticated;
revoke all on function public.tc_manual_stripe_checkout_ready(text) from public, anon, authenticated;
do $grants$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function private.tc_manual_stripe_checkout_ready(text) to service_role;
    grant execute on function public.tc_manual_stripe_checkout_ready(text) to service_role;
  end if;
end;
$grants$;

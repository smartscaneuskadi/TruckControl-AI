-- Cover relationship lookups reported by the hosted performance advisor.
create index tc_documents_driver_idx on private.company_documents(organization_id,driver_id);
create index tc_documents_truck_idx on private.company_documents(organization_id,truck_id);
create index tc_oauth_pending_org_idx on private.gmail_oauth_pending(organization_id);
create index tc_oauth_pending_user_idx on private.gmail_oauth_pending(user_id);
create index tc_oauth_states_org_idx on private.gmail_oauth_states(organization_id);
create index tc_oauth_states_user_idx on private.gmail_oauth_states(user_id);
create index tc_audit_actor_idx on private.tc_admin_audit(actor_id);
create index tc_customers_paid_plan_idx on private.tc_customers(paid_plan);
create index tc_customers_requested_plan_idx on private.tc_customers(requested_plan);
create index tc_payment_plan_idx on private.tc_payment_requests(plan_id);
do $$ begin
 if to_regclass('public.subscriptions') is not null then
  create index tc_legacy_subscriptions_plan_idx on public.subscriptions(plan_id);
 end if;
end $$;

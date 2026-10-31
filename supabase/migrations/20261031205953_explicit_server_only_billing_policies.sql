-- Document the intentional deny-all boundary. service_role uses BYPASSRLS;
-- neither current nor future permissive client policies may expose billing data.
create policy tc_subscription_orders_server_only on private.tc_subscription_orders
  as restrictive for all to public using(false) with check(false);
create policy tc_billing_subscriptions_server_only on private.tc_billing_subscriptions
  as restrictive for all to public using(false) with check(false);
create policy tc_subscription_events_server_only on private.tc_subscription_events
  as restrictive for all to public using(false) with check(false);
create policy tc_subscription_invoices_server_only on private.tc_subscription_invoices
  as restrictive for all to public using(false) with check(false);

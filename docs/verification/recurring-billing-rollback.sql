-- Dedicated TruckControl only. No Auth API, provider request, email or charge.
-- Synthetic records and local settings are rolled back together.
begin;
do $$ begin
  if has_function_privilege('anon','public.tc_recurring_billing(text,jsonb)','execute')
    or has_function_privilege('authenticated','public.tc_recurring_billing(text,jsonb)','execute')
    or not has_function_privilege('service_role','public.tc_recurring_billing(text,jsonb)','execute')
    then raise exception 'Recurring RPC is not server-only';end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relname in ('tc_subscription_orders','tc_billing_subscriptions','tc_subscription_events','tc_subscription_invoices')
    and (not c.relrowsecurity or has_table_privilege('authenticated',c.oid,'select') or has_table_privilege('anon',c.oid,'select')))
    then raise exception 'Recurring table exposed';end if;
end $$;
update private.tc_settings set payments_enabled=true,prices_are_examples=false where id=true;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('f1000000-0000-4000-8000-000000000001','recurring-a@example.com',now(),'{}'),
  ('f1000000-0000-4000-8000-000000000002','recurring-b@example.com',now(),'{}');
insert into private.tc_customers(user_id,contact_name,company_name,tax_id,address,email,phone) values
  ('f1000000-0000-4000-8000-000000000001','Persona ficticia A','Empresa ficticia A','DEMO-A','Dirección ficticia','recurring-a@example.com','+34600000301'),
  ('f1000000-0000-4000-8000-000000000002','Persona ficticia B','Empresa ficticia B','DEMO-B','Dirección ficticia','recurring-b@example.com','+34600000302');
insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision)
  select 'f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',id,monthly_cents,revision from private.tc_plans where id='limited';
insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision)
  select 'f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002',id,monthly_cents,revision from private.tc_plans where id='limited';
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
do $$ declare denied boolean := false; begin
  begin
    perform public.tc_recurring_billing('status','{"user_id":"f1000000-0000-4000-8000-000000000002"}');
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Authenticated caller reached server RPC';end if;
end $$;
reset role;
set local role service_role;
do $$
declare
  account uuid := 'f1000000-0000-4000-8000-000000000001';
  other_account uuid := 'f1000000-0000-4000-8000-000000000002';
  request_id uuid := 'f2000000-0000-4000-8000-000000000001';
  quote integer; stamp bigint := floor(extract(epoch from now()));
  proof jsonb; result jsonb; paid_until_before timestamptz; denied boolean := false;
begin
  select quoted_cents into quote from private.tc_payment_requests where id=request_id;
  result := public.tc_recurring_billing('prepare',jsonb_build_object('user_id',account,'request_id',request_id,
    'terms_accepted',true,'terms_version','synthetic-native-v1'));
  if result->>'available'<>'true' then raise exception 'Quote not reserved';end if;
  proof := jsonb_build_object('user_id',account,'request_id',request_id,'event_id','evt_nativePaid',
    'event_type','invoice.paid','event_created',stamp,'subscription_id','sub_nativeSynthetic','customer_id','cus_nativeSynthetic',
    'unit_amount',quote,'currency','EUR','state','active','cancel_at_period_end',false,'period_end',stamp+30*86400,
    'invoice_paid',true,'invoice_id','in_nativeSynthetic','invoice_amount',quote,
    'invoice_period_start',stamp,'invoice_period_end',stamp+30*86400);
  perform public.tc_recurring_billing('event',proof);
  select paid_until into paid_until_before from private.tc_customers where user_id=account;
  if paid_until_before is null then raise exception 'Paid invoice not applied';end if;
  result := public.tc_recurring_billing('event',proof);
  if result->>'duplicate'<>'true' then raise exception 'Duplicate event not recognized';end if;
  perform public.tc_recurring_billing('event',proof||'{"event_id":"evt_nativeRetry"}'::jsonb);
  if (select paid_until from private.tc_customers where user_id=account)<>paid_until_before
    or (select count(*) from private.tc_subscription_invoices where user_id=account)<>1
    then raise exception 'Duplicate invoice extended access';end if;
  result := public.tc_recurring_billing('status',jsonb_build_object('user_id',other_account));
  if result->'invoices'<>'[]'::jsonb or result->'subscription'<>'null'::jsonb then raise exception 'Other account saw a subscription';end if;
  begin
    perform public.tc_recurring_billing('event',proof||jsonb_build_object('user_id',other_account,
      'request_id','f2000000-0000-4000-8000-000000000002','event_id','evt_nativeForged'));
  exception when raise_exception then denied:=true;end;
  if not denied then raise exception 'Cross-account subscription reassigned';end if;
  update private.tc_customers set status='suspended' where user_id=account;
  perform public.tc_recurring_billing('event',proof||jsonb_build_object('event_id','evt_nativeRenew','invoice_id','in_nativeRenew',
    'invoice_period_start',stamp+30*86400,'invoice_period_end',stamp+60*86400,'period_end',stamp+60*86400));
  if (select status from private.tc_customers where user_id=account)<>'suspended'
    then raise exception 'Payment bypassed administrative suspension';end if;
  update private.tc_settings set payments_enabled=false where id=true;
  perform public.tc_recurring_billing('manage',jsonb_build_object('user_id',account,'operation','cancel'));
  denied := false;
  begin
    perform public.tc_recurring_billing('manage',jsonb_build_object('user_id',account,'operation','resume'));
  exception when raise_exception then denied:=true;end;
  if not denied then raise exception 'Renewal resumed while disabled';end if;
end $$;
reset role;
rollback;
select 'recurring_billing_passed_and_rolled_back' as verification,
  (select count(*) from auth.users where id in ('f1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002')) as synthetic_users_remaining,
  (select count(*) from private.tc_billing_subscriptions) as subscriptions_remaining,
  (select payments_enabled from private.tc_settings where id=true) as payments_enabled,
  (select registration_open from private.tc_settings where id=true) as registration_open;

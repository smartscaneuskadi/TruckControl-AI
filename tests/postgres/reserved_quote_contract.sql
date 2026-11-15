-- Shared offline contract: callers MUST wrap this script in a transaction and
-- ROLLBACK. Only disposable PGlite/the pinned isolated PostgreSQL service runs
-- it. No provider, paid event, fiscal document, email or entitlement is created.
create temporary table reserved_quote_checks(name text primary key);
create function pg_temp.reserved_quote_check(ok boolean,label text)
returns void language plpgsql as $check$
begin
  if ok is distinct from true then raise exception 'reserved_quote_contract_failed: %',label;end if;
  insert into reserved_quote_checks values(label);
end;$check$;
create function pg_temp.reserved_quote_state()
returns jsonb language sql as $snapshot$
  select jsonb_build_object(
    'customers',(select jsonb_agg(to_jsonb(c) order by user_id) from private.tc_customers c),
    'requests',(select jsonb_agg(to_jsonb(r) order by id) from private.tc_payment_requests r),
    'reservations',(select jsonb_agg(to_jsonb(o) order by user_id) from private.tc_subscription_orders o),
    'subscriptions',(select jsonb_agg(to_jsonb(b) order by provider_id) from private.tc_billing_subscriptions b),
    'invoices',(select jsonb_agg(to_jsonb(i) order by invoice_id) from private.tc_subscription_invoices i),
    'tasks',(select jsonb_agg(to_jsonb(t) order by id) from private.tc_manual_subscription_invoice_tasks t)
  );
$snapshot$;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('fa730000-0000-4000-8000-000000000001','reserved-quote-contract-a@example.invalid',now(),
 '{"truckcontrol_registration":{"contact_name":"Synthetic quote contract A","company_name":"Synthetic quote company A","tax_id":"SYNTHETIC-QUOTE-A","address":"Synthetic contract address 123","phone":"+12025551731","requested_plan":"limited"}}'),
('fa730000-0000-4000-8000-000000000002','reserved-quote-contract-b@example.invalid',now(),
 '{"truckcontrol_registration":{"contact_name":"Synthetic quote contract B","company_name":"Synthetic quote company B","tax_id":"SYNTHETIC-QUOTE-B","address":"Synthetic contract address 456","phone":"+12025551732","requested_plan":"limited"}}');
insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status,created_at,net_cents,vat_rate_bps,vat_cents)
select 'fa740000-0000-4000-8000-000000000001','fa730000-0000-4000-8000-000000000001',id,36300,revision,'requested',now()-interval '23 hours',30000,2100,6300
from private.tc_plans where id='limited';
insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status,created_at,net_cents,vat_rate_bps,vat_cents)
select 'fa740000-0000-4000-8000-000000000002','fa730000-0000-4000-8000-000000000002',id,36300,revision,'requested',now()-interval '25 hours',30000,2100,6300
from private.tc_plans where id='limited';
update private.tc_settings set payments_enabled=true,prices_are_examples=false where id;

do $saved_quote_contract$
declare
  buyer constant uuid:='fa730000-0000-4000-8000-000000000001';
  other_buyer constant uuid:='fa730000-0000-4000-8000-000000000002';
  request constant uuid:='fa740000-0000-4000-8000-000000000001';
  other_request constant uuid:='fa740000-0000-4000-8000-000000000002';
  input jsonb; result jsonb; original jsonb; before_attempt jsonb;
  attack text; rejected boolean; closed_state text;
begin
  input:=jsonb_build_object('user_id',buyer,'request_id',request,'terms_accepted',true,'terms_version','synthetic-reserved-quote-v1');
  result:=public.tc_recurring_billing('prepare',input);
  perform pg_temp.reserved_quote_check((result->>'available')::boolean,'T+23h quote can reserve checkout');
  perform public.tc_recurring_billing('saved',jsonb_build_object('user_id',buyer,'request_id',request,'checkout_id','cs_test_ReservedQuoteContract'));
  -- Advance the relative fixture clock to T+25h. PostgreSQL now() stays fixed
  -- in this transaction; move all reservation timestamps back two hours.
  update private.tc_payment_requests set created_at=created_at-interval '2 hours' where id=request;
  update private.tc_subscription_orders set created_at=created_at-interval '2 hours',terms_accepted_at=terms_accepted_at-interval '2 hours',expires_at=expires_at-interval '2 hours' where user_id=buyer;
  original:=pg_temp.reserved_quote_state();
  result:=public.tc_recurring_billing('prepare',input);
  perform pg_temp.reserved_quote_check((result->>'available')::boolean and result->>'checkout_id'='cs_test_ReservedQuoteContract'
    and (result->>'expires_at')::timestamptz=now()+interval '21 hours','T+25h recovers exact saved checkout with21h remaining');
  perform public.tc_recurring_billing('prepare',input);
  perform pg_temp.reserved_quote_check(pg_temp.reserved_quote_state()=original,'repeated recovery preserves all rows and lease timestamps');
  perform pg_temp.reserved_quote_check(not exists(select 1 from private.tc_billing_subscriptions where user_id=buyer)
    and not exists(select 1 from private.tc_subscription_invoices where user_id=buyer)
    and not exists(select 1 from private.tc_manual_subscription_invoice_tasks where buyer_user_id=buyer)
    and (select paid_until is null from private.tc_customers where user_id=buyer),'recovery creates no paid subscription invoice task or access');

  -- Each adversarial fixture is a subtransaction, always rolled back after
  -- verifying denial and unchanged production records. The outer transaction
  -- is also rolled back by both callers, including the successful path.
  foreach attack in array array['no_reservation','no_ids','request_id_absent','reservation_id_absent','different_ids','invalid_ids',
    'requested','paid','cancelled','terms','other_user','other_request','unpublished','revision','suspended','payments_off','examples'] loop
    begin
      input:=jsonb_build_object('user_id',buyer,'request_id',request,'terms_accepted',true,'terms_version','synthetic-reserved-quote-v1');
      if attack='no_reservation' then delete from private.tc_subscription_orders where user_id=buyer;
      elsif attack='no_ids' then
        update private.tc_subscription_orders set checkout_id=null where user_id=buyer;
        update private.tc_payment_requests set status='requested',checkout_id=null where id=request;
      elsif attack='request_id_absent' then update private.tc_payment_requests set checkout_id=null where id=request;
      elsif attack='reservation_id_absent' then update private.tc_subscription_orders set checkout_id=null where user_id=buyer;
      elsif attack='different_ids' then update private.tc_subscription_orders set checkout_id='cs_test_DifferentQuoteContract' where user_id=buyer;
      elsif attack='invalid_ids' then
        update private.tc_subscription_orders set checkout_id='cs_bad?expand[]=customer' where user_id=buyer;
        update private.tc_payment_requests set checkout_id='cs_bad?expand[]=customer' where id=request;
      elsif attack in('requested','paid','cancelled') then update private.tc_payment_requests set status=attack where id=request;
      elsif attack='terms' then input:=input||jsonb_build_object('terms_version','synthetic-other-terms');
      elsif attack='other_user' then input:=input||jsonb_build_object('user_id',other_buyer);
      elsif attack='other_request' then input:=input||jsonb_build_object('request_id',other_request);
      elsif attack='unpublished' then update private.tc_plans set published=false where id='limited';
      elsif attack='revision' then update private.tc_plans set revision=revision+1 where id='limited';
      elsif attack='suspended' then update private.tc_customers set status='suspended' where user_id=buyer;
      elsif attack='payments_off' then update private.tc_settings set payments_enabled=false where id;
      elsif attack='examples' then update private.tc_settings set prices_are_examples=true where id;
      end if;
      before_attempt:=pg_temp.reserved_quote_state();rejected:=false;
      begin perform public.tc_recurring_billing('prepare',input);
      exception when raise_exception then rejected:=true;end;
      if not rejected or pg_temp.reserved_quote_state() is distinct from before_attempt then
        raise exception 'reserved_quote_denial_failed: %',attack;
      end if;
      raise exception using errcode='P7300',message='rollback synthetic attack fixture';
    exception when sqlstate 'P7300' then null;end;
    perform pg_temp.reserved_quote_check(true,'rejects '||attack||' without mutation');
  end loop;

  foreach closed_state in array array['active','canceled','incomplete_expired'] loop
    begin
      insert into private.tc_billing_subscriptions(provider_id,user_id,request_id,customer_id,plan_id,monthly_cents,state,period_end,event_created)
        values('sub_ReservedQuoteContract',buyer,request,'cus_ReservedQuoteContract','limited',36300,closed_state,now()+interval '30 days',extract(epoch from now())::bigint);
      before_attempt:=pg_temp.reserved_quote_state();rejected:=false;
      begin perform public.tc_recurring_billing('prepare',jsonb_build_object('user_id',buyer,'request_id',request,'terms_accepted',true,'terms_version','synthetic-reserved-quote-v1'));
      exception when raise_exception then rejected:=true;end;
      if not rejected or pg_temp.reserved_quote_state() is distinct from before_attempt then raise exception 'reserved_quote_subscription_cleanup_failed';end if;
      raise exception using errcode='P7300',message='rollback synthetic subscription fixture';
    exception when sqlstate 'P7300' then null;end;
    perform pg_temp.reserved_quote_check(true,'rejects '||closed_state||' subscription without replacement');
  end loop;

  foreach attack in array array['saved','unknown'] loop
    begin
      update private.tc_subscription_orders set expires_at=now() where user_id=buyer;
      if attack='unknown' then
        update private.tc_subscription_orders set checkout_id=null where user_id=buyer;
        update private.tc_payment_requests set checkout_id=null,status='requested' where id=request;
      end if;
      before_attempt:=pg_temp.reserved_quote_state();
      result:=public.tc_recurring_billing('prepare',jsonb_build_object('user_id',buyer,'request_id',request,'terms_accepted',true,'terms_version','synthetic-reserved-quote-v1'));
      if result<>jsonb_build_object('available',false) or pg_temp.reserved_quote_state() is distinct from before_attempt then raise exception 'reserved_quote_expiry_fence_failed';end if;
      raise exception using errcode='P7300',message='rollback synthetic expiry fixture';
    exception when sqlstate 'P7300' then null;end;
    perform pg_temp.reserved_quote_check(true,'exact expiry keeps '||attack||' reservation fenced');
  end loop;
  perform pg_temp.reserved_quote_check(pg_temp.reserved_quote_state()=original,'all adversarial subtransactions restore the original saved reservation');
end;$saved_quote_contract$;
select jsonb_build_object('contract','reserved-recurring-quote-age-v1','checks',jsonb_agg(name order by name),
  'provider_calls',0,'paid_mutations',0,'rollback_required',true) result from reserved_quote_checks;

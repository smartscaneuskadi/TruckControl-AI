-- Generated locally by Supabase CLI3.0.0 migration new; not applied remotely.
-- Accept canonical Stripe dispute dp_ IDs. Preserve migration64, function
-- identity/ACL, RLS and all existing append-only evidence without rewriting it.
-- Only the dispute object-ID validation changes; all other checks are retained.
create or replace function private.tc_manual_subscription_record_incident(p_account text,p_mode text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $record$
#variable_conflict use_variable
declare
 c private.tc_subscription_financial_cases;t private.tc_manual_subscription_invoice_tasks;
 existing private.tc_subscription_financial_entries;case_uuid uuid;task_uuid uuid;matches integer;
 key text;kind text;event_type text;stamp bigint;proof jsonb;digest text;version bigint;
 invoice_id text;intent_id text;charge_id text;amount integer;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'subscription_incident_server_only' using errcode='42501';end if;
 if p_account is null or p_account !~ '^acct_[A-Za-z0-9]{1,100}$'
  or p_mode is null or p_mode not in ('test','live') or jsonb_typeof(p_data) is distinct from 'object'
  or octet_length(p_data::text)>12000
  or p_data-array['event_id','event_type','event_created','livemode','currency','object_type','object_id',
    'status_at_event','current_status','event_amount_cents','current_amount_cents','charge_amount_cents',
    'charge_amount_refunded_cents','event_amount_refunded_cents','payment_intent_id','charge_id','customer_id',
    'invoice_id','subscription_id','invoice_payment_id','invoice_period_start','invoice_period_end','invoice_amount_cents']<>'{}'
  or not (p_data ?& array['event_id','event_type','event_created','livemode','currency','object_type','object_id',
    'status_at_event','current_status','event_amount_cents','current_amount_cents','charge_amount_cents',
    'charge_amount_refunded_cents','event_amount_refunded_cents','payment_intent_id','charge_id','customer_id',
    'invoice_id','subscription_id','invoice_payment_id','invoice_period_start','invoice_period_end','invoice_amount_cents'])
  or jsonb_typeof(p_data->'livemode') is distinct from 'boolean'
  or (p_data->>'livemode')::boolean is distinct from (p_mode='live')
  or p_data->>'currency' is distinct from 'EUR'
  or p_data->>'event_id' is null or p_data->>'event_id' !~ '^evt_[A-Za-z0-9]{1,200}$'
  or p_data->>'payment_intent_id' is null or p_data->>'payment_intent_id' !~ '^pi_[A-Za-z0-9]{1,200}$'
  or p_data->>'charge_id' is null or p_data->>'charge_id' !~ '^ch_[A-Za-z0-9]{1,200}$'
  or not private.tc_subscription_incident_integer(p_data->'event_created',1,9007199254740991)
 then raise exception 'subscription_incident_invalid' using errcode='22023';end if;
 foreach key in array array['event_amount_cents','current_amount_cents','charge_amount_cents','charge_amount_refunded_cents'] loop
  if not private.tc_subscription_incident_integer(p_data->key,0,100000000) then
   raise exception 'subscription_incident_invalid' using errcode='22023';end if;
 end loop;
 foreach key in array array['status_at_event','current_status'] loop
  if p_data->>key is null or p_data->>key !~ '^[a-z_]{1,64}$' then
   raise exception 'subscription_incident_invalid' using errcode='22023';end if;
 end loop;
 stamp:=(p_data->>'event_created')::bigint;kind:=p_data->>'object_type';event_type:=p_data->>'event_type';
 intent_id:=p_data->>'payment_intent_id';charge_id:=p_data->>'charge_id';invoice_id:=p_data->>'invoice_id';
 amount:=(p_data->>'charge_amount_cents')::integer;
 if stamp>extract(epoch from now())+300 or amount<1
  or (p_data->>'charge_amount_refunded_cents')::integer>amount
  or event_type is null or event_type not in ('charge.refunded','refund.created','refund.updated','refund.failed',
   'charge.dispute.created','charge.dispute.updated','charge.dispute.closed')
  or kind is null or kind not in ('refund','dispute','charge')
  or p_data->>'object_id' is null
  or (kind='refund' and (event_type not like 'refund.%' or p_data->>'object_id' !~ '^re_[A-Za-z0-9]{1,200}$'))
  or (kind='dispute' and (event_type not like 'charge.dispute.%' or p_data->>'object_id' !~ '^dp_[A-Za-z0-9]{1,200}$'))
  or (kind='charge' and (event_type<>'charge.refunded' or p_data->>'object_id'<>charge_id))
  or (p_data->>'customer_id' is not null and p_data->>'customer_id' !~ '^cus_[A-Za-z0-9]{1,200}$') then
  raise exception 'subscription_incident_invalid' using errcode='23514';end if;
 if kind='refund' and (
    p_data->>'status_at_event' not in ('pending','requires_action','succeeded','failed','canceled')
    or p_data->>'current_status' not in ('pending','requires_action','succeeded','failed','canceled')
    or (p_data->>'event_amount_cents')::integer<1
    or p_data->'event_amount_cents' is distinct from p_data->'current_amount_cents'
    or (p_data->>'current_amount_cents')::integer>amount
    or (event_type='refund.failed' and p_data->>'status_at_event'<>'failed')
    or jsonb_typeof(p_data->'event_amount_refunded_cents') is distinct from 'null')
  or kind='dispute' and (
    p_data->>'status_at_event' not in ('warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','won','lost')
    or p_data->>'current_status' not in ('warning_needs_response','warning_under_review','warning_closed','needs_response','under_review','won','lost')
    or (p_data->>'event_amount_cents')::integer<1 or (p_data->>'current_amount_cents')::integer<1
    or (event_type='charge.dispute.closed' and p_data->>'status_at_event' not in ('warning_closed','won','lost'))
    or jsonb_typeof(p_data->'event_amount_refunded_cents') is distinct from 'null')
  or kind='charge' and (
    p_data->>'status_at_event'<>'succeeded' or p_data->>'current_status'<>'succeeded'
    or not private.tc_subscription_incident_integer(p_data->'event_amount_refunded_cents',0,amount)
    or p_data->'event_amount_refunded_cents' is distinct from p_data->'event_amount_cents'
    or p_data->'current_amount_cents' is distinct from p_data->'charge_amount_refunded_cents')
 then raise exception 'subscription_incident_invalid' using errcode='23514';end if;

 -- Distinct tasks, not delivery count: several accepted events can bind one payment.
 select count(distinct x.id),min(x.id::text)::uuid into matches,task_uuid
 from private.tc_manual_subscription_invoice_tasks x
 join private.tc_manual_stripe_bridge_receipts r on r.task_id=x.id
 where x.provider_account_id=p_account and r.provider_account_id=p_account and r.mode=p_mode
  and ((invoice_id is null and x.provider_invoice_id is null and x.provider_payment_id=intent_id and r.payment_kind='initial_payment')
    or (invoice_id is not null and x.provider_invoice_id=invoice_id and x.provider_payment_id=invoice_id and r.payment_kind='subscription_invoice'));
 if matches<>1 or task_uuid is null then
  raise exception 'subscription_incident_mapping_review' using errcode='23514';end if;
 -- Same task lock order for provider deliveries; original rows are never updated.
 select * into t from private.tc_manual_subscription_invoice_tasks x where x.id=task_uuid for update;
 if t.amount_cents<>amount or t.currency<>'EUR' then
  raise exception 'subscription_incident_payment_mismatch' using errcode='23514';end if;
 if invoice_id is null then
  if jsonb_typeof(p_data->'subscription_id') is distinct from 'null'
   or jsonb_typeof(p_data->'invoice_payment_id') is distinct from 'null'
   or jsonb_typeof(p_data->'invoice_period_start') is distinct from 'null'
   or jsonb_typeof(p_data->'invoice_period_end') is distinct from 'null'
   or jsonb_typeof(p_data->'invoice_amount_cents') is distinct from 'null' then
   raise exception 'subscription_incident_payment_mismatch' using errcode='23514';end if;
 else
  if invoice_id !~ '^in_[A-Za-z0-9]{1,200}$'
   or p_data->>'subscription_id' is distinct from t.subscription_id
   or p_data->>'invoice_payment_id' is null or p_data->>'invoice_payment_id' !~ '^inpay_[A-Za-z0-9]{1,200}$'
   or not private.tc_subscription_incident_integer(p_data->'invoice_period_start',1,9007199254740991)
   or not private.tc_subscription_incident_integer(p_data->'invoice_period_end',1,9007199254740991)
   or not private.tc_subscription_incident_integer(p_data->'invoice_amount_cents',1,100000000)
   or (p_data->>'invoice_period_start')::bigint is distinct from extract(epoch from t.period_start)::bigint
   or (p_data->>'invoice_period_end')::bigint is distinct from extract(epoch from t.period_end)::bigint
   or (p_data->>'invoice_amount_cents')::integer<>t.amount_cents
   or not exists(select 1 from private.tc_subscription_invoices i
     join private.tc_billing_subscriptions b on b.provider_id=i.subscription_id
     where i.invoice_id=invoice_id and i.subscription_id=t.subscription_id and i.user_id=t.buyer_user_id
      and i.amount_cents=t.amount_cents and i.period_start=t.period_start and i.period_end=t.period_end
      and b.request_id=t.request_id and b.customer_id=p_data->>'customer_id') then
   raise exception 'subscription_incident_payment_mismatch' using errcode='23514';end if;
 end if;
 -- Only immutable event projection participates in idempotence. A later GET
 -- status/cumulative amount can change; it never rewrites an earlier observation.
 proof:=jsonb_build_object('account',p_account,'mode',p_mode,'event_id',p_data->'event_id',
  'event_type',event_type,'event_created',stamp,'currency','EUR','object_type',kind,'object_id',p_data->'object_id',
  'status_at_event',p_data->'status_at_event','event_amount_cents',p_data->'event_amount_cents',
  'event_amount_refunded_cents',p_data->'event_amount_refunded_cents','payment_intent_id',intent_id,
  'charge_id',charge_id,'invoice_id',invoice_id,'subscription_id',p_data->'subscription_id');
 digest:=encode(sha256(convert_to(proof::text,'UTF8')),'hex');
 select * into existing from private.tc_subscription_financial_entries where provider_event_id=p_data->>'event_id';
 select * into c from private.tc_subscription_financial_cases where task_id=t.id for update;
 if c.id is null then
  insert into private.tc_subscription_financial_cases(task_id,provider_account_id,mode,payment_intent_id,charge_id)
   values(t.id,p_account,p_mode,intent_id,charge_id) returning * into c;
 end if;
 if c.provider_account_id<>p_account or c.mode<>p_mode or c.payment_intent_id<>intent_id or c.charge_id<>charge_id then
  raise exception 'subscription_incident_payment_mismatch' using errcode='23514';end if;
 if existing.id is not null then
  if existing.case_id<>c.id or existing.event_proof_sha256<>digest then
   raise exception 'subscription_incident_conflicting_replay' using errcode='23514';end if;
  return jsonb_build_object('contract','subscription-financial-incidents-record-v1','received',true,'duplicate',true,'case_id',c.id);
 end if;
 select coalesce(max(row_version),1)+1 into version from private.tc_subscription_financial_entries where case_id=c.id;
 insert into private.tc_subscription_financial_entries(case_id,row_version,kind,provider_event_id,event_proof_sha256,data)
  values(c.id,version,'provider',p_data->>'event_id',digest,p_data);
 return jsonb_build_object('contract','subscription-financial-incidents-record-v1','received',true,'duplicate',false,'case_id',c.id);
end;$record$;

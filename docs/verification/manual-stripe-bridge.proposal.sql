-- REVIEW PROPOSAL ONLY. NOT a migration. Do not apply to production.
-- Requires the reviewed/final PR60 schema. No existing migration is modified.
-- Only an isolated acceptance database may enable mode=test. Live acceptance
-- requires separate owner/financial/fiscal approval; every channel starts absent.
create table private.tc_manual_stripe_channels (
  provider_account_id text not null check(provider_account_id ~ '^acct_[A-Za-z0-9]{1,100}$'),
  mode text not null check(mode in ('test','live')),
  enabled boolean not null default false,
  isolated_test_instance boolean not null default false,
  commercial_approved_at timestamptz,
  approval_reference text check(char_length(approval_reference) between 3 and 240),
  primary key(provider_account_id,mode),
  constraint tc_manual_stripe_channel_acceptance check (
    not enabled or
    (mode='test' and isolated_test_instance) or
    (mode='live' and commercial_approved_at is not null
      and isfinite(commercial_approved_at) and approval_reference is not null)
  )
);
create table private.tc_manual_stripe_bridge_receipts (
  provider_event_id text primary key check(provider_event_id ~ '^evt_[A-Za-z0-9]{1,200}$'),
  provider_account_id text not null,
  mode text not null check(mode in ('test','live')),
  payment_kind text not null check(payment_kind in ('initial_payment','subscription_invoice')),
  provider_payment_id text not null,
  request_id uuid not null references private.tc_payment_requests(id) on delete restrict,
  task_id uuid not null,
  proof_sha256 text not null check(proof_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  foreign key(provider_account_id,mode) references private.tc_manual_stripe_channels(provider_account_id,mode),
  foreign key(task_id,provider_account_id)
    references private.tc_manual_subscription_invoice_tasks(id,provider_account_id) on delete restrict
);
alter table private.tc_manual_stripe_channels enable row level security;
alter table private.tc_manual_stripe_bridge_receipts enable row level security;
create policy tc_manual_stripe_channels_no_client on private.tc_manual_stripe_channels
 as restrictive for all to public using(false) with check(false);
create policy tc_manual_stripe_receipts_no_client on private.tc_manual_stripe_bridge_receipts
 as restrictive for all to public using(false) with check(false);
revoke all on private.tc_manual_stripe_channels,private.tc_manual_stripe_bridge_receipts
 from public,anon,authenticated;
create trigger tc_manual_stripe_receipts_immutable
 before update or delete or truncate on private.tc_manual_stripe_bridge_receipts
 for each statement execute function private.tc_manual_subscription_intake_reject_mutation();

-- SECURITY INVOKER, service_role only. The trusted Edge adapter verifies raw
-- webhook HMAC and re-fetches Stripe objects before this call. This SQL function
-- does not authenticate Stripe and must never be granted to a browser role.
-- One RPC transaction covers billing, fiscal intake and append-only receipt.
create function public.tc_manual_subscription_apply_payment(
 p_kind text,p_account text,p_data jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $bridge$
#variable_conflict use_variable
declare
  r private.tc_payment_requests;
  c private.tc_customers;
  b private.tc_billing_subscriptions;
  i private.tc_subscription_invoices;
  t private.tc_manual_subscription_invoice_tasks;
  receipt private.tc_manual_stripe_bridge_receipts;
  channel private.tc_manual_stripe_channels;
  user_id uuid; request_id uuid; company_id uuid; org_count integer;
  amount integer; event_id text; payment_id text; checkout_id text;
  invoice_id text; subscription_id text; customer_id text; event_type text;
  mode text; paid_at timestamptz; start_at timestamptz; end_at timestamptz;
  current_end timestamptz; stamp bigint; task_id uuid; proof_hash text;
  prior_task boolean; prior_invoice boolean; current_event boolean;
begin
  if current_user<>'service_role' then
    raise exception 'manual_stripe_server_only' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('initial_payment','subscription_invoice')
    or p_account is null or p_account !~ '^acct_[A-Za-z0-9]{1,100}$'
    or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000
    or p_data->>'currency' is distinct from 'EUR'
    or jsonb_typeof(p_data->'livemode') is distinct from 'boolean'
  then raise exception 'manual_stripe_invalid' using errcode='22023'; end if;
  mode:=case when (p_data->>'livemode')::boolean then 'live' else 'test' end;
  select * into channel from private.tc_manual_stripe_channels x
    where x.provider_account_id=p_account and x.mode=mode;
  if not found or not channel.enabled
    or (mode='test' and not channel.isolated_test_instance)
    or (mode='live' and (channel.commercial_approved_at is null or channel.commercial_approved_at>now()))
  then raise exception 'manual_stripe_channel_disabled' using errcode='42501'; end if;
  begin
    user_id:=(p_data->>'user_id')::uuid;
    request_id:=(p_data->>'request_id')::uuid;
    amount:=(p_data->>'amount_cents')::integer;
    stamp:=(p_data->>'provider_event_created')::bigint;
    paid_at:=(p_data->>'paid_at')::timestamptz;
  exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'manual_stripe_invalid' using errcode='22023';
  end;
  event_id:=p_data->>'provider_event_id'; event_type:=p_data->>'provider_event_type';
  payment_id:=p_data->>'provider_payment_id';
  if user_id is null or request_id is null or amount is null or amount not between 100 and 100000000
    or stamp is null or stamp<1 or stamp>extract(epoch from now())+300
    or paid_at is null or not isfinite(paid_at) or paid_at>now()+interval '5 minutes'
    or event_type is null
    or event_id is null or event_id !~ '^evt_[A-Za-z0-9]{1,200}$'
    or payment_id is null or payment_id !~ '^(pi|in)_[A-Za-z0-9]{1,200}$'
  then raise exception 'manual_stripe_invalid' using errcode='22023'; end if;

  -- Match legacy recurring lock order (customer, then request) to avoid a
  -- request/customer deadlock between old and new provider deliveries.
  select * into c from private.tc_customers x where x.user_id=user_id for update;
  if not found then raise exception 'manual_stripe_order_unavailable' using errcode='23514'; end if;
  select * into r from private.tc_payment_requests x where x.id=request_id for update;
  if not found or r.user_id<>user_id or r.currency<>'EUR' or r.quoted_cents<>amount
    or r.status not in ('requested','checkout','paid')
    or r.net_cents is null or r.vat_rate_bps is null or r.vat_cents is null
  then raise exception 'manual_stripe_order_mismatch' using errcode='23514'; end if;
  select count(*),min(o.id::text)::uuid into org_count,company_id
    from public.organizations o where o.owner_id=user_id;
  if org_count<>1 or company_id is null
    or (p_data->>'company_id' is not null and (p_data->>'company_id')::uuid<>company_id)
  then raise exception 'manual_stripe_company_ambiguous' using errcode='23514'; end if;

  if p_kind='initial_payment' then
    checkout_id:=p_data->>'checkout_id';
    if payment_id !~ '^pi_[A-Za-z0-9]{1,200}$'
      or event_type not in ('checkout.session.completed','checkout.session.async_payment_succeeded')
      or checkout_id is null or checkout_id !~ '^cs_[A-Za-z0-9_]{1,200}$'
      or r.checkout_id is distinct from checkout_id
      or exists(select 1 from private.tc_billing_subscriptions x where x.request_id=r.id)
      or exists(select 1 from private.tc_subscription_orders x where x.request_id=r.id)
    then raise exception 'manual_stripe_checkout_mismatch' using errcode='23514'; end if;
  else
    invoice_id:=p_data->>'invoice_id'; subscription_id:=p_data->>'subscription_id';
    customer_id:=p_data->>'customer_id';
    begin
      start_at:=to_timestamp((p_data->>'invoice_period_start')::bigint);
      end_at:=to_timestamp((p_data->>'invoice_period_end')::bigint);
      current_end:=to_timestamp((p_data->>'subscription_current_period_end')::bigint);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'manual_stripe_invalid_period' using errcode='22023';
    end;
    if invoice_id is null or invoice_id !~ '^in_[A-Za-z0-9]{1,200}$' or payment_id<>invoice_id
      or subscription_id is null or subscription_id !~ '^sub_[A-Za-z0-9]{1,200}$'
      or customer_id is null or customer_id !~ '^cus_[A-Za-z0-9]{1,200}$'
      or event_type is distinct from 'invoice.paid'
      or p_data->>'billing_reason' is null or p_data->>'billing_reason' not in ('subscription_create','subscription_cycle')
      or jsonb_typeof(p_data->'cancel_at_period_end') is distinct from 'boolean'
      or p_data->>'subscription_state' is null
      or p_data->>'subscription_state' not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
      or start_at is null or end_at is null or not isfinite(start_at) or not isfinite(end_at)
      or end_at<start_at+interval '27 days' or end_at>start_at+interval '32 days'
      or end_at>now()+interval '62 days' or current_end is null or not isfinite(current_end)
      or current_end>now()+interval '62 days' or current_end<now()-interval '2 years'
      or (p_data->>'unit_amount')::integer is distinct from amount
    then raise exception 'manual_stripe_invalid_period' using errcode='23514'; end if;
    select * into b from private.tc_billing_subscriptions x where x.provider_id=subscription_id;
    if found then
      if b.user_id<>user_id or b.request_id<>r.id or b.customer_id<>customer_id
        or b.plan_id<>r.plan_id or b.monthly_cents<>amount or b.currency<>'EUR'
      then raise exception 'manual_stripe_subscription_mismatch' using errcode='23514'; end if;
    elsif not exists(select 1 from private.tc_subscription_orders x
      where x.user_id=user_id and x.request_id=r.id and x.checkout_id=r.checkout_id and x.checkout_id is not null) then
      raise exception 'manual_stripe_reservation_missing' using errcode='23514';
    end if;
    select * into i from private.tc_subscription_invoices x where x.invoice_id=invoice_id for update;
    prior_invoice:=found;
    if prior_invoice and (i.subscription_id<>subscription_id or i.user_id<>user_id or i.amount_cents<>amount
      or i.currency<>'EUR' or i.period_start<>start_at or i.period_end<>end_at)
    then raise exception 'manual_stripe_invoice_mismatch' using errcode='23514'; end if;
    if exists(select 1 from private.tc_subscription_events x where x.event_id=event_id
      and (x.subscription_id<>subscription_id or not prior_invoice)) then
      raise exception 'manual_stripe_event_conflict' using errcode='23514'; end if;
  end if;

  proof_hash:=encode(sha256(convert_to(jsonb_build_object(
    'kind',p_kind,'account',p_account,'mode',mode,'event',event_id,'type',event_type,'event_created',stamp,
    'payment',payment_id,'request',r.id,'user',r.user_id,'company',company_id,
    'amount',amount,'currency','EUR','paid_at',extract(epoch from paid_at),'checkout',checkout_id,
    'invoice',invoice_id,'subscription',subscription_id,'start',extract(epoch from start_at),'end',extract(epoch from end_at)
  )::text,'UTF8')),'hex');
  select * into receipt from private.tc_manual_stripe_bridge_receipts x where x.provider_event_id=event_id;
  if found then
    if receipt.proof_sha256<>proof_hash or receipt.provider_account_id<>p_account or receipt.mode<>mode then
      raise exception 'manual_stripe_event_conflict' using errcode='23514'; end if;
    return jsonb_build_object('contract','manual-stripe-payment-bridge-v1','received',true,'duplicate',true,'task_id',receipt.task_id);
  end if;

  select * into t from private.tc_manual_subscription_invoice_tasks x
    where x.provider_payment_id=payment_id;
  prior_task:=found;
  if prior_task and (t.provider_account_id<>p_account or t.request_id<>r.id
    or t.buyer_user_id<>r.user_id or t.buyer_company_id<>company_id or t.amount_cents<>amount)
  then raise exception 'manual_stripe_payment_conflict' using errcode='23514'; end if;

  if p_kind='initial_payment' then
    current_event:=exists(select 1 from private.tc_payment_events x where x.event_id=event_id);
    -- Legacy paid rows/events have no durable PI binding. Never extend a
    -- previously-paid request on the basis of a new, unattributed event.
    if not prior_task and (r.status='paid' or current_event) then
      raise exception 'manual_stripe_legacy_payment_review' using errcode='23514'; end if;
    if not prior_task then
      perform public.tc_platform_server('payment_event',jsonb_build_object(
        'event_id',event_id,'event_type',event_type,'user_id',r.user_id,'request_id',r.id,
        'amount_cents',amount,'currency','EUR'
      ));
    elsif current_event and not exists(select 1 from private.tc_manual_subscription_invoice_events x
      where x.provider_event_id=event_id and x.task_id=t.id and x.provider_account_id=p_account) then
      raise exception 'manual_stripe_event_conflict' using errcode='23514';
    else
      -- Register the new delivery also in the legacy dedup table, without
      -- re-running the licence extension for the same captured PI.
      insert into private.tc_payment_events(event_id,event_type) values(event_id,event_type) on conflict do nothing;
    end if;
    task_id:=private.tc_manual_subscription_invoice_intake(
      p_account,event_id,payment_id,r.id,company_id,amount,paid_at);
  else
    perform public.tc_recurring_billing('event',jsonb_build_object(
      'user_id',r.user_id,'request_id',r.id,'subscription_id',subscription_id,
      'customer_id',customer_id,'event_id',event_id,'event_type','invoice.paid','event_created',stamp,
      'state',p_data->>'subscription_state','cancel_at_period_end',(p_data->>'cancel_at_period_end')::boolean,
      'period_end',(p_data->>'subscription_current_period_end')::bigint,
      'unit_amount',amount,'currency','EUR','invoice_paid',true,
      'invoice_id',invoice_id,'invoice_amount',amount,
      'invoice_period_start',(p_data->>'invoice_period_start')::bigint,
      'invoice_period_end',(p_data->>'invoice_period_end')::bigint
    ));
    -- Compare against the actual persisted invoice, including duplicate paths.
    select * into i from private.tc_subscription_invoices x where x.invoice_id=invoice_id;
    if not found or i.subscription_id<>subscription_id or i.user_id<>r.user_id or i.amount_cents<>amount
      or i.currency<>'EUR' or i.period_start<>start_at or i.period_end<>end_at then
      raise exception 'manual_stripe_invoice_mismatch' using errcode='23514'; end if;
    task_id:=private.tc_manual_subscription_invoice_renewal_intake(
      p_account,event_id,invoice_id,subscription_id,company_id,amount,paid_at);
  end if;
  insert into private.tc_manual_stripe_bridge_receipts(
    provider_event_id,provider_account_id,mode,payment_kind,provider_payment_id,request_id,task_id,proof_sha256
  ) values(event_id,p_account,mode,p_kind,payment_id,r.id,task_id,proof_hash);
  return jsonb_build_object('contract','manual-stripe-payment-bridge-v1','received',true,'duplicate',prior_task,'task_id',task_id);
end;$bridge$;
revoke all on function public.tc_manual_subscription_apply_payment(text,text,jsonb) from public,anon,authenticated;
do $grants$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant select on private.tc_manual_stripe_channels to service_role;
  grant select,insert on private.tc_manual_stripe_bridge_receipts to service_role;
  -- FOR UPDATE in the existing private intake requires UPDATE privilege;
  -- its immutable trigger still rejects every actual UPDATE/DELETE/TRUNCATE.
  grant select,insert,update on private.tc_manual_subscription_invoice_tasks to service_role;
  grant select,insert on private.tc_manual_subscription_invoice_events to service_role;
  grant execute on function private.tc_manual_subscription_invoice_intake(text,text,text,uuid,uuid,integer,timestamptz),
    private.tc_manual_subscription_invoice_renewal_intake(text,text,text,text,uuid,integer,timestamptz),
    public.tc_manual_subscription_apply_payment(text,text,jsonb) to service_role;
 end if;
end;$grants$;

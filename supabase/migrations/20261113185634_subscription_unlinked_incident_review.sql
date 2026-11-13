-- CLI3.0.0-generated candidate, local only. No payment/licence/fiscal writes.
-- These ledgers retain canonical OWNED purchases awaiting the existing paid task.
create table private.tc_subscription_unlinked_cases(
 id uuid primary key default gen_random_uuid(),
 provider_account_id text not null,
 mode text not null check(mode in ('test','live')),
 request_id uuid not null references private.tc_payment_requests(id) on delete restrict,
 buyer_user_id uuid not null references auth.users(id) on delete restrict,
 buyer_company_id uuid not null references public.organizations(id) on delete restrict,
 checkout_id text not null check(checkout_id ~ '^cs_[A-Za-z0-9_]{1,200}$'),
 payment_intent_id text not null check(payment_intent_id ~ '^pi_[A-Za-z0-9]{1,200}$'),
 charge_id text not null check(charge_id ~ '^ch_[A-Za-z0-9]{1,200}$'),
 invoice_id text check(invoice_id ~ '^in_[A-Za-z0-9]{1,200}$'),
 subscription_id text check(subscription_id ~ '^sub_[A-Za-z0-9]{1,200}$'),
 period_start timestamptz,
 period_end timestamptz,
 amount_cents integer not null check(amount_cents between 100 and 100000000),
 currency text not null check(currency='EUR'),
 reason text not null default 'payment_task_missing' check(reason='payment_task_missing'),
 created_at timestamptz not null default now(),
 check((invoice_id is null)=(subscription_id is null)),
 check((invoice_id is null and period_start is null and period_end is null)
  or (invoice_id is not null and period_start is not null and period_end is not null
   and isfinite(period_start) and isfinite(period_end) and period_end>period_start)),
 unique(provider_account_id,mode,payment_intent_id),
 unique(provider_account_id,mode,charge_id),
 foreign key(provider_account_id,mode) references private.tc_manual_stripe_channels(provider_account_id,mode)
);
create table private.tc_subscription_unlinked_entries(
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references private.tc_subscription_unlinked_cases(id) on delete restrict,
 row_version bigint not null check(row_version between 2 and 9007199254740991),
 kind text not null check(kind in ('provider','linked','review','dismiss')),
 actor_id uuid references auth.users(id) on delete restrict,
 operation_id uuid unique,
 expected_version bigint,
 provider_event_id text unique check(provider_event_id ~ '^evt_[A-Za-z0-9]{1,200}$'),
 event_proof_sha256 text check(event_proof_sha256 ~ '^[a-f0-9]{64}$'),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=3500),
 created_at timestamptz not null default now(),
 unique(case_id,row_version),
 check((kind='provider' and actor_id is null and operation_id is null and expected_version is null
   and provider_event_id is not null and event_proof_sha256 is not null)
  or (kind='linked' and actor_id is null and operation_id is null and expected_version is not null and expected_version=row_version-1
   and provider_event_id is null and event_proof_sha256 is null)
  or (kind in ('review','dismiss') and actor_id is not null and operation_id is not null
   and expected_version is not null and expected_version=row_version-1 and provider_event_id is null and event_proof_sha256 is null))
);
create index tc_subscription_unlinked_entries_case_idx
 on private.tc_subscription_unlinked_entries(case_id,row_version desc);
create unique index tc_subscription_unlinked_once_linked
 on private.tc_subscription_unlinked_entries(case_id) where kind='linked';
alter table private.tc_subscription_unlinked_cases enable row level security;
alter table private.tc_subscription_unlinked_entries enable row level security;
revoke all on private.tc_subscription_unlinked_cases,private.tc_subscription_unlinked_entries from public,anon,authenticated;
create policy tc_subscription_unlinked_cases_private on private.tc_subscription_unlinked_cases
 as restrictive for all to public using(false) with check(false);
create policy tc_subscription_unlinked_entries_private on private.tc_subscription_unlinked_entries
 as restrictive for all to public using(false) with check(false);
create trigger tc_subscription_unlinked_cases_immutable
 before update or delete or truncate on private.tc_subscription_unlinked_cases
 for each statement execute function private.tc_manual_subscription_intake_reject_mutation();
create trigger tc_subscription_unlinked_entries_immutable
 before update or delete or truncate on private.tc_subscription_unlinked_entries
 for each statement execute function private.tc_manual_subscription_intake_reject_mutation();

create function private.tc_subscription_unlinked_case_dto(p_case uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $dto$
declare c private.tc_subscription_unlinked_cases;observed private.tc_subscription_unlinked_entries;
 acted private.tc_subscription_unlinked_entries;linked private.tc_subscription_unlinked_entries;version bigint;changed bigint;
begin
 select * into c from private.tc_subscription_unlinked_cases where id=p_case;
 select * into observed from private.tc_subscription_unlinked_entries where case_id=p_case and kind='provider' order by row_version desc limit 1;
 select * into acted from private.tc_subscription_unlinked_entries where case_id=p_case and kind in ('review','dismiss') order by row_version desc limit 1;
 select * into linked from private.tc_subscription_unlinked_entries where case_id=p_case and kind='linked';
 select max(row_version) into version from private.tc_subscription_unlinked_entries where case_id=p_case;
 if c.id is null or observed.id is null then raise exception 'unlinked_incident_not_found' using errcode='42501';end if;
 changed:=greatest(observed.row_version,coalesce(linked.row_version,0));
 return jsonb_build_object('id',c.id,'request_id',c.request_id,'buyer_company_id',c.buyer_company_id,
  'checkout_id',c.checkout_id,'payment_intent_id',c.payment_intent_id,'charge_id',c.charge_id,
  'invoice_id',c.invoice_id,'subscription_id',c.subscription_id,'period_start',c.period_start,'period_end',c.period_end,'amount_cents',c.amount_cents,
  'currency',c.currency,'reason',c.reason,'row_version',version,'created_at',c.created_at,
  'review_state',case when coalesce(acted.row_version,0)<=changed then 'pending' when acted.kind='dismiss' then 'dismissed' else 'reviewed' end,
  'link_state',case when linked.id is null then 'unlinked' else 'linked_to_existing_payment' end,
  'latest_provider',observed.data,'last_action',case when acted.id is null then null else
   jsonb_build_object('kind',acted.kind,'actor_id',acted.actor_id,'row_version',acted.row_version,'created_at',acted.created_at,
    'reason',acted.data->>'reason','evidence_reference',acted.data->>'evidence_reference') end,
  'link',case when linked.id is null then null else linked.data||jsonb_build_object('row_version',linked.row_version,'created_at',linked.created_at) end);
end;$dto$;
revoke all on function private.tc_subscription_unlinked_case_dto(uuid) from public,anon,authenticated;

-- Administrative link only. The receipt contains invoice_id for monthly
-- payments, not a newly invented PI/charge proof. Their canonical association
-- comes from the immutable queued provider observation accepted earlier.
create function private.tc_subscription_unlinked_link_receipt(p_receipt private.tc_manual_stripe_bridge_receipts)
returns void language plpgsql security definer set search_path='' as $link$
declare c private.tc_subscription_unlinked_cases;t private.tc_manual_subscription_invoice_tasks;
 r private.tc_payment_requests;observed private.tc_subscription_unlinked_entries;
 matches integer;candidate uuid;version bigint;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'unlinked_incident_server_only' using errcode='42501';end if;
 select count(*),min(x.id::text)::uuid into matches,candidate
  from private.tc_subscription_unlinked_cases x
  where x.provider_account_id=p_receipt.provider_account_id and x.mode=p_receipt.mode
   and ((p_receipt.payment_kind='initial_payment' and x.invoice_id is null and x.payment_intent_id=p_receipt.provider_payment_id)
    or (p_receipt.payment_kind='subscription_invoice' and x.invoice_id=p_receipt.provider_payment_id));
 -- Ambiguity is visible for human review; never block a genuine paid receipt.
 if matches<>1 or candidate is null then return;end if;
 select * into t from private.tc_manual_subscription_invoice_tasks x where x.id=p_receipt.task_id;
 select * into r from private.tc_payment_requests x where x.id=p_receipt.request_id;
 select * into c from private.tc_subscription_unlinked_cases x where x.id=candidate for update;
 if c.id is null or t.id is null or r.id is null or r.status<>'paid' or r.currency<>'EUR'
  or t.provider_account_id<>p_receipt.provider_account_id or t.request_id<>r.id or t.buyer_user_id<>r.user_id
  or c.provider_account_id<>p_receipt.provider_account_id or c.mode<>p_receipt.mode
  or c.request_id<>r.id or c.buyer_user_id<>r.user_id or c.buyer_company_id<>t.buyer_company_id
  or c.checkout_id is distinct from r.checkout_id or c.amount_cents<>r.quoted_cents or c.amount_cents<>t.amount_cents
  or c.currency<>'EUR' or t.currency<>'EUR'
  or c.invoice_id is distinct from t.provider_invoice_id or c.subscription_id is distinct from t.subscription_id
  or c.period_start is distinct from t.period_start or c.period_end is distinct from t.period_end
  or t.provider_payment_id is distinct from p_receipt.provider_payment_id
  or exists(select 1 from private.tc_subscription_unlinked_entries x where x.case_id=c.id and x.kind='linked') then return;end if;
 select * into observed from private.tc_subscription_unlinked_entries x
  where x.case_id=c.id and x.kind='provider' order by x.row_version desc limit 1;
 if observed.id is null then return;end if;
 select max(x.row_version) into version from private.tc_subscription_unlinked_entries x where x.case_id=c.id;
 insert into private.tc_subscription_unlinked_entries(case_id,row_version,kind,expected_version,data)
  values(c.id,version+1,'linked',version,jsonb_build_object('task_id',t.id,
   'receipt_event_id',p_receipt.provider_event_id,'queued_event_id',observed.provider_event_id));
end;$link$;
revoke all on function private.tc_subscription_unlinked_link_receipt(private.tc_manual_stripe_bridge_receipts) from public,anon,authenticated;
create function private.tc_subscription_unlinked_receipt_inserted() returns trigger
language plpgsql security definer set search_path='' as $trigger$
begin
 -- Historical privileged SQL fixtures are not provider receipts and confer no
 -- linking authority. Normal browser roles cannot INSERT the private ledger.
 if current_setting('role',true)='service_role' then
  perform private.tc_subscription_unlinked_link_receipt(new);
 end if;
 return new;
end;$trigger$;
revoke all on function private.tc_subscription_unlinked_receipt_inserted() from public,anon,authenticated;
create trigger tc_subscription_unlinked_receipt_inserted after insert on private.tc_manual_stripe_bridge_receipts
 for each row execute function private.tc_subscription_unlinked_receipt_inserted();

-- A single transaction either uses the old verified ledger or records a private
-- review receipt. Missing/foreign/ambiguous ownership never produces an ACK.
create function private.tc_subscription_incident_ingest(p_account text,p_mode text,p_data jsonb,p_binding jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $ingest$
#variable_conflict use_variable
declare c private.tc_subscription_unlinked_cases;existing private.tc_subscription_unlinked_entries;
 r private.tc_payment_requests;t private.tc_manual_subscription_invoice_tasks;native_case private.tc_subscription_financial_cases;
 result jsonb;missing boolean:=false;proof jsonb;digest text;summary jsonb;version bigint;company_id uuid;owners integer;
 buyer uuid;request_id uuid;checkout_id text;binding_mode text;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'unlinked_incident_server_only' using errcode='42501';end if;
 -- The original function validates the provider envelope, object and amounts
 -- before mapping; native ownership and remaining period checks follow below.
 -- Any error other than exactly missing mapping is retained, never quarantined.
 begin
  result:=private.tc_manual_subscription_record_incident(p_account,p_mode,p_data);
 exception when check_violation then
  if sqlerrm<>'subscription_incident_mapping_review' then raise;end if;
  missing:=true;
 end;
 proof:=jsonb_build_object('account',p_account,'mode',p_mode,'event_id',p_data->'event_id',
  'event_type',p_data->'event_type','event_created',(p_data->>'event_created')::bigint,'currency','EUR',
  'object_type',p_data->'object_type','object_id',p_data->'object_id','status_at_event',p_data->'status_at_event',
  'event_amount_cents',p_data->'event_amount_cents','event_amount_refunded_cents',p_data->'event_amount_refunded_cents',
  'payment_intent_id',p_data->'payment_intent_id','charge_id',p_data->'charge_id',
  'invoice_id',p_data->'invoice_id','subscription_id',p_data->'subscription_id');
 digest:=encode(sha256(convert_to(proof::text,'UTF8')),'hex');
 select * into existing from private.tc_subscription_unlinked_entries where provider_event_id=p_data->>'event_id';
 if found and existing.event_proof_sha256<>digest then
  raise exception 'unlinked_incident_conflicting_replay' using errcode='23514';end if;
 select * into c from private.tc_subscription_unlinked_cases x
  where x.provider_account_id=p_account and x.mode=p_mode and x.payment_intent_id=p_data->>'payment_intent_id';

 if missing and existing.id is not null then
  if existing.case_id is distinct from c.id then raise exception 'unlinked_incident_conflicting_replay' using errcode='23514';end if;
  return jsonb_build_object('contract','subscription-incident-ingest-v1','recorded',true,'target','quarantined','duplicate',true,'case_id',c.id);
 end if;
 if missing then
  if p_binding is null then return jsonb_build_object('contract','subscription-incident-ingest-v1','recorded',false,'ownership_required',true);end if;
  if jsonb_typeof(p_binding) is distinct from 'object' or octet_length(p_binding::text)>1500
   or p_binding-array['request_id','user_id','checkout_id','mode']<>'{}'
   or not(p_binding ?& array['request_id','user_id','checkout_id','mode'])
   or p_binding->>'request_id' is null or p_binding->>'user_id' is null
   or p_binding->>'checkout_id' is null or p_binding->>'checkout_id' !~ '^cs_[A-Za-z0-9_]{1,200}$'
   or p_binding->>'mode' is null or p_binding->>'mode' not in ('payment','subscription') then
   raise exception 'unlinked_incident_ownership_invalid' using errcode='22023';end if;
  begin buyer:=(p_binding->>'user_id')::uuid;request_id:=(p_binding->>'request_id')::uuid;
  exception when invalid_text_representation then raise exception 'unlinked_incident_ownership_invalid' using errcode='22023';end;
  checkout_id:=p_binding->>'checkout_id';binding_mode:=p_binding->>'mode';
  -- Same lock order as the payment bridge: customer, request, then task/case.
  perform 1 from private.tc_customers where user_id=buyer for update;
  if not found then raise exception 'unlinked_incident_ownership_missing' using errcode='23514';end if;
  select * into r from private.tc_payment_requests where id=request_id for update;
  if not found or r.user_id<>buyer or r.checkout_id is distinct from checkout_id
   or r.currency<>'EUR' or r.quoted_cents is distinct from (p_data->>'charge_amount_cents')::integer
   or not exists(select 1 from private.tc_manual_stripe_channels ch where ch.provider_account_id=p_account
    and ch.mode=p_mode and (p_mode='live' or ch.isolated_test_instance)) then
   raise exception 'unlinked_incident_ownership_missing' using errcode='23514';end if;
  select count(*),min(o.id::text)::uuid into owners,company_id from public.organizations o where o.owner_id=buyer;
  if owners<>1 or company_id is null then raise exception 'unlinked_incident_ownership_missing' using errcode='23514';end if;
  if binding_mode='payment' then
   if p_data->>'invoice_id' is not null or p_data->>'subscription_id' is not null
    or p_data->>'invoice_payment_id' is not null or p_data->>'invoice_period_start' is not null
    or p_data->>'invoice_period_end' is not null or p_data->>'invoice_amount_cents' is not null
    or exists(select 1 from private.tc_subscription_orders o where o.request_id=r.id)
    or exists(select 1 from private.tc_billing_subscriptions b where b.request_id=r.id) then
    raise exception 'unlinked_incident_ownership_missing' using errcode='23514';end if;
  else
   if p_data->>'invoice_id' is null or p_data->>'invoice_id' !~ '^in_[A-Za-z0-9]{1,200}$'
    or p_data->>'subscription_id' is null or p_data->>'subscription_id' !~ '^sub_[A-Za-z0-9]{1,200}$'
    or p_data->>'invoice_payment_id' is null or p_data->>'invoice_payment_id' !~ '^inpay_[A-Za-z0-9]{1,200}$'
    or not private.tc_subscription_incident_integer(p_data->'invoice_period_start',1,9007199254740991)
    or not private.tc_subscription_incident_integer(p_data->'invoice_period_end',1,9007199254740991)
    or (p_data->>'invoice_period_end')::bigint<=(p_data->>'invoice_period_start')::bigint
    or not private.tc_subscription_incident_integer(p_data->'invoice_amount_cents',100,100000000)
    or (p_data->>'invoice_amount_cents')::integer is distinct from r.quoted_cents
    or not (exists(select 1 from private.tc_subscription_orders o where o.request_id=r.id and o.user_id=buyer and o.checkout_id=checkout_id)
     or exists(select 1 from private.tc_billing_subscriptions b where b.request_id=r.id and b.user_id=buyer
      and b.provider_id=p_data->>'subscription_id' and b.customer_id=p_data->>'customer_id')) then
    raise exception 'unlinked_incident_ownership_missing' using errcode='23514';end if;
  end if;
  -- A paid webhook may have committed while ownership was fetched. Recheck
  -- under native-order locks and use only its actual existing task/receipt.
  begin
   result:=private.tc_manual_subscription_record_incident(p_account,p_mode,p_data);missing:=false;
  exception when check_violation then
   if sqlerrm<>'subscription_incident_mapping_review' then raise;end if;
  end;
  if missing then
   select * into c from private.tc_subscription_unlinked_cases x
    where x.provider_account_id=p_account and x.mode=p_mode and x.payment_intent_id=p_data->>'payment_intent_id' for update;
   if c.id is null then
    insert into private.tc_subscription_unlinked_cases(provider_account_id,mode,request_id,buyer_user_id,buyer_company_id,
     checkout_id,payment_intent_id,charge_id,invoice_id,subscription_id,period_start,period_end,amount_cents,currency)
    values(p_account,p_mode,r.id,buyer,company_id,checkout_id,p_data->>'payment_intent_id',p_data->>'charge_id',
     p_data->>'invoice_id',p_data->>'subscription_id',to_timestamp((p_data->>'invoice_period_start')::bigint),
     to_timestamp((p_data->>'invoice_period_end')::bigint),(p_data->>'charge_amount_cents')::integer,'EUR') returning * into c;
   end if;
   if c.request_id<>r.id or c.buyer_user_id<>buyer or c.buyer_company_id<>company_id or c.checkout_id<>checkout_id
    or c.charge_id<>p_data->>'charge_id' or c.invoice_id is distinct from p_data->>'invoice_id'
    or c.subscription_id is distinct from p_data->>'subscription_id' or c.amount_cents<>r.quoted_cents
    or c.period_start is distinct from to_timestamp((p_data->>'invoice_period_start')::bigint)
    or c.period_end is distinct from to_timestamp((p_data->>'invoice_period_end')::bigint) then
    raise exception 'unlinked_incident_ownership_conflict' using errcode='23514';end if;
   select * into existing from private.tc_subscription_unlinked_entries where provider_event_id=p_data->>'event_id';
   if existing.id is not null then
    if existing.case_id<>c.id or existing.event_proof_sha256<>digest then raise exception 'unlinked_incident_conflicting_replay' using errcode='23514';end if;
   else
    select coalesce(max(row_version),1)+1 into version from private.tc_subscription_unlinked_entries where case_id=c.id;
    summary:=jsonb_build_object('event_id',p_data->'event_id','event_type',p_data->'event_type',
     'event_created',to_timestamp((p_data->>'event_created')::bigint),'object_type',p_data->'object_type','object_id',p_data->'object_id',
     'status_at_event',p_data->'status_at_event','current_status',p_data->'current_status',
     'event_amount_cents',p_data->'event_amount_cents','current_amount_cents',p_data->'current_amount_cents',
     'charge_amount_refunded_cents',p_data->'charge_amount_refunded_cents');
    insert into private.tc_subscription_unlinked_entries(case_id,row_version,kind,provider_event_id,event_proof_sha256,data)
     values(c.id,version,'provider',p_data->>'event_id',digest,summary);
   end if;
   return jsonb_build_object('contract','subscription-incident-ingest-v1','recorded',true,'target','quarantined','duplicate',existing.id is not null,'case_id',c.id);
  end if;
 end if;
 -- Original64 accepted the real paid task. Preserve and audit the link to any
 -- earlier quarantine; no payment, licence, fiscal task or invoice is invented.
 select * into native_case from private.tc_subscription_financial_cases where id=(result->>'case_id')::uuid;
 select * into t from private.tc_manual_subscription_invoice_tasks where id=native_case.task_id;
 select * into c from private.tc_subscription_unlinked_cases x
  where x.provider_account_id=p_account and x.mode=p_mode and x.payment_intent_id=p_data->>'payment_intent_id' for update;
 if c.id is not null then
  if c.request_id<>t.request_id or c.buyer_user_id<>t.buyer_user_id or c.buyer_company_id<>t.buyer_company_id
   or c.charge_id<>native_case.charge_id or c.amount_cents<>t.amount_cents then
   raise exception 'unlinked_incident_ownership_conflict' using errcode='23514';end if;
  -- This path covers an existing receipt seen before queue creation, or a
  -- subsequent canonical incident. The same guarded helper is used by INSERT.
  perform private.tc_subscription_unlinked_link_receipt(receipt)
   from private.tc_manual_stripe_bridge_receipts receipt where receipt.task_id=t.id
    and receipt.provider_account_id=p_account and receipt.mode=p_mode
   order by receipt.created_at,receipt.provider_event_id limit 1;
 end if;
 return jsonb_build_object('contract','subscription-incident-ingest-v1','recorded',true,'target','linked','duplicate',(result->>'duplicate')::boolean,'case_id',native_case.id);
end;$ingest$;
revoke all on function private.tc_subscription_incident_ingest(text,text,jsonb,jsonb) from public,anon,authenticated;
create function public.tc_subscription_incident_ingest(p_account text,p_mode text,p_data jsonb,p_binding jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$select private.tc_subscription_incident_ingest(p_account,p_mode,p_data,p_binding)$$;
revoke all on function public.tc_subscription_incident_ingest(text,text,jsonb,jsonb) from public,anon,authenticated;

create function private.tc_admin_subscription_unlinked(p_action text,p_case_id uuid default null,p_expected bigint default null,
 p_operation_id uuid default null,p_data jsonb default '{}',p_after uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $admin$
declare actor uuid;c private.tc_subscription_unlinked_cases;e private.tc_subscription_unlinked_entries;
 rows jsonb;tail uuid;version bigint;before_version bigint;
begin
 actor:=private.tc_manual_subscription_operator();
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>3000 then
  raise exception 'unlinked_incident_invalid' using errcode='22023';end if;
 if p_action='capabilities' then return jsonb_build_object('contract','subscription-unlinked-incidents-v1','available',true,
  'payment_changes_available',false,'license_changes_available',false,'fiscal_emission_available',false);end if;
 if p_action in ('list','detail') then
  if p_data<>'{}' or (p_action='detail' and p_case_id is null) then raise exception 'unlinked_incident_invalid' using errcode='22023';end if;
  select coalesce(jsonb_agg(private.tc_subscription_unlinked_case_dto(q.id) order by q.id),'[]') into rows
   from (select id from private.tc_subscription_unlinked_cases where (p_action<>'detail' or id=p_case_id)
    and (p_after is null or id>p_after) order by id limit 50) q;
  tail:=case when jsonb_array_length(rows)=50 then (rows->49->>'id')::uuid else null end;
  return jsonb_build_object('contract','subscription-unlinked-incidents-v1','items',rows,'next_cursor',tail);
 end if;
 if p_action='history' then
  if p_case_id is null or p_data-array['before_version']<>'{}'
   or (p_data ? 'before_version' and not private.tc_subscription_incident_integer(p_data->'before_version',2,9007199254740991))
   or not exists(select 1 from private.tc_subscription_unlinked_cases where id=p_case_id) then
   raise exception 'unlinked_incident_invalid' using errcode='22023';end if;
  before_version:=(p_data->>'before_version')::bigint;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'row_version',q.row_version,'kind',q.kind,'actor_id',q.actor_id,
   'created_at',q.created_at,'data',q.data) order by q.row_version desc),'[]') into rows
   from (select * from private.tc_subscription_unlinked_entries where case_id=p_case_id
    and (before_version is null or row_version<before_version) order by row_version desc limit 50) q;
  return jsonb_build_object('contract','subscription-unlinked-incidents-v1','case_id',p_case_id,'items',rows,
   'next_before_version',case when jsonb_array_length(rows)=50 then (rows->49->>'row_version')::bigint else null end);
 end if;
 if p_action is null or p_action not in ('review','dismiss') or p_case_id is null or p_operation_id is null
  or p_expected is null or p_expected<2 or p_expected>=9007199254740991
  or p_data-array['reason','evidence_reference']<>'{}' or not(p_data ?& array['reason','evidence_reference'])
  or jsonb_typeof(p_data->'reason') is distinct from 'string' or jsonb_typeof(p_data->'evidence_reference') is distinct from 'string'
  or char_length(p_data->>'reason') not between 3 and 1000 or char_length(p_data->>'evidence_reference') not between 3 and 240
  or p_data->>'reason' ~ '[[:cntrl:]]' or p_data->>'evidence_reference' ~ '[[:cntrl:]]'
  or p_data->>'reason'<>btrim(p_data->>'reason') or p_data->>'evidence_reference'<>btrim(p_data->>'evidence_reference') then
  raise exception 'unlinked_incident_invalid' using errcode='22023';end if;
 select * into c from private.tc_subscription_unlinked_cases where id=p_case_id for update;
 if not found then raise exception 'unlinked_incident_not_found' using errcode='42501';end if;
 actor:=private.tc_manual_subscription_operator();
 select * into e from private.tc_subscription_unlinked_entries where operation_id=p_operation_id;
 if e.id is not null then
  if e.case_id<>c.id or e.actor_id<>actor or e.kind<>p_action or e.expected_version<>p_expected or e.data<>p_data then
   raise exception 'unlinked_incident_conflicting_replay' using errcode='23514';end if;
 else
  select max(row_version) into version from private.tc_subscription_unlinked_entries where case_id=c.id;
  if version<>p_expected then raise exception 'unlinked_incident_version_conflict' using errcode='40001';end if;
  insert into private.tc_subscription_unlinked_entries(case_id,row_version,kind,actor_id,operation_id,expected_version,data)
   values(c.id,version+1,p_action,actor,p_operation_id,version,p_data) returning * into e;
 end if;
 return jsonb_build_object('contract','subscription-unlinked-incidents-v1','case',private.tc_subscription_unlinked_case_dto(c.id),
  'operation',jsonb_build_object('id',e.operation_id,'action',e.kind,'actor_id',e.actor_id,
   'expected_version',e.expected_version,'applied_version',e.row_version,'reason',e.data->>'reason','evidence_reference',e.data->>'evidence_reference'));
end;$admin$;
revoke all on function private.tc_admin_subscription_unlinked(text,uuid,bigint,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.tc_admin_subscription_unlinked(text,uuid,bigint,uuid,jsonb,uuid) to authenticated;
create function public.tc_admin_subscription_unlinked(p_action text,p_case_id uuid default null,p_expected bigint default null,
 p_operation_id uuid default null,p_data jsonb default '{}',p_after uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select private.tc_admin_subscription_unlinked(p_action,p_case_id,p_expected,p_operation_id,p_data,p_after)$$;
revoke all on function public.tc_admin_subscription_unlinked(text,uuid,bigint,uuid,jsonb,uuid) from public,anon;
grant execute on function public.tc_admin_subscription_unlinked(text,uuid,bigint,uuid,jsonb,uuid) to authenticated;
do $service_grants$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  revoke all on private.tc_subscription_unlinked_cases,private.tc_subscription_unlinked_entries from service_role;
  revoke all on function private.tc_subscription_unlinked_case_dto(uuid),
   private.tc_subscription_unlinked_link_receipt(private.tc_manual_stripe_bridge_receipts),
   private.tc_subscription_unlinked_receipt_inserted(),
   private.tc_admin_subscription_unlinked(text,uuid,bigint,uuid,jsonb,uuid),
   public.tc_admin_subscription_unlinked(text,uuid,bigint,uuid,jsonb,uuid) from service_role;
  grant execute on function private.tc_subscription_incident_ingest(text,text,jsonb,jsonb),
   public.tc_subscription_incident_ingest(text,text,jsonb,jsonb) to service_role;
 end if;
end;$service_grants$;

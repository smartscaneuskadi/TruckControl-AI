-- Candidate only (2026-11-08). NOT applied to the remote database.
-- Durable, fail-closed intake for GDTaller/TicketBAI MANUAL subscription invoices.
-- No client API, Stripe handler, email, fiscal issuer, payment enablement or uploads.
-- A future trusted server must verify Stripe signatures and reconcile paid orders
-- BEFORE calling the private function. This function does not verify webhooks.
create table private.tc_manual_subscription_invoice_tasks (
  id uuid primary key default gen_random_uuid(),
  provider_account_id text not null
    check (provider_account_id ~ '^acct_[A-Za-z0-9]{1,100}$'),
  provider_payment_id text not null
    check (provider_payment_id ~ '^(in|pi|cs)_[A-Za-z0-9_]{1,200}$'),
  request_id uuid not null references private.tc_payment_requests(id) on delete restrict,
  -- Recurring invoices have their own identity, including the first paid month.
  provider_invoice_id text unique references private.tc_subscription_invoices(invoice_id) on delete restrict,
  subscription_id text references private.tc_billing_subscriptions(provider_id) on delete restrict,
  period_start timestamptz,
  period_end timestamptz,
  constraint tc_manual_subscription_period_identity check (
    (provider_invoice_id is null and subscription_id is null and period_start is null and period_end is null)
    or (provider_invoice_id is not null and provider_payment_id=provider_invoice_id
      and subscription_id is not null and period_start is not null and period_end is not null
      and isfinite(period_start) and isfinite(period_end)
      and period_end>period_start)
  ),
  buyer_user_id uuid not null references private.tc_customers(user_id) on delete restrict,
  buyer_company_id uuid not null references public.organizations(id) on delete restrict,
  -- Immutable at intake time; never compose a later invoice from mutable buyer
  -- profile or the current plan catalogue. Private and NEVER client-exported.
  buyer_company_name text not null check (char_length(btrim(buyer_company_name)) between 2 and 100),
  buyer_tax_id text not null check (char_length(btrim(buyer_tax_id)) between 3 and 30),
  buyer_address text not null check (char_length(btrim(buyer_address)) between 5 and 240),
  buyer_email text not null check (char_length(btrim(buyer_email)) between 3 and 320),
  -- Provenance is NOT checkout acceptance: the buyer snapshot is read from
  -- the live customer profile during intake. Require independent fiscal
  -- verification by an operator before invoice issue.
  buyer_snapshot_origin text not null default 'profile_at_intake'
    check (buyer_snapshot_origin='profile_at_intake'),
  buyer_request_created_at timestamptz not null,
  buyer_profile_updated_at timestamptz not null,
  buyer_profile_changed_after_request boolean not null,
  plan_id text not null,
  plan_revision bigint not null,
  net_cents integer not null check (net_cents between 100 and 100000000),
  vat_rate_bps integer not null check (vat_rate_bps between 0 and 10000),
  vat_cents integer not null check (vat_cents between 0 and 100000000),
  amount_cents integer not null check (amount_cents between 100 and 100000000),
  constraint tc_manual_subscription_quote_matches check (
    net_cents+vat_cents=amount_cents
    and vat_cents=((net_cents::bigint*vat_rate_bps+5000)/10000)::integer
  ),
  currency text not null default 'EUR' check (currency='EUR'),
  paid_at timestamptz not null,
  status text not null default 'awaiting_issue' check (status='awaiting_issue'),
  row_version bigint not null default 1 check (row_version=1),
  created_at timestamptz not null default now(),
  -- One-off purchases use a partial unique request index. Subscription invoices
  -- below each retain their own canonical provider invoice and recorded period.
  -- Composite key also enforces that every event belongs to the same Stripe
  -- merchant account as its invoice task, even for privileged direct writes.
  constraint tc_manual_subscription_task_account_unique unique (id, provider_account_id),
  constraint tc_manual_subscription_payment_unique unique (provider_account_id,provider_payment_id),
  constraint tc_manual_subscription_payment_global_unique unique (provider_payment_id)
);
-- One-off purchases stay unique; subscription periods are unique by invoice_id.
create unique index tc_manual_subscription_request_unique
  on private.tc_manual_subscription_invoice_tasks(request_id) where provider_invoice_id is null;
create index tc_manual_subscription_pending_idx
  on private.tc_manual_subscription_invoice_tasks (created_at,id);

-- Unique provider events: one webhook event cannot be applied to two payments.
-- This is NOT an outbound email log and is never exported to client caches.
create table private.tc_manual_subscription_invoice_events (
  provider_account_id text not null,
  provider_event_id text not null check (provider_event_id ~ '^evt_[A-Za-z0-9]{1,200}$'),
  task_id uuid not null,
  recorded_at timestamptz not null default now(),
  primary key (provider_account_id,provider_event_id),
  -- Conservative fail-closed rule: reuse of an evt ID across accounts must
  -- enter manual review, not create a second recorded provider event.
  constraint tc_manual_subscription_event_global_unique unique (provider_event_id),
  constraint tc_manual_subscription_event_task_account_fk
    foreign key (task_id,provider_account_id)
    references private.tc_manual_subscription_invoice_tasks(id,provider_account_id)
    on delete restrict
);

alter table private.tc_manual_subscription_invoice_tasks enable row level security;
alter table private.tc_manual_subscription_invoice_events enable row level security;
revoke all on private.tc_manual_subscription_invoice_tasks,
  private.tc_manual_subscription_invoice_events from public,anon,authenticated;
create policy tc_manual_invoice_tasks_server_only
 on private.tc_manual_subscription_invoice_tasks as restrictive
 for all to public using (false) with check (false);
create policy tc_manual_invoice_events_server_only
 on private.tc_manual_subscription_invoice_events as restrictive
 for all to public using (false) with check (false);

-- Privileged, private-schema building block: not exposed via PostgREST.
-- No GRANT EXECUTE to any HTTP/JWT role. Call through a separately reviewed
-- signed-webhook adapter only after external confirmation has settled.
create function private.tc_manual_subscription_invoice_intake(
  p_account text,p_event text,p_payment text,p_request uuid,
  p_company uuid,p_amount integer,p_paid_at timestamptz
) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
  request_row private.tc_payment_requests;
  customer_row private.tc_customers;
  task_row private.tc_manual_subscription_invoice_tasks;
  bound_event uuid;
  org_count integer;
begin
  if p_account is null or p_account !~ '^acct_[A-Za-z0-9]{1,100}$'
    or p_event is null or p_event !~ '^evt_[A-Za-z0-9]{1,200}$'
    or p_payment is null or p_payment !~ '^(in|pi|cs)_[A-Za-z0-9_]{1,200}$'
    or p_request is null or p_company is null
    or p_amount is null or p_amount not between 100 and 100000000
    or p_paid_at is null or not isfinite(p_paid_at) or p_paid_at>now()+interval '5 minutes'
  then raise exception 'manual_invoice_intake_invalid' using errcode='22023'; end if;

  -- Serializes intakes referring to the same purchase. This is NOT a payment
  -- confirmation: the existing payment row must already be marked paid.
  select * into request_row from private.tc_payment_requests
    where id=p_request for update;
  if not found or request_row.status<>'paid'
    or request_row.currency<>'EUR' or request_row.quoted_cents<>p_amount
  then raise exception 'manual_invoice_unreconciled_payment'
    using errcode='23514'; end if;


  -- Historical quotes with unknown tax components cannot be inferred from
  -- today's plan, or represented as a valid fiscal task. Escalate to operator.
  if request_row.net_cents is null or request_row.vat_rate_bps is null
    or request_row.vat_cents is null
  then raise exception 'manual_invoice_tax_quote_missing'
    using errcode='23514'; end if;

  if exists(select 1 from private.tc_billing_subscriptions where request_id=p_request) then
    raise exception 'manual_invoice_recurring_requires_invoice_identity' using errcode='23514';
  end if;

  -- The customer snapshot is captured at trusted intake, NOT retroactively
  -- claimed to be proof of the details shown at checkout. This must be checked
  -- by an operator before manual issue, especially on delayed webhooks.
  select * into customer_row from private.tc_customers where user_id=request_row.user_id;
  if not found or char_length(btrim(customer_row.company_name)) not between 2 and 100
    or char_length(btrim(customer_row.tax_id)) not between 3 and 30
    or char_length(btrim(customer_row.address)) not between 5 and 240
    or char_length(btrim(customer_row.email)) not between 3 and 320
  then raise exception 'manual_invoice_buyer_details_missing'
    using errcode='23514'; end if;

  -- Do not guess which company paid if a user owns multiple organizations.
  select count(*) into org_count from public.organizations
    where owner_id=request_row.user_id;
  if org_count<>1 or not exists (
    select 1 from public.organizations
    where id=p_company and owner_id=request_row.user_id
  ) then raise exception 'manual_invoice_company_ambiguous'
    using errcode='23514'; end if;

  insert into private.tc_manual_subscription_invoice_tasks (

    provider_account_id,provider_payment_id,request_id,buyer_user_id,
    buyer_company_id,buyer_company_name,buyer_tax_id,buyer_address,buyer_email,
    buyer_request_created_at,buyer_profile_updated_at,buyer_profile_changed_after_request,
    plan_id,plan_revision,net_cents,vat_rate_bps,vat_cents,
    amount_cents,currency,paid_at
  ) values (
    p_account,p_payment,p_request,request_row.user_id,
    p_company,customer_row.company_name,customer_row.tax_id,
    customer_row.address,customer_row.email,
    request_row.created_at,customer_row.updated_at,
    customer_row.updated_at>request_row.created_at,
    request_row.plan_id,request_row.plan_revision,
    request_row.net_cents,request_row.vat_rate_bps,request_row.vat_cents,
    p_amount,'EUR',p_paid_at
  ) on conflict(provider_account_id,provider_payment_id) do nothing;

  select * into task_row from private.tc_manual_subscription_invoice_tasks
    where provider_account_id=p_account and provider_payment_id=p_payment for update;
  if not found or task_row.request_id<>p_request
    or task_row.buyer_user_id<>request_row.user_id
    or task_row.buyer_company_id<>p_company

    or task_row.amount_cents<>p_amount or task_row.currency<>'EUR'
    or task_row.plan_id<>request_row.plan_id
    or task_row.plan_revision<>request_row.plan_revision
    or task_row.net_cents<>request_row.net_cents
    or task_row.vat_rate_bps<>request_row.vat_rate_bps
    or task_row.vat_cents<>request_row.vat_cents
    or task_row.paid_at<>p_paid_at
  then raise exception 'manual_invoice_conflicting_payment'
    using errcode='23514'; end if;

  insert into private.tc_manual_subscription_invoice_events (
    provider_account_id,provider_event_id,task_id
  ) values (p_account,p_event,task_row.id)
    on conflict(provider_account_id,provider_event_id) do nothing;
  select task_id into bound_event from private.tc_manual_subscription_invoice_events
    where provider_account_id=p_account and provider_event_id=p_event;
  if bound_event is distinct from task_row.id then
    raise exception 'manual_invoice_conflicting_event' using errcode='23514';
  end if;
  return task_row.id;
end;$$;
revoke all on function private.tc_manual_subscription_invoice_intake(
 text,text,text,uuid,uuid,integer,timestamptz
) from public,anon,authenticated;

-- No payment activation, external provider invocation, PDF upload endpoint or
-- scheduled worker. Operator CAS below is independent of the frozen intake.


-- Until an independently reviewed operator CAS, immutable fiscal document and
-- outbound-delivery workflow exists, these private intake ledgers are
-- append-only. RLS/revokes do not restrict a service-role or table owner.
-- Statement-level guards also reject TRUNCATE and protect empty tables.
-- Operator states are appended in a separate ledger below; this freeze remains.
create function private.tc_manual_subscription_intake_reject_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'manual_invoice_intake_immutable' using errcode='23514';
end;$$;
revoke all on function private.tc_manual_subscription_intake_reject_mutation()
  from public,anon,authenticated;
create trigger tc_manual_subscription_tasks_immutable
  before update or delete or truncate
  on private.tc_manual_subscription_invoice_tasks
  for each statement
  execute function private.tc_manual_subscription_intake_reject_mutation();
create trigger tc_manual_subscription_events_immutable
  before update or delete or truncate
  on private.tc_manual_subscription_invoice_events
  for each statement
  execute function private.tc_manual_subscription_intake_reject_mutation();

-- Reviewed candidate extension: keep the original intake ledgers append-only.
-- Operator validations and transitions are immutable new rows, not updates to
-- the fiscal/payment snapshot. Nothing below verifies a Stripe signature.
create table private.tc_manual_subscription_invoice_actions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references private.tc_manual_subscription_invoice_tasks(id) on delete restrict,
  row_version bigint not null check(row_version between 2 and 9007199254740991),
  operation_id uuid not null unique,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check(action in ('validate_buyer','register_invoice','report_sent','needs_review')),
  state text not null check(state in ('awaiting_issue','awaiting_send','sent_reported','needs_review')),
  input jsonb not null check(jsonb_typeof(input)='object' and octet_length(input::text)<=8192),
  data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=16384),
  expected_version bigint not null check(expected_version=row_version-1),
  created_at timestamptz not null default now(),
  unique(task_id,row_version)
);
create index tc_manual_subscription_actions_latest
  on private.tc_manual_subscription_invoice_actions(task_id,row_version desc);
alter table private.tc_manual_subscription_invoice_actions enable row level security;
revoke all on private.tc_manual_subscription_invoice_actions from public,anon,authenticated;
create policy tc_manual_invoice_actions_server_only
  on private.tc_manual_subscription_invoice_actions as restrictive for all to public
  using(false) with check(false);
create trigger tc_manual_subscription_actions_immutable
  before update or delete or truncate on private.tc_manual_subscription_invoice_actions
  for each statement execute function private.tc_manual_subscription_intake_reject_mutation();

-- Only a separately verified backend may register private PDF evidence here.
-- No client upload endpoint or grant is introduced by this migration.
create table private.tc_manual_subscription_invoice_documents (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references private.tc_manual_subscription_invoice_tasks(id) on delete restrict,
  object_key text not null unique check(char_length(object_key)<=250),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer not null check(size_bytes between 5 and 10485760),
  verified_at timestamptz not null default now() check(isfinite(verified_at)),
  unique(task_id,object_key,sha256)
);
alter table private.tc_manual_subscription_invoice_documents enable row level security;
revoke all on private.tc_manual_subscription_invoice_documents from public,anon,authenticated;
create policy tc_manual_invoice_documents_server_only
  on private.tc_manual_subscription_invoice_documents as restrictive for all to public
  using(false) with check(false);
create trigger tc_manual_subscription_documents_immutable
  before update or delete or truncate on private.tc_manual_subscription_invoice_documents
  for each statement execute function private.tc_manual_subscription_intake_reject_mutation();

create function private.tc_manual_subscription_operator()
returns uuid language plpgsql stable security definer set search_path='' as $operator$
declare actor uuid:=(select auth.uid()); sid text;
begin
  if actor is null or not private.tc_is_admin() or not exists(
    select 1 from auth.users u where u.id=actor
      and u.email_confirmed_at is not null and u.deleted_at is null
      and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()
  ) then raise exception 'manual_invoice_operator_forbidden' using errcode='42501'; end if;
  sid:=nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id';
  if sid is not null then
    if to_regclass('auth.sessions') is null then
      raise exception 'manual_invoice_session_revoked' using errcode='42501';
    end if;
    if not exists(select 1 from auth.sessions a where a.id::text=sid and a.user_id=actor) then
      raise exception 'manual_invoice_session_revoked' using errcode='42501';
    end if;
  end if;
  return actor;
end;$operator$;
revoke all on function private.tc_manual_subscription_operator() from public,anon,authenticated;

create function private.tc_manual_subscription_invoice_dto(p_task uuid)
returns jsonb language sql stable security invoker set search_path='' as $dto$
  select jsonb_build_object(
    'id',t.id,'buyer_company_id',t.buyer_company_id,
    'buyer_company_name',coalesce(a.data->'buyer'->>'company_name',t.buyer_company_name),
    'buyer_tax_id',coalesce(a.data->'buyer'->>'tax_id',t.buyer_tax_id),
    'buyer_address',coalesce(a.data->'buyer'->>'address',t.buyer_address),
    'buyer_email',coalesce(a.data->'buyer'->>'email',t.buyer_email),
    'buyer_validated',coalesce(jsonb_typeof(a.data->'buyer')='object',false),
    'buyer_snapshot_origin',case when jsonb_typeof(a.data->'buyer')='object'
      then 'operator_validated' else t.buyer_snapshot_origin end,
    'amount_cents',t.amount_cents,'net_cents',t.net_cents,
    'vat_cents',t.vat_cents,'vat_rate_bps',t.vat_rate_bps,
    'currency',t.currency,'paid_at',t.paid_at,
    'provider_payment_id',t.provider_payment_id,'provider_invoice_id',t.provider_invoice_id,
    'period_start',t.period_start,'period_end',t.period_end,
    'status',coalesce(a.state,t.status),'row_version',coalesce(a.row_version,t.row_version),
    'invoice',a.data->'invoice','dispatch',a.data->'dispatch',
    'review_reason',a.data->>'review_reason'
  )
  from private.tc_manual_subscription_invoice_tasks t
  left join lateral (
    select x.* from private.tc_manual_subscription_invoice_actions x
      where x.task_id=t.id order by x.row_version desc limit 1
  ) a on true where t.id=p_task;
$dto$;
revoke all on function private.tc_manual_subscription_invoice_dto(uuid) from public,anon,authenticated;

create function private.tc_admin_manual_subscription_invoices(
  p_action text,p_task_id uuid default null,p_expected bigint default null,
  p_request_id uuid default null,p_data jsonb default '{}',p_after uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $admin$
declare
  actor uuid; t private.tc_manual_subscription_invoice_tasks;
  previous private.tc_manual_subscription_invoice_actions;
  repeated private.tc_manual_subscription_invoice_actions;
  snapshot jsonb; input_data jsonb:=p_data; wanted_state text;
  current_version bigint; current_state text; rows jsonb; tail uuid;
  issued timestamptz; sent timestamptz; key text; evidence private.tc_manual_subscription_invoice_documents;
begin
  actor:=private.tc_manual_subscription_operator();
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8192 then
    raise exception 'manual_invoice_invalid' using errcode='22023';
  end if;
  if p_action='capabilities' then
    return jsonb_build_object('available',true,'document_upload_ready',false,
      'payments_ready',false,'delivery_verified',false);
  end if;
  if p_action in ('list','detail') then
    if p_action='detail' and p_task_id is null then
      raise exception 'manual_invoice_invalid' using errcode='22023';
    end if;
    select coalesce(jsonb_agg(private.tc_manual_subscription_invoice_dto(q.id) order by q.id),'[]')
      into rows from (
        select id from private.tc_manual_subscription_invoice_tasks
        where (p_action<>'detail' or id=p_task_id) and (p_after is null or id>p_after)
        order by id limit 50
      ) q;
    tail:=case when jsonb_array_length(rows)=50 then (rows->49->>'id')::uuid else null end;
    return jsonb_build_object('items',rows,'next_cursor',tail);
  end if;
  if p_action is null or p_action not in ('validate_buyer','register_invoice','report_sent','needs_review')
    or p_task_id is null or p_request_id is null
    or p_expected is null or p_expected<1 or p_expected>=9007199254740991 then
    raise exception 'manual_invoice_invalid' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_each(p_data) e
    where jsonb_typeof(e.value)<>'string' or (e.value#>>'{}') ~ '[[:cntrl:]]') then
    raise exception 'manual_invoice_invalid' using errcode='22023';
  end if;
  -- Row lock serializes *all* actions on the immutable task; never UPDATE it.
  select * into t from private.tc_manual_subscription_invoice_tasks
    where id=p_task_id for update;
  if not found then raise exception 'manual_invoice_not_found' using errcode='42501'; end if;
  select * into repeated from private.tc_manual_subscription_invoice_actions
    where operation_id=p_request_id;
  if found then
    if repeated.task_id<>p_task_id or repeated.actor_id<>actor
      or repeated.action<>p_action or repeated.input<>input_data
      or repeated.expected_version<>p_expected then
      raise exception 'manual_invoice_conflicting_replay' using errcode='23514';
    end if;
    return jsonb_build_object('task',private.tc_manual_subscription_invoice_dto(t.id),'replayed',true);
  end if;
  select * into previous from private.tc_manual_subscription_invoice_actions
    where task_id=t.id order by row_version desc limit 1;
  current_version:=coalesce(previous.row_version,1);
  current_state:=coalesce(previous.state,'awaiting_issue');
  if current_version<>p_expected then
    raise exception 'manual_invoice_version_conflict' using errcode='40001';
  end if;
  if current_state='needs_review' then
    raise exception 'manual_invoice_review_required' using errcode='23514';
  end if;
  snapshot:=coalesce(previous.data,jsonb_build_object('buyer',null,'invoice',null,
    'dispatch',null,'review_reason',null));
  wanted_state:=current_state;
  if p_action='validate_buyer' then
    if current_state<>'awaiting_issue' or
      p_data-array['company_name','tax_id','address','email','evidence_reference']<>'{}' or
      coalesce(char_length(btrim(p_data->>'company_name')),0) not between 2 and 100 or
      coalesce(char_length(btrim(p_data->>'tax_id')),0) not between 3 and 30 or
      coalesce(char_length(btrim(p_data->>'address')),0) not between 5 and 240 or
      coalesce(char_length(p_data->>'email'),0) not between 3 and 320 or
      coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
      coalesce(char_length(btrim(p_data->>'evidence_reference')),0) not between 3 and 200 or
      p_data::text ~ '\\u000[0-8bcef]' then
      raise exception 'manual_invoice_buyer_validation_invalid' using errcode='23514';
    end if;
    snapshot:=jsonb_set(snapshot,'{buyer}',p_data);
  elsif p_action='register_invoice' then
    if current_state<>'awaiting_issue' or jsonb_typeof(snapshot->'buyer') is distinct from 'object' then
      raise exception 'manual_invoice_buyer_not_validated' using errcode='23514';
    end if;
    if p_data-array['invoice_number','ticketbai_reference','issued_at','pdf_object_key','pdf_sha256']<>'{}' or
      coalesce(char_length(btrim(p_data->>'invoice_number')),0) not between 1 and 200 or
      coalesce(char_length(btrim(p_data->>'ticketbai_reference')),0) not between 1 and 200 or
      coalesce(p_data->>'pdf_sha256','') !~ '^[0-9a-f]{64}$' then
      raise exception 'manual_invoice_issue_invalid' using errcode='23514';
    end if;
    issued:=nullif(p_data->>'issued_at','')::timestamptz;
    key:=p_data->>'pdf_object_key';
    if issued is null or not isfinite(issued) or issued<t.paid_at or issued>now()+interval '5 minutes'
      or key is null or key !~ ('^subscription-invoices/'||t.buyer_company_id::text||'/'||t.id::text||'/[0-9a-f-]{36}\.pdf$') then
      raise exception 'manual_invoice_issue_invalid' using errcode='23514';
    end if;
    select * into evidence from private.tc_manual_subscription_invoice_documents d
      where d.task_id=t.id and d.object_key=key and d.sha256=p_data->>'pdf_sha256';
    if not found then
      raise exception 'manual_invoice_document_not_verified' using errcode='23514';
    end if;
    if exists(select 1 from private.tc_manual_subscription_invoice_actions x
      where x.action='register_invoice' and x.task_id<>t.id
        and (x.input->>'invoice_number'=p_data->>'invoice_number'
          or x.input->>'ticketbai_reference'=p_data->>'ticketbai_reference')) then
      raise exception 'manual_invoice_duplicate_fiscal_reference' using errcode='23514';
    end if;
    -- The append-only unique indexes below also protect concurrent different tasks.
    snapshot:=jsonb_set(snapshot,'{invoice}',p_data);
    wanted_state:='awaiting_send';
  elsif p_action='report_sent' then
    if current_state<>'awaiting_send' or jsonb_typeof(snapshot->'invoice') is distinct from 'object'
      or p_data-array['sent_at','recipient','reference']<>'{}'
      or p_data->>'recipient' is distinct from snapshot->'buyer'->>'email'
      or coalesce(char_length(btrim(p_data->>'reference')),0) not between 3 and 200 then
      raise exception 'manual_invoice_dispatch_invalid' using errcode='23514';
    end if;
    sent:=nullif(p_data->>'sent_at','')::timestamptz;
    if sent is null or not isfinite(sent) or sent<(snapshot->'invoice'->>'issued_at')::timestamptz
      or sent>now()+interval '5 minutes' then
      raise exception 'manual_invoice_dispatch_invalid' using errcode='23514';
    end if;
    snapshot:=jsonb_set(snapshot,'{dispatch}',p_data);
    wanted_state:='sent_reported';
  else
    if p_data-array['reason']<>'{}' or coalesce(p_data->>'reason','') not in
      ('fiscal_issue_uncertain','customer_data_invalid','amount_mismatch','dispatch_failure') then
      raise exception 'manual_invoice_review_invalid' using errcode='23514';
    end if;
    snapshot:=jsonb_set(snapshot,'{review_reason}',to_jsonb(p_data->>'reason'));
    wanted_state:='needs_review';
  end if;
  insert into private.tc_manual_subscription_invoice_actions(
    task_id,row_version,operation_id,actor_id,action,state,input,data,expected_version
  ) values(t.id,current_version+1,p_request_id,actor,p_action,wanted_state,input_data,snapshot,current_version);
  return jsonb_build_object('task',private.tc_manual_subscription_invoice_dto(t.id),'replayed',false);
end;$admin$;
revoke all on function private.tc_admin_manual_subscription_invoices(text,uuid,bigint,uuid,jsonb,uuid)
  from public,anon,authenticated;
-- Only wrappers perform invocation; the private definer authenticates the live
-- global operator, confirmed mailbox, banned/deleted status and current session.
grant execute on function private.tc_admin_manual_subscription_invoices(text,uuid,bigint,uuid,jsonb,uuid)
  to authenticated;
create function public.tc_admin_manual_subscription_invoices(
  p_action text,p_task_id uuid default null,p_expected bigint default null,
  p_request_id uuid default null,p_data jsonb default '{}',p_after uuid default null
) returns jsonb language sql security invoker set search_path='' as $wrapper$
  select private.tc_admin_manual_subscription_invoices(p_action,p_task_id,p_expected,p_request_id,p_data,p_after);
$wrapper$;
revoke all on function public.tc_admin_manual_subscription_invoices(text,uuid,bigint,uuid,jsonb,uuid)
  from public,anon;
grant execute on function public.tc_admin_manual_subscription_invoices(text,uuid,bigint,uuid,jsonb,uuid)
  to authenticated;

create unique index tc_manual_invoice_number_unique
  on private.tc_manual_subscription_invoice_actions(upper(btrim(input->>'invoice_number'))) where action='register_invoice';
create unique index tc_manual_invoice_reference_unique
  on private.tc_manual_subscription_invoice_actions(btrim(input->>'ticketbai_reference')) where action='register_invoice';

-- Canonical paid-invoice intake for subscriptions, including the first month.
-- Existing native invoice rows must already have been written by the reviewed
-- signed/reconciled provider adapter. A local paid marker is never Stripe proof.
create function private.tc_manual_subscription_invoice_renewal_intake(
  p_account text,p_event text,p_invoice text,p_subscription text,
  p_company uuid,p_amount integer,p_paid_at timestamptz
) returns uuid language plpgsql security invoker set search_path='' as $renewal$
declare
  r private.tc_payment_requests; c private.tc_customers;
  b private.tc_billing_subscriptions; i private.tc_subscription_invoices;
  t private.tc_manual_subscription_invoice_tasks; bound uuid; org_count integer;
begin
  if p_account is null or p_account !~ '^acct_[A-Za-z0-9]{1,100}$'
    or p_event is null or p_event !~ '^evt_[A-Za-z0-9]{1,200}$'
    or p_invoice is null or p_invoice !~ '^in_[A-Za-z0-9]{1,200}$'
    or p_subscription is null or p_subscription !~ '^sub_[A-Za-z0-9]{1,200}$'
    or p_company is null or p_amount is null or p_amount not between 100 and 100000000
    or p_paid_at is null or not isfinite(p_paid_at) or p_paid_at>now()+interval '5 minutes' then
    raise exception 'manual_invoice_intake_invalid' using errcode='22023';
  end if;
  select * into i from private.tc_subscription_invoices where invoice_id=p_invoice for update;
  if not found or i.subscription_id<>p_subscription or i.amount_cents<>p_amount or i.currency<>'EUR'
    or not isfinite(i.period_start) or not isfinite(i.period_end) or i.period_end<=i.period_start then
    raise exception 'manual_invoice_unreconciled_period' using errcode='23514';
  end if;
  select * into b from private.tc_billing_subscriptions where provider_id=p_subscription;
  select * into r from private.tc_payment_requests where id=b.request_id for update;
  if b.user_id is distinct from i.user_id or r.user_id is distinct from i.user_id
    or r.status<>'paid' or r.currency<>'EUR' or r.quoted_cents<>p_amount
    or r.net_cents is null or r.vat_rate_bps is null or r.vat_cents is null then
    raise exception 'manual_invoice_unreconciled_period' using errcode='23514';
  end if;
  -- Never mint a second task for an older one-off record of this subscription.
  if exists(select 1 from private.tc_manual_subscription_invoice_tasks
    where request_id=r.id and provider_invoice_id is null) then
    raise exception 'manual_invoice_conflicting_identity' using errcode='23514';
  end if;
  select * into c from private.tc_customers where user_id=i.user_id;
  select count(*) into org_count from public.organizations where owner_id=i.user_id;
  if org_count<>1 or not exists(select 1 from public.organizations where id=p_company and owner_id=i.user_id) then
    raise exception 'manual_invoice_company_ambiguous' using errcode='23514';
  end if;
  insert into private.tc_manual_subscription_invoice_tasks(
    provider_account_id,provider_payment_id,provider_invoice_id,subscription_id,period_start,period_end,
    request_id,buyer_user_id,buyer_company_id,buyer_company_name,buyer_tax_id,buyer_address,buyer_email,
    buyer_request_created_at,buyer_profile_updated_at,buyer_profile_changed_after_request,
    plan_id,plan_revision,net_cents,vat_rate_bps,vat_cents,amount_cents,currency,paid_at
  ) values (
    p_account,p_invoice,p_invoice,p_subscription,i.period_start,i.period_end,
    r.id,r.user_id,p_company,c.company_name,c.tax_id,c.address,c.email,
    r.created_at,c.updated_at,c.updated_at>r.created_at,
    r.plan_id,r.plan_revision,r.net_cents,r.vat_rate_bps,r.vat_cents,p_amount,'EUR',p_paid_at
  ) on conflict(provider_account_id,provider_payment_id) do nothing;
  select * into t from private.tc_manual_subscription_invoice_tasks
    where provider_account_id=p_account and provider_payment_id=p_invoice for update;
  if not found or t.provider_invoice_id is distinct from p_invoice or t.subscription_id is distinct from p_subscription
    or t.request_id<>r.id or t.buyer_user_id<>r.user_id or t.buyer_company_id<>p_company
    or t.amount_cents<>p_amount or t.currency<>'EUR' or t.paid_at<>p_paid_at
    or t.period_start<>i.period_start or t.period_end<>i.period_end
    or t.net_cents<>r.net_cents or t.vat_cents<>r.vat_cents or t.vat_rate_bps<>r.vat_rate_bps
    or t.plan_id<>r.plan_id or t.plan_revision<>r.plan_revision then
    raise exception 'manual_invoice_conflicting_period' using errcode='23514';
  end if;
  insert into private.tc_manual_subscription_invoice_events(provider_account_id,provider_event_id,task_id)
    values(p_account,p_event,t.id) on conflict(provider_account_id,provider_event_id) do nothing;
  select task_id into bound from private.tc_manual_subscription_invoice_events
    where provider_account_id=p_account and provider_event_id=p_event;
  if bound is distinct from t.id then
    raise exception 'manual_invoice_conflicting_event' using errcode='23514';
  end if;
  return t.id;
end;$renewal$;
revoke all on function private.tc_manual_subscription_invoice_renewal_intake(text,text,text,text,uuid,integer,timestamptz)
  from public,anon,authenticated;


-- Defense in depth: the private intake function validates tenant and quote,
-- but a future privileged server adapter could accidentally INSERT directly.
-- Enforce the same buyer/request/organization and immutable quote relation at
-- the table boundary. This does NOT authenticate Stripe or justify collecting
-- payments: 'paid' is an internal state, never external settlement evidence.
create function private.tc_manual_subscription_guard_task_insert()
returns trigger language plpgsql security invoker set search_path='' as $
begin
  if not isfinite(new.paid_at) or new.paid_at>now()+interval '5 minutes' then
    raise exception 'manual_invoice_intake_invalid' using errcode='22023';
  end if;
  if new.provider_invoice_id is not null and not exists(
    select 1 from private.tc_subscription_invoices i
    join private.tc_billing_subscriptions b on b.provider_id=i.subscription_id
    where i.invoice_id=new.provider_invoice_id and i.invoice_id=new.provider_payment_id
      and i.subscription_id=new.subscription_id and b.request_id=new.request_id
      and i.user_id=new.buyer_user_id and b.user_id=new.buyer_user_id
      and i.amount_cents=new.amount_cents and i.currency=new.currency
      and i.period_start=new.period_start and i.period_end=new.period_end
  ) then raise exception 'manual_invoice_unreconciled_period' using errcode='23514'; end if;
  if not exists (
    select 1 from private.tc_payment_requests r
      join private.tc_customers c on c.user_id=r.user_id
      join public.organizations o on o.id=new.buyer_company_id
    where r.id=new.request_id
      and r.user_id=new.buyer_user_id
      and r.status='paid'
      and r.currency='EUR' and r.currency=new.currency
      and r.quoted_cents=new.amount_cents
      and r.net_cents=new.net_cents
      and r.vat_rate_bps=new.vat_rate_bps
      and r.vat_cents=new.vat_cents
      and r.plan_id=new.plan_id
      and r.plan_revision=new.plan_revision
      and r.created_at=new.buyer_request_created_at
      and o.owner_id=r.user_id
      and c.company_name=new.buyer_company_name
      and c.tax_id=new.buyer_tax_id
      and c.address=new.buyer_address
      and c.email=new.buyer_email
      and c.updated_at=new.buyer_profile_updated_at
      and (c.updated_at>r.created_at)=new.buyer_profile_changed_after_request
      and (select count(*) from public.organizations
           where owner_id=r.user_id)=1
  ) then
    raise exception 'manual_invoice_direct_insert_unreconciled'
      using errcode='23514';
  end if;
  return new;
end;$$;
revoke all on function private.tc_manual_subscription_guard_task_insert()
  from public,anon,authenticated;
create trigger tc_manual_subscription_guard_task_insert
  before insert on private.tc_manual_subscription_invoice_tasks
  for each row execute function private.tc_manual_subscription_guard_task_insert();

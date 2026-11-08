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
  buyer_user_id uuid not null references private.tc_customers(user_id) on delete restrict,
  buyer_company_id uuid not null references public.organizations(id) on delete restrict,
  amount_cents integer not null check (amount_cents between 100 and 100000000),
  currency text not null default 'EUR' check (currency='EUR'),
  paid_at timestamptz not null,
  status text not null default 'awaiting_issue' check (status='awaiting_issue'),
  row_version bigint not null default 1 check (row_version=1),
  created_at timestamptz not null default now(),
  -- A checkout purchase can yield exactly one fiscal task. Recurring invoice
  -- periods need a separate verified subscription-invoice association; do not
  -- reuse tc_payment_requests.id across renewal tasks without that design.
  -- Composite key also enforces that every event belongs to the same Stripe
  -- merchant account as its invoice task, even for privileged direct writes.
  constraint tc_manual_subscription_task_account_unique unique (id, provider_account_id),
  constraint tc_manual_subscription_request_unique unique (request_id),
  constraint tc_manual_subscription_payment_unique unique (provider_account_id,provider_payment_id),
  constraint tc_manual_subscription_payment_global_unique unique (provider_payment_id)
);
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
  -- Stripe event IDs identify one provider event globally, independent of the
  -- merchant account. A replay across accounts must not create another event.
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
  task_row private.tc_manual_subscription_invoice_tasks;
  bound_event uuid;
  org_count integer;
begin
  if p_account is null or p_account !~ '^acct_[A-Za-z0-9]{1,100}$'
    or p_event is null or p_event !~ '^evt_[A-Za-z0-9]{1,200}$'
    or p_payment is null or p_payment !~ '^(in|pi|cs)_[A-Za-z0-9_]{1,200}$'
    or p_request is null or p_company is null
    or p_amount is null or p_amount not between 100 and 100000000
    or p_paid_at is null
  then raise exception 'manual_invoice_intake_invalid' using errcode='22023'; end if;

  -- Serializes intakes referring to the same purchase. This is NOT a payment
  -- confirmation: the existing payment row must already be marked paid.
  select * into request_row from private.tc_payment_requests
    where id=p_request for update;
  if not found or request_row.status<>'paid'
    or request_row.currency<>'EUR' or request_row.quoted_cents<>p_amount
  then raise exception 'manual_invoice_unreconciled_payment'
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
    buyer_company_id,amount_cents,currency,paid_at
  ) values (
    p_account,p_payment,p_request,request_row.user_id,
    p_company,p_amount,'EUR',p_paid_at
  ) on conflict(provider_account_id,provider_payment_id) do nothing;

  select * into task_row from private.tc_manual_subscription_invoice_tasks
    where provider_account_id=p_account and provider_payment_id=p_payment for update;
  if not found or task_row.request_id<>p_request
    or task_row.buyer_user_id<>request_row.user_id
    or task_row.buyer_company_id<>p_company
    or task_row.amount_cents<>p_amount or task_row.currency<>'EUR'
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

-- Deliberately absent: issuing/dispatch CAS, storage access, outbox, payment
-- activation, external invocation grant and any scheduled worker. These require
-- authorization/auditing and independent fiscal acceptance before deployment.


-- Until an independently reviewed operator CAS, immutable fiscal document and
-- outbound-delivery workflow exists, these private intake ledgers are
-- append-only. RLS/revokes do not restrict a service-role or table owner.
-- Statement-level guards also reject TRUNCATE and protect empty tables.
-- A future state-machine migration must explicitly replace this freeze with
-- permissioned transitions + immutable audit trail, never simply disable it.
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

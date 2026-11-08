-- REVIEW PROPOSAL ONLY. Not a migration; root integrates into a NEW CLI migration.
-- Requires schema62 and the reviewed atomic Stripe bridge receipt tables.
-- Sending starts OFF; no provider, scheduler, global settings or secrets changed.
create function private.tc_manual_invoice_notice_clock() returns timestamptz
language sql volatile security invoker set search_path='' as $$select clock_timestamp()$$;
revoke all on function private.tc_manual_invoice_notice_clock() from public,anon,authenticated;

create table private.tc_manual_invoice_notice_settings(
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 daily_limit integer not null default 20 check(daily_limit between 1 and 20),
 monthly_limit integer not null default 500 check(monthly_limit between 1 and 500)
);
insert into private.tc_manual_invoice_notice_settings(id) values(true);
create table private.tc_manual_invoice_notice_outbox(
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null unique references private.tc_manual_subscription_invoice_tasks(id) on delete restrict,
 mode text not null check(mode in('test','live')),
 recipient text not null default 'pedidos@smartscaneuskadi.com' check(recipient='pedidos@smartscaneuskadi.com'),
 template_version integer not null default 1 check(template_version=1),
 created_at timestamptz not null default private.tc_manual_invoice_notice_clock(),
 status text not null default 'pending' check(status in('pending','leased','retry_wait','accepted','uncertain','failed')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 row_version bigint not null default 1 check(row_version between 1 and 9007199254740991),
 next_attempt_at timestamptz not null default private.tc_manual_invoice_notice_clock(),
 first_attempt_at timestamptz,
 lease_token uuid,
 lease_until timestamptz,
 provider_email_id uuid,
 error_code text check(error_code in('rate_limited','idempotency_busy','provider_rejected','provider_uncertain','lease_expired','idempotency_window_expired','attempts_exhausted')),
 settled_lease_token uuid,
 settled_expected_version bigint,
 settled_outcome text,
 constraint tc_manual_notice_lease_shape check(
  (status='leased' and lease_token is not null and lease_until is not null) or
  (status<>'leased' and lease_token is null and lease_until is null)),
 constraint tc_manual_notice_acceptance_shape check((status='accepted')=(provider_email_id is not null)),
 constraint tc_manual_notice_attempt_shape check((status='pending' and attempts=0 and first_attempt_at is null)
   or (status<>'pending' and attempts between 1 and 3 and first_attempt_at is not null))
);
create index tc_manual_notice_due_idx on private.tc_manual_invoice_notice_outbox(next_attempt_at,id)
 where status in('pending','retry_wait');
create table private.tc_manual_invoice_notice_audit(
 notice_id uuid not null references private.tc_manual_invoice_notice_outbox(id) on delete restrict,
 row_version bigint not null,
 from_status text,
 to_status text not null,
 attempts integer not null,
 error_code text,
 provider_email_id uuid,
 actor_role text not null check(actor_role='service_role'),
 created_at timestamptz not null default private.tc_manual_invoice_notice_clock(),
 primary key(notice_id,row_version)
);
alter table private.tc_manual_invoice_notice_settings enable row level security;
alter table private.tc_manual_invoice_notice_outbox enable row level security;
alter table private.tc_manual_invoice_notice_audit enable row level security;
create policy tc_manual_notice_settings_no_client on private.tc_manual_invoice_notice_settings
 as restrictive for all to public using(false) with check(false);
create policy tc_manual_notice_outbox_no_client on private.tc_manual_invoice_notice_outbox
 as restrictive for all to public using(false) with check(false);
create policy tc_manual_notice_audit_no_client on private.tc_manual_invoice_notice_audit
 as restrictive for all to public using(false) with check(false);
revoke all on private.tc_manual_invoice_notice_settings,private.tc_manual_invoice_notice_outbox,
 private.tc_manual_invoice_notice_audit from public,anon,authenticated;

create function private.tc_manual_invoice_notice_guard() returns trigger
language plpgsql security invoker set search_path='' as $guard$
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'manual_notice_server_only' using errcode='42501'; end if;
 if tg_op='INSERT' then
  if new.status<>'pending' or new.attempts<>0 or new.row_version<>1
   or new.first_attempt_at is not null or new.lease_token is not null
   or not exists(select 1 from private.tc_manual_stripe_bridge_receipts b
      where b.task_id=new.task_id and b.mode=new.mode)
  then raise exception 'manual_notice_unreconciled_task' using errcode='23514'; end if;
 else
  if (new.id,new.task_id,new.mode,new.recipient,new.template_version,new.created_at)
    is distinct from (old.id,old.task_id,old.mode,old.recipient,old.template_version,old.created_at)
    or new.row_version<>old.row_version+1
  then raise exception 'manual_notice_metadata_immutable' using errcode='23514'; end if;
  if old.status in('accepted','uncertain','failed')
   or not((old.status in('pending','retry_wait') and new.status='leased' and new.attempts=old.attempts+1)
    or (old.status='leased' and new.status in('retry_wait','accepted','uncertain','failed') and new.attempts=old.attempts)
    or (old.status='retry_wait' and new.status='failed' and new.attempts=old.attempts))
   or (old.first_attempt_at is not null and new.first_attempt_at is distinct from old.first_attempt_at)
  then raise exception 'manual_notice_transition_forbidden' using errcode='23514'; end if;
 end if;
 return new;
end;$guard$;
revoke all on function private.tc_manual_invoice_notice_guard() from public,anon,authenticated;
create trigger tc_manual_notice_guard before insert or update on private.tc_manual_invoice_notice_outbox
 for each row execute function private.tc_manual_invoice_notice_guard();
create trigger tc_manual_notice_no_remove before delete or truncate on private.tc_manual_invoice_notice_outbox
 for each statement execute function private.tc_manual_subscription_intake_reject_mutation();
create trigger tc_manual_notice_audit_immutable before update or delete or truncate on private.tc_manual_invoice_notice_audit
 for each statement execute function private.tc_manual_subscription_intake_reject_mutation();
create function private.tc_manual_invoice_notice_log() returns trigger
language plpgsql security invoker set search_path='' as $audit$
begin
 insert into private.tc_manual_invoice_notice_audit(
  notice_id,row_version,from_status,to_status,attempts,error_code,provider_email_id,actor_role
 ) values(new.id,new.row_version,case when tg_op='INSERT' then null else old.status end,
  new.status,new.attempts,new.error_code,new.provider_email_id,'service_role');
 return new;
end;$audit$;
revoke all on function private.tc_manual_invoice_notice_log() from public,anon,authenticated;
create trigger tc_manual_notice_log after insert or update on private.tc_manual_invoice_notice_outbox
 for each row execute function private.tc_manual_invoice_notice_log();

-- Call AFTER the bridge receipt INSERT, and before its return, in the SAME RPC.
-- Also call on a verified replay to idempotently return an existing notice.
create function private.tc_manual_invoice_notice_enqueue(p_task_id uuid) returns uuid
language plpgsql security definer set search_path='' as $enqueue$
declare result uuid; paid_mode text; modes integer;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'manual_notice_server_only' using errcode='42501'; end if;
 select min(b.mode),count(distinct b.mode) into paid_mode,modes
  from private.tc_manual_stripe_bridge_receipts b
  join private.tc_manual_subscription_invoice_tasks t on t.id=b.task_id
  where b.task_id=p_task_id;
 if p_task_id is null or modes<>1 then
  raise exception 'manual_notice_unreconciled_task' using errcode='23514'; end if;
 insert into private.tc_manual_invoice_notice_outbox(task_id,mode)
  values(p_task_id,paid_mode) on conflict(task_id) do nothing;
 select id into strict result from private.tc_manual_invoice_notice_outbox where task_id=p_task_id;
 return result;
end;$enqueue$;
revoke all on function private.tc_manual_invoice_notice_enqueue(uuid) from public,anon,authenticated;


create function private.tc_manual_invoice_notice_runtime() returns jsonb
language plpgsql stable security definer set search_path='' as $runtime$
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'manual_notice_server_only' using errcode='42501'; end if;
 return (select jsonb_build_object('contract','manual-invoice-notice-runtime-v1',
  'enabled',s.enabled,'daily_limit',s.daily_limit,'monthly_limit',s.monthly_limit)
  from private.tc_manual_invoice_notice_settings s where id);
end;$runtime$;
revoke all on function private.tc_manual_invoice_notice_runtime() from public,anon,authenticated;

create function public.tc_manual_invoice_notice_runtime() returns jsonb
language sql stable security invoker set search_path='' as $$select private.tc_manual_invoice_notice_runtime()$$;
revoke all on function public.tc_manual_invoice_notice_runtime() from public,anon,authenticated;


create function private.tc_manual_invoice_notice_claim() returns jsonb
language plpgsql security definer set search_path='' as $claim$
declare s private.tc_manual_invoice_notice_settings; n private.tc_manual_invoice_notice_outbox;
 stamp timestamptz:=private.tc_manual_invoice_notice_clock();
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'manual_notice_server_only' using errcode='42501'; end if;
 select * into strict s from private.tc_manual_invoice_notice_settings where id for update;
 if not s.enabled then return null; end if;
 -- A crashed worker may already have sent: expire to terminal uncertainty,
 -- NEVER back to pending/retry. Accepted is not a delivery confirmation.
 update private.tc_manual_invoice_notice_outbox set status='uncertain',error_code='lease_expired',
  lease_token=null,lease_until=null,row_version=row_version+1
  where status='leased' and lease_until<=stamp;
 update private.tc_manual_invoice_notice_outbox set status='failed',error_code='idempotency_window_expired',
  row_version=row_version+1
  where status='retry_wait' and first_attempt_at+interval '23 hours'<=stamp;
 if (select count(*) from private.tc_manual_invoice_notice_audit
   where to_status='leased' and created_at>=date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC')>=s.daily_limit
  or (select count(*) from private.tc_manual_invoice_notice_audit
   where to_status='leased' and created_at>=date_trunc('month',stamp at time zone 'UTC') at time zone 'UTC')>=s.monthly_limit
 then return null; end if;
 select * into n from private.tc_manual_invoice_notice_outbox
  where mode='live' and status in('pending','retry_wait') and attempts<3 and next_attempt_at<=stamp
   and (first_attempt_at is null or first_attempt_at+interval '23 hours'>stamp)
  order by next_attempt_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update private.tc_manual_invoice_notice_outbox set status='leased',attempts=attempts+1,
  first_attempt_at=coalesce(first_attempt_at,stamp),lease_token=gen_random_uuid(),
  lease_until=stamp+interval '60 seconds',row_version=row_version+1,error_code=null
  where id=n.id returning * into n;
 return jsonb_build_object('contract','manual-invoice-notice-claim-v1','notice',jsonb_build_object(
  'id',n.id,'task_id',n.task_id,'lease_token',n.lease_token,'row_version',n.row_version,
  'attempt',n.attempts,'first_attempt_at',n.first_attempt_at,'lease_until',n.lease_until,
  'mode',n.mode,'template_version',n.template_version));
end;$claim$;
revoke all on function private.tc_manual_invoice_notice_claim() from public,anon,authenticated;

create function public.tc_manual_invoice_notice_claim() returns jsonb
language sql security invoker set search_path='' as $$select private.tc_manual_invoice_notice_claim()$$;
revoke all on function public.tc_manual_invoice_notice_claim() from public,anon,authenticated;


create function private.tc_manual_invoice_notice_finish(
 p_notice uuid,p_lease uuid,p_expected bigint,p_outcome text,p_provider_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $finish$
declare n private.tc_manual_invoice_notice_outbox; wanted text; code text;
 stamp timestamptz:=private.tc_manual_invoice_notice_clock(); wait_seconds integer;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'manual_notice_server_only' using errcode='42501'; end if;
 if p_notice is null or p_lease is null or p_expected is null or p_expected<2
  or p_outcome is null or p_outcome not in('accepted','retry_rate','retry_busy','failed','uncertain')
  or (p_outcome='accepted') is distinct from (p_provider_id is not null) then
  raise exception 'manual_notice_result_invalid' using errcode='22023'; end if;
 select * into n from private.tc_manual_invoice_notice_outbox where id=p_notice for update;
 if not found then raise exception 'manual_notice_not_found' using errcode='42501'; end if;
 if n.settled_lease_token=p_lease and n.settled_expected_version=p_expected
  and n.settled_outcome=p_outcome and n.provider_email_id is not distinct from p_provider_id then
  return jsonb_build_object('contract','manual-invoice-notice-finish-v1','id',n.id,'status',n.status,'replayed',true);
 end if;
 if n.status<>'leased' or n.lease_token<>p_lease or n.row_version<>p_expected or n.lease_until<=stamp then
  raise exception 'manual_notice_lease_conflict' using errcode='40001'; end if;
 if p_outcome='accepted' then wanted:='accepted';code:=null;
 elsif p_outcome='uncertain' then wanted:='uncertain';code:='provider_uncertain';
 elsif p_outcome='failed' then wanted:='failed';code:='provider_rejected';
 else
  wanted:=case when n.attempts>=3 then 'failed'
    when n.first_attempt_at+interval '23 hours'<=stamp then 'failed' else 'retry_wait' end;
  code:=case when n.attempts>=3 then 'attempts_exhausted'
    when n.first_attempt_at+interval '23 hours'<=stamp then 'idempotency_window_expired'
    when p_outcome='retry_rate' then 'rate_limited' else 'idempotency_busy' end;
 end if;
 wait_seconds:=30*(2^(n.attempts-1))::integer+
  ((hashtextextended(n.id::text||n.attempts::text,0)&2147483647)%30)::integer;
 update private.tc_manual_invoice_notice_outbox set status=wanted,error_code=code,
  provider_email_id=p_provider_id,lease_token=null,lease_until=null,row_version=row_version+1,
  next_attempt_at=case when wanted='retry_wait' then stamp+make_interval(secs=>wait_seconds) else next_attempt_at end,
  settled_lease_token=p_lease,settled_expected_version=p_expected,settled_outcome=p_outcome
  where id=n.id returning * into n;
 return jsonb_build_object('contract','manual-invoice-notice-finish-v1','id',n.id,'status',n.status,'replayed',false);
end;$finish$;
revoke all on function private.tc_manual_invoice_notice_finish(uuid,uuid,bigint,text,uuid)
 from public,anon,authenticated;

create function public.tc_manual_invoice_notice_finish(
 p_notice uuid,p_lease uuid,p_expected bigint,p_outcome text,p_provider_id uuid default null
) returns jsonb language sql security invoker set search_path='' as $$
 select private.tc_manual_invoice_notice_finish(p_notice,p_lease,p_expected,p_outcome,p_provider_id)
$$;
revoke all on function public.tc_manual_invoice_notice_finish(uuid,uuid,bigint,text,uuid) from public,anon,authenticated;


-- Historical isolated fixtures may not define service_role. PUBLIC/client
-- revocations above are unconditional; only the optional server role is gated.
do $notice_service_grants$
begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  revoke all on function private.tc_manual_invoice_notice_clock() from service_role;
  revoke all on private.tc_manual_invoice_notice_settings,private.tc_manual_invoice_notice_outbox,
 private.tc_manual_invoice_notice_audit from service_role;
  revoke all on function private.tc_manual_invoice_notice_guard() from service_role;
  revoke all on function private.tc_manual_invoice_notice_log() from service_role;
  revoke all on function private.tc_manual_invoice_notice_enqueue(uuid) from service_role;
  revoke all on function private.tc_manual_invoice_notice_runtime() from service_role;
  revoke all on function private.tc_manual_invoice_notice_claim() from service_role;
  revoke all on function private.tc_manual_invoice_notice_finish(uuid,uuid,bigint,text,uuid)
 from service_role;
  grant execute on function private.tc_manual_invoice_notice_enqueue(uuid) to service_role;
  grant execute on function private.tc_manual_invoice_notice_runtime() to service_role;
  grant execute on function public.tc_manual_invoice_notice_runtime() to service_role;
  grant execute on function private.tc_manual_invoice_notice_claim() to service_role;
  grant execute on function public.tc_manual_invoice_notice_claim() to service_role;
  grant execute on function private.tc_manual_invoice_notice_finish(uuid,uuid,bigint,text,uuid) to service_role;
  grant execute on function public.tc_manual_invoice_notice_finish(uuid,uuid,bigint,text,uuid) to service_role;
 end if;
end;$notice_service_grants$;

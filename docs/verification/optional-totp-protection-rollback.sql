-- OPTIONAL TOTP CANDIDATE ROLLBACK. Never run automatically or on managed Auth
-- without the official reviewed approval path. No user/factor row is changed.
begin;
-- Block concurrent enrollment/verification through this check and restoration.
lock table auth.mfa_factors in share row exclusive mode;
do $refuse_enrolled$
begin
 if exists(select 1 from auth.mfa_factors where status='verified') then
  raise exception 'optional_totp_rollback_refuses_verified_factors';end if;
end;$refuse_enrolled$;
do $expected$ begin if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_actor_verified(uuid,boolean)') and md5(prosrc)='0a03a9a6d4320228ce5145e38fb81885') then raise exception 'optional_totp_rollback_body_mismatch';end if;end;$expected$;
do $expected$ begin if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_manual_fiscal_document_actor(uuid,uuid)') and md5(prosrc)='ab49b58d74323d41b3b288420f7fe992') then raise exception 'optional_totp_rollback_body_mismatch';end if;end;$expected$;
do $expected$ begin if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('private.tc_subscription_snapshot_refresh(text,uuid,uuid,uuid,jsonb)') and md5(prosrc)='0aed1ae85f7d27bf36860d2362804af8') then raise exception 'optional_totp_rollback_body_mismatch';end if;end;$expected$;

create or replace function private.tc_actor_verified(p_user uuid,p_require_session boolean)
returns boolean language plpgsql stable security definer set search_path='' as $actor_verified$
declare sid uuid;
begin
  if p_user is null or p_require_session is null then return false; end if;
  if not exists(select 1 from auth.users u where u.id=p_user
    and u.email_confirmed_at is not null and u.deleted_at is null
    and coalesce(u.banned_until,'-infinity'::timestamptz)<=now()) then
    return false;
  end if;
  if p_require_session then
    if p_user is distinct from (select auth.uid()) then return false; end if;
    begin
      sid:=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid;
    exception when invalid_text_representation then return false;
    end;
    if sid is null or to_regclass('auth.sessions') is null then return false; end if;
    -- UUID equality uses the managed sessions primary key. not_after is an
    -- optional managed Auth field; absent/NULL means no time-boxed expiry.
    if not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=p_user
      and (nullif(to_jsonb(s)->>'not_after','') is null
        or (to_jsonb(s)->>'not_after')::timestamptz>now())) then
      return false;
    end if;
  end if;
  return true;
end;$actor_verified$;
create or replace function private.tc_manual_fiscal_document_actor(p_actor uuid,p_session uuid)
returns void language plpgsql security invoker set search_path='' as $actor$
begin
  if p_actor is null or p_session is null then
    raise exception 'manual_document_operator_required' using errcode='42501';
  end if;
  perform 1 from auth.users u where u.id=p_actor and u.email_confirmed_at is not null
    and u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now() for share;
  if not found then raise exception 'manual_document_operator_required' using errcode='42501'; end if;
  perform 1 from private.tc_admins a where a.user_id=p_actor for share;
  if not found then raise exception 'manual_document_operator_required' using errcode='42501'; end if;
  perform 1 from auth.sessions s where s.id=p_session and s.user_id=p_actor
    and (nullif(to_jsonb(s)->>'not_after','') is null
      or (to_jsonb(s)->>'not_after')::timestamptz>now()) for share;
  if not found then raise exception 'manual_document_operator_required' using errcode='42501'; end if;
end;$actor$;
create or replace function private.tc_subscription_snapshot_refresh(
 p_action text,p_actor uuid,p_session uuid,p_operation uuid,p_data jsonb
) returns jsonb language plpgsql security definer set search_path='' as $refresh$
declare c private.tc_customers; s private.tc_billing_subscriptions;
 r private.tc_payment_requests; receipt private.tc_subscription_snapshot_refreshes;
 expected bigint; ending timestamptz; previous jsonb;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise exception 'subscription_refresh_server_only' using errcode='42501';end if;
 if p_action='capabilities' then
  return jsonb_build_object('canonical_refresh',true);end if;
 if p_action is null or p_action not in('observe','commit') or p_actor is null
  or p_session is null or p_operation is null or p_data is null
  or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>2048 then
  raise exception 'subscription_refresh_invalid' using errcode='22023';end if;
 -- The backend verifies this exact JWT via Auth and tc_verified_session before
 -- deriving these IDs. Recheck and lock their managed rows at the final write;
 -- logout/ban that committed first prevents the canonical snapshot being saved.
 perform 1 from auth.users u where u.id=p_actor and u.email_confirmed_at is not null
  and u.deleted_at is null and coalesce(u.banned_until,'-infinity'::timestamptz)<=now() for share;
 if not found then raise exception 'subscription_refresh_session_required' using errcode='42501';end if;
 perform 1 from auth.sessions x where x.id=p_session and x.user_id=p_actor
  and (nullif(to_jsonb(x)->>'not_after','') is null or (to_jsonb(x)->>'not_after')::timestamptz>now()) for share;
 if not found then raise exception 'subscription_refresh_session_required' using errcode='42501';end if;
 -- Same customer -> request -> subscription lock order as the paid bridge.
 select * into c from private.tc_customers where user_id=p_actor for update;
 if not found then raise exception 'subscription_refresh_not_available' using errcode='42501';end if;
 if p_action='observe' and p_data<>'{}' then
  raise exception 'subscription_refresh_invalid' using errcode='22023';end if;
 select * into receipt from private.tc_subscription_snapshot_refreshes where operation_id=p_operation;
 if found then
  if receipt.actor_id<>p_actor then raise exception 'subscription_refresh_operation_conflict' using errcode='42501';end if;
  if p_action='commit' and receipt.canonical is distinct from p_data then
   raise exception 'subscription_refresh_operation_conflict' using errcode='22023';end if;
  return jsonb_build_object('refreshed',true,'duplicate',true);
 end if;
 select * into s from private.tc_billing_subscriptions where user_id=p_actor
  order by (state not in('canceled','incomplete_expired')) desc,created_at desc,provider_id desc limit 1;
 if s.provider_id is null then
  if p_action='observe' and p_data='{}' then return jsonb_build_object('available',false);end if;
  raise exception 'subscription_refresh_not_available' using errcode='42501';
 end if;
 if p_action='observe' then
  if (select count(*) from private.tc_subscription_snapshot_refresh_attempts
   where actor_id=p_actor and created_at>clock_timestamp()-interval '60 seconds')>=3 then
   return jsonb_build_object('throttled',true,'retry_after_seconds',60);end if;
  insert into private.tc_subscription_snapshot_refresh_attempts(actor_id,session_id,operation_id,subscription_id)
   values(p_actor,p_session,p_operation,s.provider_id);
  return jsonb_build_object('available',true,'user_id',p_actor,'request_id',s.request_id,
   'subscription_id',s.provider_id,'customer_id',s.customer_id,'unit_amount',s.monthly_cents,
   'currency',s.currency,'snapshot_revision',s.snapshot_revision::text);
 end if;
 if p_data-array['request_id','subscription_id','customer_id','snapshot_revision','state',
    'cancel_at_period_end','period_end','unit_amount','currency']<>'{}'
  or coalesce(p_data->>'request_id','')<>s.request_id::text
  or coalesce(p_data->>'subscription_id','')<>s.provider_id
  or coalesce(p_data->>'customer_id','')<>s.customer_id
  or jsonb_typeof(p_data->'snapshot_revision') is distinct from 'string'
  or coalesce(p_data->>'snapshot_revision','') !~ '^(0|[1-9][0-9]{0,18})$'
  or coalesce(p_data->>'state','') not in('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
  or jsonb_typeof(p_data->'cancel_at_period_end') is distinct from 'boolean'
  or coalesce(p_data->>'currency','')<>'EUR'
  or jsonb_typeof(p_data->'unit_amount') is distinct from 'number'
  or (p_data->>'unit_amount') !~ '^[1-9][0-9]{1,8}$'
  or jsonb_typeof(p_data->'period_end') is distinct from 'number'
  or (p_data->>'period_end') !~ '^[1-9][0-9]{0,11}$' then
  raise exception 'subscription_refresh_invalid' using errcode='22023';end if;
 select * into r from private.tc_payment_requests where id=s.request_id and user_id=p_actor for update;
 if r.id is null or r.quoted_cents<>s.monthly_cents or r.currency<>'EUR'
  or (p_data->>'unit_amount')::integer<>s.monthly_cents then
  raise exception 'subscription_refresh_mapping_mismatch' using errcode='42501';end if;
 select * into s from private.tc_billing_subscriptions where provider_id=s.provider_id for update;
 expected:=(p_data->>'snapshot_revision')::bigint;
 if expected<>s.snapshot_revision then return jsonb_build_object('reconcile_required',true);end if;
 ending:=to_timestamp((p_data->>'period_end')::bigint);
 if ending>now()+interval '62 days' or ending<now()-interval '2 years' then
  raise exception 'subscription_refresh_period_invalid' using errcode='22023';end if;
 previous:=jsonb_build_object('state',s.state,'cancel_at_period_end',s.cancel_at_period_end,
  'period_end',s.period_end,'reconciliation_required',s.reconciliation_required);
 update private.tc_billing_subscriptions set state=p_data->>'state',
  cancel_at_period_end=(p_data->>'cancel_at_period_end')::boolean,period_end=ending,
  reconciliation_required=false,snapshot_revision=s.snapshot_revision+1,updated_at=now()
  where provider_id=s.provider_id;
 insert into private.tc_subscription_snapshot_refreshes(operation_id,actor_id,session_id,
  subscription_id,expected_revision,committed_revision,canonical,previous)
  values(p_operation,p_actor,p_session,s.provider_id,expected,expected+1,p_data,previous);
 return jsonb_build_object('refreshed',true,'duplicate',false);
end;$refresh$;
drop function public.tc_mfa_protection_status();
drop function private.tc_mfa_protection_status();
drop function private.tc_totp_session_bound(uuid,uuid);
drop function private.tc_totp_required(uuid);
drop function private.tc_actor_identity_and_session(uuid,boolean);
commit;

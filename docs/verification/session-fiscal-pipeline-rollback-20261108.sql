-- TruckControl AI schema63 acceptance, NOT a migration.
-- Execute only after reviewed migration63 is installed in truckcontrol-ai.
-- Synthetic SQL fixtures are NOT Stripe settlement, TicketBAI issuance, Auth/SMS
-- delivery, file transport or provider acceptance. No provider APIs are called.
-- No global flags, grants, policies, functions or existing rows are modified.
-- A disabled synthetic test channel is created only inside the rollback scope.
-- SET ROLE is explicit: browser denial is tested as authenticated/anon and the
-- server pipeline as service_role. No secret is read or printed.
-- CAS here checks stale sequential writers; it is not a multi-connection test.
begin isolation level repeatable read;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $preflight$
declare baseline jsonb;
begin
 if to_regprocedure('public.tc_verified_session()') is null
  or to_regprocedure('public.tc_manual_subscription_apply_payment(text,text,jsonb)') is null
  or to_regprocedure('public.tc_manual_subscription_document_server(text,jsonb)') is null
  or to_regclass('private.tc_manual_invoice_notice_outbox') is null
  or to_regclass('auth.sessions') is null then
  raise exception 'session_fiscal_schema63_required';
 end if;
 if exists(select from auth.users where id::text like 'fca10000-%')
  or exists(select from auth.sessions where id::text like 'fca11000-%')
  or exists(select from private.tc_payment_requests where id::text like 'fca20000-%')
  or exists(select from private.tc_manual_stripe_channels where provider_account_id='acct_SessionFiscalFca')
  or exists(select from private.tc_manual_subscription_invoice_tasks where provider_account_id='acct_SessionFiscalFca') then
  raise exception 'session_fiscal_fixture_collision_preserve_existing_work';
 end if;
 if not exists(select from private.tc_settings where id and registration_open
   and enforce_access and not payments_enabled)
  or not exists(select from private.tc_manual_subscription_document_runtime where id
   and not uploads_enabled and not downloads_enabled)
  or not exists(select from private.tc_manual_invoice_notice_settings where id and not enabled) then
  raise exception 'session_fiscal_safe_defaults_required_do_not_change_them';
 end if;
 select jsonb_build_object(
  'users',(select md5(coalesce(jsonb_agg(u.id order by u.id),'[]')::text) from auth.users u),
  'sessions',(select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]')::text) from auth.sessions s),
  'organizations',(select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]')::text) from public.organizations o),
  'customers',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.user_id),'[]')::text) from private.tc_customers c),
  'admins',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.user_id),'[]')::text) from private.tc_admins a),
  'requests',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]')::text) from private.tc_payment_requests r),
  'settings',(select md5(coalesce(jsonb_agg(to_jsonb(s)),'[]')::text) from private.tc_settings s),
  'documents_runtime',(select md5(coalesce(jsonb_agg(to_jsonb(d)),'[]')::text) from private.tc_manual_subscription_document_runtime d),
  'notice_settings',(select md5(coalesce(jsonb_agg(to_jsonb(n)),'[]')::text) from private.tc_manual_invoice_notice_settings n),
  'tasks',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]')::text) from private.tc_manual_subscription_invoice_tasks t),
  'events',(select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.provider_event_id),'[]')::text) from private.tc_manual_subscription_invoice_events e),
  'actions',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.task_id,a.row_version),'[]')::text) from private.tc_manual_subscription_invoice_actions a),
  'channels',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.provider_account_id,c.mode),'[]')::text) from private.tc_manual_stripe_channels c),
  'receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.provider_event_id),'[]')::text) from private.tc_manual_stripe_bridge_receipts r),
  'outbox',(select md5(coalesce(jsonb_agg(to_jsonb(n) order by n.id),'[]')::text) from private.tc_manual_invoice_notice_outbox n),
  'notice_audit',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.notice_id,a.row_version),'[]')::text) from private.tc_manual_invoice_notice_audit a),
  'document_reservations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.operation_id),'[]')::text) from private.tc_manual_subscription_document_reservations r),
  'document_access',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]')::text) from private.tc_manual_subscription_document_access a)
 ) into baseline;
 perform set_config('truckcontrol_test.session_fiscal_baseline',baseline::text,true);
end;$preflight$;
savepoint session_fiscal_fixtures;

-- SQL Auth registration hooks only; never call GoTrue or a mail/SMS endpoint.
insert into auth.users(id,email,raw_user_meta_data) values
 ('fca10000-0000-4000-8000-000000000001','session-fiscal-admin@example.invalid','{}'),
 ('fca10000-0000-4000-8000-000000000002','session-fiscal-a@example.invalid',
  '{"truckcontrol_registration":{"contact_name":"Persona ficticia A","company_name":"Empresa ficticia session A","tax_id":"DEMO-SESSION-FCA-A","address":"Direccion ficticia 101","phone":"+12025550701","requested_plan":"limited"}}'),
 ('fca10000-0000-4000-8000-000000000003','session-fiscal-b@example.invalid',
  '{"truckcontrol_registration":{"contact_name":"Persona ficticia B","company_name":"Empresa ficticia session B","tax_id":"DEMO-SESSION-FCA-B","address":"Direccion ficticia 102","phone":"+12025550702","requested_plan":"limited"}}'),
 ('fca10000-0000-4000-8000-000000000004','session-fiscal-onboarding@example.invalid','{}');
insert into private.tc_auth_legal_consents(user_id,legal_version,source) values
 ('fca10000-0000-4000-8000-000000000002','2026-11-02','authenticated_profile'),
 ('fca10000-0000-4000-8000-000000000003','2026-11-02','authenticated_profile');
update auth.users set email_confirmed_at=now()
 where id::text like 'fca10000-%';
update auth.users set phone='+12025550701',phone_confirmed_at=now()
 where id='fca10000-0000-4000-8000-000000000002';
update auth.users set phone='+12025550702',phone_confirmed_at=now()
 where id='fca10000-0000-4000-8000-000000000003';
-- Real session rows are present BEFORE any authenticated onboarding RPC.
insert into auth.sessions(id,user_id) values
 ('fca11000-0000-4000-8000-000000000001','fca10000-0000-4000-8000-000000000001'),
 ('fca11000-0000-4000-8000-000000000002','fca10000-0000-4000-8000-000000000002'),
 ('fca11000-0000-4000-8000-000000000003','fca10000-0000-4000-8000-000000000003'),
 ('fca11000-0000-4000-8000-000000000004','fca10000-0000-4000-8000-000000000004');
insert into private.tc_admins(user_id) values('fca10000-0000-4000-8000-000000000001');

do $onboarding$
declare uid uuid; sid uuid; n integer;
begin
 foreach uid in array array[
  'fca10000-0000-4000-8000-000000000002'::uuid,
  'fca10000-0000-4000-8000-000000000003'::uuid
 ] loop
  sid:=replace(uid::text,'fca10000','fca11000')::uuid;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid)::text,true);
  execute 'set local role authenticated';
  if public.tc_verified_session() is distinct from true then raise exception 'session_fiscal_valid_buyer_denied';end if;
  perform public.tc_finish_registration();
  execute 'reset role';
 end loop;
 if (select count(*) from public.organizations where owner_id in
  ('fca10000-0000-4000-8000-000000000002','fca10000-0000-4000-8000-000000000003'))<>2 then
  raise exception 'session_fiscal_companies_missing';
 end if;
 perform set_config('request.jwt.claim.sub','fca10000-0000-4000-8000-000000000004',true);
 perform set_config('request.jwt.claims','{"sub":"fca10000-0000-4000-8000-000000000004","role":"authenticated","session_id":"fca11000-0000-4000-8000-000000000004"}',true);
 execute 'set local role authenticated';
 if public.tc_verified_session() is distinct from true then raise exception 'session_fiscal_preprofile_denied';end if;
 execute 'reset role';
 if exists(select from private.tc_customers where user_id='fca10000-0000-4000-8000-000000000004') then
  raise exception 'session_fiscal_preprofile_fixture_not_independent';
 end if;
end;$onboarding$;

do $acl_and_isolation$
declare denied boolean; item text; a uuid; b uuid;
begin
 foreach item in array array[
  'public.tc_manual_subscription_apply_payment(text,text,jsonb)',
  'public.tc_manual_subscription_document_server(text,jsonb)',
  'public.tc_manual_invoice_notice_runtime()',
  'public.tc_manual_invoice_notice_claim()',
  'public.tc_manual_invoice_notice_finish(uuid,uuid,bigint,text,uuid)',
  'private.tc_actor_verified(uuid,boolean)'
 ] loop
  if has_function_privilege('authenticated',item,'EXECUTE')
   or has_function_privilege('anon',item,'EXECUTE') then
   raise exception 'session_fiscal_privileged_endpoint_exposed';
  end if;
 end loop;
 if has_function_privilege('anon','public.tc_verified_session()','EXECUTE')
  or not has_function_privilege('authenticated','public.tc_verified_session()','EXECUTE') then
  raise exception 'session_fiscal_checker_acl_incorrect';
 end if;
 if has_table_privilege('service_role','private.tc_manual_stripe_channels','UPDATE')
  or has_table_privilege('service_role','private.tc_manual_subscription_document_runtime','UPDATE')
  or has_table_privilege('service_role','private.tc_manual_invoice_notice_settings','UPDATE') then
  raise exception 'session_fiscal_server_can_self_enable';
 end if;
 select id into strict a from public.organizations where owner_id='fca10000-0000-4000-8000-000000000002';
 select id into strict b from public.organizations where owner_id='fca10000-0000-4000-8000-000000000003';
 perform set_config('request.jwt.claim.sub','fca10000-0000-4000-8000-000000000002',true);
 perform set_config('request.jwt.claims','{"sub":"fca10000-0000-4000-8000-000000000002","role":"authenticated","session_id":"fca11000-0000-4000-8000-000000000002"}',true);
 execute 'set local role authenticated';
 if (select count(*) from public.organizations where id in(a,b))<>1
  or (select count(*) from public.organizations where id=b)<>0 then
  raise exception 'session_fiscal_company_rls_leak';
 end if;
 denied:=false;
 begin perform public.tc_admin_manual_subscription_invoices('capabilities');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'session_fiscal_customer_is_admin';end if;
 execute 'reset role';
end;$acl_and_isolation$;

-- Internal paid fixture only. It deliberately bypasses Stripe to test database
-- invariants without enabling a channel, extending a licence or asserting a sale.
do $intake$
declare company uuid; request uuid:='fca20000-0000-4000-8000-000000000001'; task uuid; total integer;
begin
 select id into strict company from public.organizations where owner_id='fca10000-0000-4000-8000-000000000002';
 insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status,net_cents,vat_rate_bps,vat_cents)
 select request,'fca10000-0000-4000-8000-000000000002',p.id,
  p.monthly_cents+private.tc_quote_vat(p.monthly_cents),p.revision,'paid',
  p.monthly_cents,2100,private.tc_quote_vat(p.monthly_cents) from private.tc_plans p where p.id='limited'
 returning quoted_cents into total;
 if total is null then raise exception 'session_fiscal_quote_missing';end if;
 task:=private.tc_manual_subscription_invoice_intake(
  'acct_SessionFiscalFca','evt_SessionFiscalFca','pi_SessionFiscalFca',
  request,company,total,now()-interval '1 minute');
 perform set_config('truckcontrol_test.session_fiscal_task',task::text,true);
end;$intake$;

do $operator_cas$
declare task uuid:=current_setting('truckcontrol_test.session_fiscal_task')::uuid;
 first_reply jsonb; reply jsonb; denied boolean;
 buyer jsonb:='{"company_name":"Empresa ficticia session A","tax_id":"DEMO-SESSION-FCA-A","address":"Direccion ficticia 101","email":"session-fiscal-a@example.invalid","evidence_reference":"Confirmacion fiscal sintetica de ensayo, no venta real"}';
begin
 perform set_config('request.jwt.claim.sub','fca10000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claims','{"sub":"fca10000-0000-4000-8000-000000000001","role":"authenticated","session_id":"fca11000-0000-4000-8000-000000000001"}',true);
 execute 'set local role authenticated';
 if private.tc_is_admin() is distinct from true then raise exception 'session_fiscal_valid_admin_denied';end if;
 first_reply:=public.tc_admin_manual_subscription_invoices('validate_buyer',task,1,
  'fca40000-0000-4000-8000-000000000001',buyer);
 if first_reply->>'replayed' is distinct from 'false' or (first_reply->'task'->>'row_version')::bigint is distinct from 2
  or first_reply->'task'->>'buyer_validated' is distinct from 'true' then
  raise exception 'session_fiscal_validation_not_audited';
 end if;
 reply:=public.tc_admin_manual_subscription_invoices('validate_buyer',task,1,
  'fca40000-0000-4000-8000-000000000001',buyer);
 if reply->>'replayed' is distinct from 'true' or reply->'task' is distinct from first_reply->'task' then
  raise exception 'session_fiscal_replay_changed_result';
 end if;
 denied:=false;
 begin
  perform public.tc_admin_manual_subscription_invoices('validate_buyer',task,1,
   'fca40000-0000-4000-8000-000000000002',buyer);
 exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'session_fiscal_stale_writer_accepted';end if;
 execute 'reset role';
 if (select count(*) from private.tc_manual_subscription_invoice_actions where task_id=task)<>1 then
  raise exception 'session_fiscal_replay_duplicated_ledger';
 end if;
 denied:=false;
 begin update private.tc_manual_subscription_invoice_actions set action=action where task_id=task;
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'session_fiscal_audit_mutable';end if;
end;$operator_cas$;

do $closed_services$
declare reply jsonb; denied boolean; task uuid:=current_setting('truckcontrol_test.session_fiscal_task')::uuid;
begin
 insert into private.tc_manual_stripe_channels(provider_account_id,mode)
  values('acct_SessionFiscalFca','test');
 execute 'set local role service_role';
 denied:=false;
 begin
  perform public.tc_manual_subscription_apply_payment('initial_payment','acct_SessionFiscalFca',
   '{"currency":"EUR","livemode":false}');
 exception when insufficient_privilege then
  if sqlerrm<>'manual_stripe_channel_disabled' then raise;end if;denied:=true;
 end;
 if not denied then raise exception 'session_fiscal_disabled_bridge_accepted';end if;
 reply:=public.tc_manual_subscription_document_server('status',
  '{"actor_id":"fca10000-0000-4000-8000-000000000001","session_id":"fca11000-0000-4000-8000-000000000001"}');
 if reply->>'available' is distinct from 'true' or reply->>'document_upload_ready' is distinct from 'false'
  or reply->>'downloads_ready' is distinct from 'false' then raise exception 'session_fiscal_document_false_readiness';end if;
 denied:=false;
 begin
  perform public.tc_manual_subscription_document_server('reserve',jsonb_build_object(
   'actor_id','fca10000-0000-4000-8000-000000000001','session_id','fca11000-0000-4000-8000-000000000001',
   'task_id',task,'operation_id','fca50000-0000-4000-8000-000000000001',
   'expected_version',2,'sha256',repeat('a',64),'size_bytes',99));
 exception when insufficient_privilege then
  if sqlerrm<>'manual_document_upload_unavailable' then raise;end if;denied:=true;
 end;
 if not denied then raise exception 'session_fiscal_disabled_upload_accepted';end if;
 if public.tc_manual_invoice_notice_claim() is not null then raise exception 'session_fiscal_disabled_notice_claimed';end if;
 execute 'reset role';
end;$closed_services$;

-- Synthetic test receipt only. It proves enqueue dedup/role boundaries, not a
-- successful bridge/payment. Both bridge hooks are separately tested in CI.
do $notice_pipeline$
declare task uuid:=current_setting('truckcontrol_test.session_fiscal_task')::uuid; first_id uuid; replay uuid;
begin
 insert into private.tc_manual_stripe_bridge_receipts(
  provider_event_id,provider_account_id,mode,payment_kind,provider_payment_id,request_id,task_id,proof_sha256
 ) values('evt_SessionFiscalFca','acct_SessionFiscalFca','test','initial_payment','pi_SessionFiscalFca',
  'fca20000-0000-4000-8000-000000000001',task,repeat('f',64));
 execute 'set local role service_role';
 first_id:=private.tc_manual_invoice_notice_enqueue(task);
 replay:=private.tc_manual_invoice_notice_enqueue(task);
 if first_id is null or replay is distinct from first_id then raise exception 'session_fiscal_notice_replay_changed_identity';end if;
 if public.tc_manual_invoice_notice_claim() is not null then raise exception 'session_fiscal_test_notice_claimed';end if;
 execute 'reset role';
 if (select count(*) from private.tc_manual_invoice_notice_outbox where task_id=task)<>1
  or not exists(select from private.tc_manual_invoice_notice_outbox
   where task_id=task and mode='test' and status='pending' and attempts=0)
  or (select count(*) from private.tc_manual_invoice_notice_audit where notice_id=first_id)<>1 then
  raise exception 'session_fiscal_notice_not_unique_pending';
 end if;
end;$notice_pipeline$;

do $revocation$
declare denied boolean; a uuid; b uuid; sid text;
 task uuid:=current_setting('truckcontrol_test.session_fiscal_task')::uuid;
begin
 select id into strict a from public.organizations where owner_id='fca10000-0000-4000-8000-000000000002';
 select id into strict b from public.organizations where owner_id='fca10000-0000-4000-8000-000000000003';
 delete from auth.sessions where id='fca11000-0000-4000-8000-000000000002';
 perform set_config('request.jwt.claim.sub','fca10000-0000-4000-8000-000000000002',true);
 perform set_config('request.jwt.claims','{"sub":"fca10000-0000-4000-8000-000000000002","role":"authenticated","session_id":"fca11000-0000-4000-8000-000000000002"}',true);
 execute 'set local role authenticated';
 if public.tc_verified_session() is distinct from false
  or (select count(*) from public.organizations where id in(a,b))<>0 then
  raise exception 'session_fiscal_logout_kept_company_access';
 end if;
 denied:=false;
 begin perform public.tc_my_access();exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'session_fiscal_logout_kept_profile_access';end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub','fca10000-0000-4000-8000-000000000003',true);
 perform set_config('request.jwt.claims','{"sub":"fca10000-0000-4000-8000-000000000003","role":"authenticated","session_id":"fca11000-0000-4000-8000-000000000003"}',true);
 execute 'set local role authenticated';
 if public.tc_verified_session() is distinct from true
  or (select count(*) from public.organizations where id in(a,b))<>1 then
  raise exception 'session_fiscal_logout_affected_other_company';
 end if;
 execute 'reset role';
 -- Auth expiry is checked by BOTH the human predicate and the privileged
 -- document adapter, after its authorization-row locks.
 update auth.sessions set not_after=now()-interval '1 second'
  where id='fca11000-0000-4000-8000-000000000001';
 perform set_config('request.jwt.claim.sub','fca10000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claims','{"sub":"fca10000-0000-4000-8000-000000000001","role":"authenticated","session_id":"fca11000-0000-4000-8000-000000000001"}',true);
 execute 'set local role authenticated';
 if public.tc_verified_session() is distinct from false or private.tc_is_admin() then
  raise exception 'session_fiscal_expired_admin_accepted';
 end if;
 denied:=false;
 begin perform public.tc_admin_manual_subscription_invoices('capabilities');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'session_fiscal_expired_operator_accepted';end if;
 denied:=false;
 begin perform public.tc_admin_manual_subscription_invoices('needs_review',task,2,
  'fca40000-0000-4000-8000-000000000003','{"reason":"Incidencia sintetica de sesion expirada"}');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'session_fiscal_expired_operator_mutation_accepted';end if;
 execute 'reset role';
 execute 'set local role service_role';
 denied:=false;
 begin perform public.tc_manual_subscription_document_server('status',
  '{"actor_id":"fca10000-0000-4000-8000-000000000001","session_id":"fca11000-0000-4000-8000-000000000001"}');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'session_fiscal_expired_document_operator_accepted';end if;
 execute 'reset role';
 -- Restore ONLY the synthetic session, then test malformed/absent/foreign
 -- session claims independently of time-boxed expiry.
 update auth.sessions set not_after=null
  where id='fca11000-0000-4000-8000-000000000001';
 foreach sid in array array[null::text,'not-a-valid-session-uuid','fca11000-0000-4000-8000-000000000003'] loop
  perform set_config('request.jwt.claim.sub','fca10000-0000-4000-8000-000000000001',true);
  perform set_config('request.jwt.claims',jsonb_strip_nulls(jsonb_build_object(
   'sub','fca10000-0000-4000-8000-000000000001','role','authenticated','session_id',sid))::text,true);
  execute 'set local role authenticated';
  if public.tc_verified_session() is distinct from false then
   raise exception 'session_fiscal_bad_session_verified';
  end if;
  denied:=false;
  begin perform public.tc_admin_manual_subscription_invoices('capabilities');
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'session_fiscal_bad_session_operator_accepted';end if;
  execute 'reset role';
 end loop;
 perform set_config('request.jwt.claim.sub','fca10000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claims','{"sub":"fca10000-0000-4000-8000-000000000001","role":"authenticated","session_id":"fca11000-0000-4000-8000-000000000001"}',true);
 delete from private.tc_admins where user_id='fca10000-0000-4000-8000-000000000001';
 execute 'set local role authenticated';
 if private.tc_is_admin() is distinct from false or public.tc_verified_session() is distinct from true then
  raise exception 'session_fiscal_admin_role_withdrawal_not_effective';
 end if;
 denied:=false;
 begin perform public.tc_admin_manual_subscription_invoices('capabilities');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'session_fiscal_withdrawn_operator_accepted';end if;
 execute 'reset role';
end;$revocation$;

select 'session-fiscal-pipeline-rollback-v1' as contract,'passed' as result,
 2 as synthetic_companies,4 as synthetic_auth_sessions,
 0 as provider_calls,0 as real_emails_sent,0 as model_calls,
 false as stripe_settlement_proven,false as ticketbai_issuance_proven,
 false as document_transport_proven,false as real_email_delivery_proven,
 'stale_writer_cas_only' as concurrency_scope;

-- Roll back the entire fixture scope BEFORE checking the baseline; no DELETE
-- compensation, disabled trigger or retained audit fixture is needed.
rollback to savepoint session_fiscal_fixtures;
do $baseline$
declare actual jsonb;
begin
 select jsonb_build_object(
  'users',(select md5(coalesce(jsonb_agg(u.id order by u.id),'[]')::text) from auth.users u),
  'sessions',(select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]')::text) from auth.sessions s),
  'organizations',(select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]')::text) from public.organizations o),
  'customers',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.user_id),'[]')::text) from private.tc_customers c),
  'admins',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.user_id),'[]')::text) from private.tc_admins a),
  'requests',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]')::text) from private.tc_payment_requests r),
  'settings',(select md5(coalesce(jsonb_agg(to_jsonb(s)),'[]')::text) from private.tc_settings s),
  'documents_runtime',(select md5(coalesce(jsonb_agg(to_jsonb(d)),'[]')::text) from private.tc_manual_subscription_document_runtime d),
  'notice_settings',(select md5(coalesce(jsonb_agg(to_jsonb(n)),'[]')::text) from private.tc_manual_invoice_notice_settings n),
  'tasks',(select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]')::text) from private.tc_manual_subscription_invoice_tasks t),
  'events',(select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.provider_event_id),'[]')::text) from private.tc_manual_subscription_invoice_events e),
  'actions',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.task_id,a.row_version),'[]')::text) from private.tc_manual_subscription_invoice_actions a),
  'channels',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.provider_account_id,c.mode),'[]')::text) from private.tc_manual_stripe_channels c),
  'receipts',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.provider_event_id),'[]')::text) from private.tc_manual_stripe_bridge_receipts r),
  'outbox',(select md5(coalesce(jsonb_agg(to_jsonb(n) order by n.id),'[]')::text) from private.tc_manual_invoice_notice_outbox n),
  'notice_audit',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.notice_id,a.row_version),'[]')::text) from private.tc_manual_invoice_notice_audit a),
  'document_reservations',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.operation_id),'[]')::text) from private.tc_manual_subscription_document_reservations r),
  'document_access',(select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]')::text) from private.tc_manual_subscription_document_access a)
 ) into actual;
 if actual is distinct from current_setting('truckcontrol_test.session_fiscal_baseline')::jsonb then
  raise exception 'session_fiscal_baseline_changed';
 end if;
end;$baseline$;
rollback;

select 'session-fiscal-pipeline-cleanup-v1' as contract,
 (select count(*)::integer from auth.users where id::text like 'fca10000-%') as fixture_users_remaining,
 (select count(*)::integer from auth.sessions where id::text like 'fca11000-%') as fixture_sessions_remaining,
 (select count(*)::integer from private.tc_admins where user_id::text like 'fca10000-%') as fixture_admins_remaining,
 (select count(*)::integer from private.tc_payment_requests where id::text like 'fca20000-%') as fixture_requests_remaining,
 (select count(*)::integer from private.tc_manual_subscription_invoice_tasks where provider_account_id='acct_SessionFiscalFca') as fixture_tasks_remaining,
 (select count(*)::integer from private.tc_manual_subscription_invoice_events where provider_event_id like 'evt_SessionFiscalFca%') as fixture_events_remaining,
 (select count(*)::integer from private.tc_manual_subscription_invoice_actions where operation_id::text like 'fca40000-%') as fixture_actions_remaining,
 (select count(*)::integer from private.tc_manual_stripe_channels where provider_account_id='acct_SessionFiscalFca') as fixture_channels_remaining,
 (select count(*)::integer from private.tc_manual_stripe_bridge_receipts where provider_account_id='acct_SessionFiscalFca') as fixture_bridge_receipts_remaining,
 (select count(*)::integer from private.tc_manual_invoice_notice_outbox n join private.tc_manual_subscription_invoice_tasks t on t.id=n.task_id where t.provider_account_id='acct_SessionFiscalFca') as fixture_notices_remaining;

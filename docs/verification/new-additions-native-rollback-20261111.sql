-- Acceptance of the two NEW reviewed additions only, not a migration.
-- New synthetic actors, no old #37 actors, provider calls, messages or real payments.
-- An inner subtransaction ALWAYS rolls back fixtures, including on assertion errors.
begin isolation level repeatable read;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $acceptance$
declare
 checks jsonb:='[]'; before_state jsonb:='{}'; after_state jsonb:='{}'; item text; digest text;
 a uuid; b uuid; task uuid; case_uuid uuid; total integer; denied boolean; reply jsonb; first_reply jsonb;
 data jsonb; stamp bigint:=extract(epoch from now())::bigint-10;
 uid uuid; sid uuid; baseline_paid jsonb;
begin
 if to_regclass('private.tc_subscription_financial_entries') is null
  or not exists(select from information_schema.columns where table_schema='public' and table_name='trucks' and column_name='co_driver_id') then
  raise exception 'new_additions_schema_required'; end if;
 if exists(select from auth.users where id::text like 'c6111000-%')
  or exists(select from auth.sessions where id::text like 'c6112000-%')
  or exists(select from private.tc_manual_stripe_channels where provider_account_id='acct_NativeNewAdditions') then
  raise exception 'synthetic_fixture_collision_preserve_existing';end if;
 foreach item in array array['auth.users','auth.sessions','public.organizations','public.drivers','public.trucks',
  'private.tc_admins','private.tc_customers','private.tc_settings','private.tc_payment_requests',
  'private.tc_manual_stripe_channels','private.tc_manual_stripe_bridge_receipts',
  'private.tc_manual_subscription_invoice_tasks','private.tc_manual_subscription_invoice_events',
  'private.tc_manual_subscription_invoice_actions','private.tc_manual_invoice_notice_outbox',
  'private.tc_subscription_financial_cases','private.tc_subscription_financial_entries',
  'private.tc_specialist_verifications','private.tc_specialist_test_organizations'] loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'')::text) from %s t',item) into digest;
  before_state:=before_state||jsonb_build_object(item,digest);
 end loop;
 begin
  insert into auth.users(id,email,raw_user_meta_data) values
   ('c6111000-0000-4000-8000-000000000001','new-additions-admin@example.invalid','{}'),
   ('c6111000-0000-4000-8000-000000000002','new-additions-a@example.invalid',
    '{"truckcontrol_registration":{"contact_name":"Synthetic operator A","company_name":"Synthetic additions A","tax_id":"DEMO-ADDITIONS-A","address":"Synthetic street 111","phone":"+12025550801","requested_plan":"limited"}}'),
   ('c6111000-0000-4000-8000-000000000003','new-additions-b@example.invalid',
    '{"truckcontrol_registration":{"contact_name":"Synthetic operator B","company_name":"Synthetic additions B","tax_id":"DEMO-ADDITIONS-B","address":"Synthetic street 112","phone":"+12025550802","requested_plan":"limited"}}');
  insert into private.tc_auth_legal_consents(user_id,legal_version,source) values
   ('c6111000-0000-4000-8000-000000000002','2026-11-02','authenticated_profile'),
   ('c6111000-0000-4000-8000-000000000003','2026-11-02','authenticated_profile');
  update auth.users set email_confirmed_at=now() where id::text like 'c6111000-%';
  update auth.users set phone='+12025550801',phone_confirmed_at=now() where id='c6111000-0000-4000-8000-000000000002';
  update auth.users set phone='+12025550802',phone_confirmed_at=now() where id='c6111000-0000-4000-8000-000000000003';
  insert into auth.sessions(id,user_id) values
   ('c6112000-0000-4000-8000-000000000001','c6111000-0000-4000-8000-000000000001'),
   ('c6112000-0000-4000-8000-000000000002','c6111000-0000-4000-8000-000000000002'),
   ('c6112000-0000-4000-8000-000000000003','c6111000-0000-4000-8000-000000000003');
  insert into private.tc_admins(user_id) values('c6111000-0000-4000-8000-000000000001');
  foreach uid in array array['c6111000-0000-4000-8000-000000000002'::uuid,'c6111000-0000-4000-8000-000000000003'::uuid] loop
   sid:=replace(uid::text,'c6111000','c6112000')::uuid;
   perform set_config('request.jwt.claim.sub',uid::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid)::text,true);
   execute 'set local role authenticated';
   if public.tc_verified_session() is distinct from true then raise exception 'verified_fixture_session_required';end if;
   perform public.tc_finish_registration();
   execute 'reset role';
  end loop;
  select id into strict a from public.organizations where owner_id='c6111000-0000-4000-8000-000000000002';
  select id into strict b from public.organizations where owner_id='c6111000-0000-4000-8000-000000000003';
  checks:=checks||jsonb_build_array('two_verified_synthetic_companies');
  insert into public.drivers(id,organization_id,name,license,license_expires_on) values
   ('c6113000-0000-4000-8000-000000000001',a,'Primary fictional','DEMO1',current_date+365),
   ('c6113000-0000-4000-8000-000000000002',a,'Second fictional','DEMO2',current_date+365),
   ('c6113000-0000-4000-8000-000000000003',a,'Available fictional','DEMO3',current_date+365),
   ('c6113000-0000-4000-8000-000000000004',b,'Other company fictional','DEMO4',current_date+365);
  perform set_config('request.jwt.claim.sub','c6111000-0000-4000-8000-000000000002',true);
  perform set_config('request.jwt.claims','{"sub":"c6111000-0000-4000-8000-000000000002","role":"authenticated","session_id":"c6112000-0000-4000-8000-000000000002"}',true);
  execute 'set local role authenticated';
  insert into public.trucks(id,organization_id,plate,brand,model,year,inspection_due_on,driver_id,co_driver_id) values
   ('c6114000-0000-4000-8000-000000000001',a,'DEMO A11','MAN','Synthetic',2026,current_date+365,
    'c6113000-0000-4000-8000-000000000001','c6113000-0000-4000-8000-000000000002');
  checks:=checks||jsonb_build_array('authenticated_second_driver_assignment');
  if (select count(*) from public.drivers where organization_id=b)<>0 then raise exception 'cross_company_driver_leak';end if;
  checks:=checks||jsonb_build_array('driver_rls_other_company_hidden');
  denied:=false;begin
   update public.trucks set co_driver_id=driver_id where id='c6114000-0000-4000-8000-000000000001';
  exception when check_violation then denied:=true;end;
  if not denied then raise exception 'same_driver_both_seats_allowed';end if;
  checks:=checks||jsonb_build_array('same_person_two_seats_denied');
  denied:=false;begin
   update public.trucks set co_driver_id='c6113000-0000-4000-8000-000000000004' where id='c6114000-0000-4000-8000-000000000001';
  exception when foreign_key_violation then denied:=true;end;
  if not denied then raise exception 'cross_company_assignment_allowed';end if;
  checks:=checks||jsonb_build_array('cross_company_assignment_denied');
  denied:=false;begin
   insert into public.trucks(organization_id,plate,brand,model,year,inspection_due_on,driver_id) values
    (a,'DEMO B11','Scania','Synthetic',2026,current_date+365,'c6113000-0000-4000-8000-000000000002');
  exception when unique_violation then denied:=true;end;
  if not denied then raise exception 'opposite_seat_double_assignment_allowed';end if;
  checks:=checks||jsonb_build_array('opposite_seat_duplicate_denied');
  denied:=false;begin
   update public.drivers set status='leave' where id='c6113000-0000-4000-8000-000000000002';
  exception when check_violation then denied:=true;end;
  if not denied then raise exception 'assigned_second_driver_leave_allowed';end if;
  checks:=checks||jsonb_build_array('assigned_second_driver_leave_denied');
  update public.trucks set route='Synthetic route' where id='c6114000-0000-4000-8000-000000000001';
  if (select co_driver_id from public.trucks where id='c6114000-0000-4000-8000-000000000001') is distinct from 'c6113000-0000-4000-8000-000000000002'::uuid then raise exception 'legacy_update_lost_second_driver';end if;
  checks:=checks||jsonb_build_array('legacy_update_preserves_second_driver');
  update public.trucks set co_driver_id=null where id='c6114000-0000-4000-8000-000000000001';
  update public.drivers set status='leave' where id='c6113000-0000-4000-8000-000000000002';
  if (select co_driver_id from public.trucks where id='c6114000-0000-4000-8000-000000000001') is not null then raise exception 'explicit_null_failed_to_unassign';end if;
  checks:=checks||jsonb_build_array('explicit_unassignment_allows_driver_leave');
  perform set_config('request.jwt.claims','{"sub":"c6111000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"is_admin":true}}',true);
  if public.tc_verified_session() is distinct from false or exists(select from public.trucks where organization_id=a) then raise exception 'sessionless_claims_exposed_private_trucks';end if;
  checks:=checks||jsonb_build_array('sessionless_claims_cannot_read_private_trucks');
  perform set_config('request.jwt.claims','{"sub":"c6111000-0000-4000-8000-000000000002","role":"authenticated","session_id":"c6112000-0000-4000-8000-000000000002"}',true);
  denied:=false;begin perform public.tc_admin_subscription_incidents('capabilities');
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'company_user_became_global_admin';end if;
  checks:=checks||jsonb_build_array('company_user_admin_endpoint_denied');
  execute 'reset role';
  -- Internal fixture receipt only: NOT evidence of Stripe settlement.
  insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status,net_cents,vat_rate_bps,vat_cents)
   select 'c6115000-0000-4000-8000-000000000001','c6111000-0000-4000-8000-000000000002',p.id,
    p.monthly_cents+private.tc_quote_vat(p.monthly_cents),p.revision,'paid',p.monthly_cents,2100,private.tc_quote_vat(p.monthly_cents)
   from private.tc_plans p where p.id='limited' returning quoted_cents into strict total;
  task:=private.tc_manual_subscription_invoice_intake('acct_NativeNewAdditions','evt_NativeNewPaid','pi_NativeNewPaid',
   'c6115000-0000-4000-8000-000000000001',a,total,now()-interval '1 minute');
  insert into private.tc_manual_stripe_channels(provider_account_id,mode,enabled,isolated_test_instance)
   values('acct_NativeNewAdditions','test',false,true);
  insert into private.tc_manual_stripe_bridge_receipts(provider_event_id,provider_account_id,mode,payment_kind,provider_payment_id,request_id,task_id,proof_sha256)
   values('evt_NativeNewPaid','acct_NativeNewAdditions','test','initial_payment','pi_NativeNewPaid',
    'c6115000-0000-4000-8000-000000000001',task,repeat('0',64));
  select jsonb_build_object('customer',(select to_jsonb(c) from private.tc_customers c where user_id='c6111000-0000-4000-8000-000000000002'),
   'request',(select to_jsonb(r) from private.tc_payment_requests r where id='c6115000-0000-4000-8000-000000000001'),
   'task',(select to_jsonb(t) from private.tc_manual_subscription_invoice_tasks t where id=task)) into baseline_paid;
  data:=jsonb_build_object('event_id','evt_NativeNewRefund','event_type','refund.created','event_created',stamp,'livemode',false,
   'currency','EUR','object_type','refund','object_id','re_NativeNewRefund','status_at_event','succeeded','current_status','succeeded',
   'event_amount_cents',5000,'current_amount_cents',5000,'charge_amount_cents',total,'charge_amount_refunded_cents',5000,
   'event_amount_refunded_cents',null,'payment_intent_id','pi_NativeNewPaid','charge_id','ch_NativeNewPaid','customer_id','cus_NativeNewPaid',
   'invoice_id',null,'subscription_id',null,'invoice_payment_id',null,'invoice_period_start',null,'invoice_period_end',null,'invoice_amount_cents',null);
  execute 'set local role service_role';
  reply:=public.tc_manual_subscription_record_incident('acct_NativeNewAdditions','test',data);
  first_reply:=public.tc_manual_subscription_record_incident('acct_NativeNewAdditions','test',data);
  execute 'reset role';
  select id into strict case_uuid from private.tc_subscription_financial_cases where task_id=task;
  if (select count(*) from private.tc_subscription_financial_entries where case_id=case_uuid and provider_event_id='evt_NativeNewRefund')<>1 then raise exception 'duplicate_provider_entry';end if;
  checks:=checks||jsonb_build_array('provider_observation_and_duplicate_idempotence');
  perform set_config('request.jwt.claim.sub','c6111000-0000-4000-8000-000000000001',true);
  perform set_config('request.jwt.claims','{"sub":"c6111000-0000-4000-8000-000000000001","role":"authenticated","session_id":"c6112000-0000-4000-8000-000000000001"}',true);
  execute 'set local role authenticated';
  reply:=public.tc_admin_subscription_incidents('review',case_uuid,2,'c6116000-0000-4000-8000-000000000001','{"note":"Synthetic review only"}');
  first_reply:=public.tc_admin_subscription_incidents('review',case_uuid,2,'c6116000-0000-4000-8000-000000000001','{"note":"Synthetic review only"}');
  if (first_reply->>'replayed') is distinct from 'true' then raise exception 'admin_replay_not_idempotent';end if;
  checks:=checks||jsonb_build_array('fresh_admin_review_and_stable_operation_replay');
  denied:=false;begin perform public.tc_admin_subscription_incidents('review',case_uuid,2,'c6116000-0000-4000-8000-000000000002','{"note":"Stale synthetic review"}');
  exception when serialization_failure then denied:=true;end;
  if not denied then raise exception 'stale_admin_version_allowed';end if;
  checks:=checks||jsonb_build_array('stale_admin_compare_and_swap_denied');
  execute 'reset role';
  denied:=false;begin update private.tc_subscription_financial_entries set data='{}' where provider_event_id='evt_NativeNewRefund';
  exception when others then denied:=true;end;
  if not denied then raise exception 'financial_audit_mutable';end if;
  checks:=checks||jsonb_build_array('financial_audit_update_denied');
  if baseline_paid is distinct from jsonb_build_object('customer',(select to_jsonb(c) from private.tc_customers c where user_id='c6111000-0000-4000-8000-000000000002'),
   'request',(select to_jsonb(r) from private.tc_payment_requests r where id='c6115000-0000-4000-8000-000000000001'),
   'task',(select to_jsonb(t) from private.tc_manual_subscription_invoice_tasks t where id=task)) then raise exception 'incident_changed_original_payment_or_licence';end if;
  checks:=checks||jsonb_build_array('original_payment_task_and_licence_unchanged');
  delete from auth.sessions where id='c6112000-0000-4000-8000-000000000001';
  execute 'set local role authenticated';
  denied:=false;begin perform public.tc_admin_subscription_incidents('capabilities');
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'revoked_admin_session_allowed';end if;
  execute 'reset role';
  checks:=checks||jsonb_build_array('revoked_admin_session_denied');
  foreach item in array array['public.tc_manual_subscription_record_incident(text,text,jsonb)',
   'public.tc_manual_subscription_known_payment_event(text,text,jsonb)'] loop
   if has_function_privilege('anon',item,'EXECUTE') or has_function_privilege('authenticated',item,'EXECUTE') then raise exception 'provider_endpoint_exposed';end if;
  end loop;
  if has_table_privilege('authenticated','private.tc_subscription_financial_entries','SELECT')
   or has_table_privilege('service_role','private.tc_subscription_financial_entries','INSERT') then raise exception 'ledger_direct_acl_exposed';end if;
  checks:=checks||jsonb_build_array('provider_and_direct_ledger_acl_restricted');
  raise exception using message='TRUCKCONTROL_NEW_ADDITIONS_EXPECTED_ROLLBACK';
 exception when raise_exception then
  if sqlerrm<>'TRUCKCONTROL_NEW_ADDITIONS_EXPECTED_ROLLBACK' then raise;end if;
 end;
 foreach item in array array(select jsonb_object_keys(before_state)) loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'')::text) from %s t',item) into digest;
  after_state:=after_state||jsonb_build_object(item,digest);
 end loop;
 if after_state is distinct from before_state then raise exception 'fixture_rollback_did_not_restore_exact_rows';end if;
 checks:=checks||jsonb_build_array('all_fixture_rows_rolled_back_exactly','old_specialist_attestations_unchanged');
 perform set_config('truckcontrol.new_additions_acceptance',jsonb_build_object('passed',jsonb_array_length(checks),'checks',checks,
  'providers_called',false,'real_payments',false,'fixtures_persisted',false)::text,true);
end;$acceptance$;
select current_setting('truckcontrol.new_additions_acceptance')::jsonb as acceptance;
commit;

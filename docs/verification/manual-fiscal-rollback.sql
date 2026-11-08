-- TruckControl AI only: native SQL acceptance contract, NOT a migration.
-- Review/apply the separately approved fiscal schema before running this file.
-- Written against PR60 SQL fa295babbf3f096202a69df7c53f798085ba5fac and schema61.
-- Never run on FIXPilot. No real Stripe events, charges, emails, PDFs or TicketBAI.
-- Internal 'paid' fixtures below do NOT prove provider settlement.
-- One transaction; synthetic rows, grants, audit and sessions always ROLLBACK.
-- No DELETE/TRUNCATE, global flag changes, persistent DDL or provider functions.
-- CAS checks exercise stale writers, not simultaneous connections/load.
begin;

do $preflight$
declare baseline jsonb;
begin
  if to_regclass('private.tc_manual_subscription_invoice_tasks') is null
    or to_regclass('private.tc_manual_subscription_invoice_actions') is null
    or to_regclass('private.tc_manual_subscription_invoice_documents') is null
    or to_regclass('auth.sessions') is null then
    raise exception 'manual_fiscal_schema_not_installed';
  end if;
  if exists(select from auth.users where id::text like 'faa10000-%')
    or exists(select from auth.sessions where id::text like 'faa11000-%')
    or exists(select from private.tc_payment_requests where id::text like 'faa20000-%')
    or exists(select from private.tc_admins where user_id::text like 'faa10000-%')
    or exists(select from private.tc_manual_subscription_invoice_tasks where provider_account_id='acct_ManualNativeFaa')
    or exists(select from private.tc_manual_subscription_invoice_events where provider_event_id like 'evt_ManualNativeFaa%')
    or exists(select from private.tc_manual_subscription_invoice_actions where operation_id::text like 'faa40000-%')
    or exists(select from private.tc_billing_subscriptions where provider_id like 'sub_ManualNativeFaa%')
    or exists(select from private.tc_subscription_invoices where invoice_id like 'in_ManualNativeFaa%') then
    raise exception 'manual_fiscal_fixture_collision_preserve_existing_work';
  end if;
  if not exists(select from private.tc_settings
    where id and registration_open and enforce_access and not payments_enabled) then
    raise exception 'manual_fiscal_unexpected_settings_do_not_change_them';
  end if;
  
    select jsonb_build_object(
      'users', (select md5(coalesce(jsonb_agg(u.id order by u.id),'[]')::text)
        from auth.users u where u.id::text not like 'faa10000-%'),
      'sessions', (select md5(coalesce(jsonb_agg(s.id order by s.id),'[]')::text)
        from auth.sessions s where s.id::text not like 'faa11000-%'),
      'organizations', (select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]')::text)
        from public.organizations o where o.owner_id::text not like 'faa10000-%'),
      'customers', (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.user_id),'[]')::text)
        from private.tc_customers c where c.user_id::text not like 'faa10000-%'),
      'admins', (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.user_id),'[]')::text)
        from private.tc_admins a where a.user_id::text not like 'faa10000-%'),
      'trucks', (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]')::text) from public.trucks t),
      'drivers', (select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]')::text) from public.drivers d),
      'finance', (select md5(coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]')::text) from public.finance_entries f),
      'plans', (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]')::text) from private.tc_plans p),
      'settings', (select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]')::text) from private.tc_settings s),
      'ai_limits', (select md5(coalesce(jsonb_agg(jsonb_build_object(
        'enabled',p.ai_enabled,'monthly_budget_cents',p.ai_monthly_budget_cents)),'[]')::text)
        from private.tc_provider_settings p),
      'payment_requests', (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]')::text)
        from private.tc_payment_requests p where p.id::text not like 'faa20000-%'),
      'subscriptions', (select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.provider_id),'[]')::text)
        from private.tc_billing_subscriptions s where s.provider_id not like 'sub_ManualNativeFaa%'),
      'subscription_invoices', (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.invoice_id),'[]')::text)
        from private.tc_subscription_invoices i where i.invoice_id not like 'in_ManualNativeFaa%')
    ) into baseline;
  perform set_config('truckcontrol_test.manual_fiscal_before',baseline::text,true);
end;
$preflight$;

-- Native Auth database inserts invoke only the existing SQL registration hooks.
-- No GoTrue signup/reset endpoint or email provider is called.
insert into auth.users(id,email,raw_user_meta_data) values
('faa10000-0000-4000-8000-000000000001','manual-native-admin@example.invalid','{}'),
('faa10000-0000-4000-8000-000000000002','manual-native-a@example.invalid',
 '{"truckcontrol_registration":{"contact_name":"Persona ficticia A","company_name":"Empresa ficticia fiscal A","tax_id":"DEMO-FISCAL-FAA-A","address":"Direccion ficticia 1","phone":"+12025550801","requested_plan":"limited"}}'),
('faa10000-0000-4000-8000-000000000003','manual-native-b@example.invalid',
 '{"truckcontrol_registration":{"contact_name":"Persona ficticia B","company_name":"Empresa ficticia fiscal B","tax_id":"DEMO-FISCAL-FAA-B","address":"Direccion ficticia 2","phone":"+12025550802","requested_plan":"limited"}}');

insert into private.tc_auth_legal_consents(user_id,legal_version,source) values
('faa10000-0000-4000-8000-000000000002','2026-11-02','authenticated_profile'),
('faa10000-0000-4000-8000-000000000003','2026-11-02','authenticated_profile');
update auth.users set email_confirmed_at=now()
  where id in ('faa10000-0000-4000-8000-000000000001',
    'faa10000-0000-4000-8000-000000000002','faa10000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub','faa10000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"faa10000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.tc_finish_registration();
select set_config('request.jwt.claim.sub','faa10000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"faa10000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.tc_finish_registration();
reset role;

insert into private.tc_admins(user_id) values('faa10000-0000-4000-8000-000000000001');
-- Native metadata confirms id/user_id are the only required session columns.
insert into auth.sessions(id,user_id) values
('faa11000-0000-4000-8000-000000000001','faa10000-0000-4000-8000-000000000001'),
('faa11000-0000-4000-8000-000000000002','faa10000-0000-4000-8000-000000000002'),
('faa11000-0000-4000-8000-000000000003','faa10000-0000-4000-8000-000000000003');

do $fixtures$
declare a uuid; b uuid; task_a uuid; task_b uuid;
begin
  select id into strict a from public.organizations where owner_id='faa10000-0000-4000-8000-000000000002';
  select id into strict b from public.organizations where owner_id='faa10000-0000-4000-8000-000000000003';
  perform set_config('truckcontrol_test.manual_org_a',a::text,true);
  perform set_config('truckcontrol_test.manual_org_b',b::text,true);
  insert into private.tc_payment_requests(
    id,user_id,plan_id,quoted_cents,plan_revision,status,net_cents,vat_rate_bps,vat_cents,created_at
  )
  select x.id,x.uid,p.id,36300,p.revision,'paid',30000,2100,6300,'2026-08-01T00:00:00Z'
  from private.tc_plans p cross join (values
    ('faa20000-0000-4000-8000-000000000001'::uuid,'faa10000-0000-4000-8000-000000000002'::uuid),
    ('faa20000-0000-4000-8000-000000000002'::uuid,'faa10000-0000-4000-8000-000000000003'::uuid),
    ('faa20000-0000-4000-8000-000000000003'::uuid,'faa10000-0000-4000-8000-000000000002'::uuid)
  ) x(id,uid) where p.id='limited';
  if (select count(*) from private.tc_payment_requests where id::text like 'faa20000-%')<>3 then
    raise exception 'manual_fiscal_fixture_quotes_missing';
  end if;
  task_a:=private.tc_manual_subscription_invoice_intake(
    'acct_ManualNativeFaa','evt_ManualNativeFaaA','pi_ManualNativeFaaA',
    'faa20000-0000-4000-8000-000000000001',a,36300,now()-interval '1 hour');
  task_b:=private.tc_manual_subscription_invoice_intake(
    'acct_ManualNativeFaa','evt_ManualNativeFaaB','pi_ManualNativeFaaB',
    'faa20000-0000-4000-8000-000000000002',b,36300,now()-interval '1 hour');
  if private.tc_manual_subscription_invoice_intake(
    'acct_ManualNativeFaa','evt_ManualNativeFaaA','pi_ManualNativeFaaA',
    'faa20000-0000-4000-8000-000000000001',a,36300,now()-interval '1 hour')<>task_a then
    raise exception 'manual_fiscal_intake_replay_changed_identity';
  end if;
  perform set_config('truckcontrol_test.manual_task_a',task_a::text,true);
  perform set_config('truckcontrol_test.manual_task_b',task_b::text,true);
end;
$fixtures$;

-- Check the actual SQL role and policy boundary, not a UI/metadata flag.
do $boundary$
declare n integer; name text;
begin
  select count(*) into n from pg_class c join pg_namespace s on s.oid=c.relnamespace
    where s.nspname='private' and c.relname in (
      'tc_manual_subscription_invoice_tasks','tc_manual_subscription_invoice_events',
      'tc_manual_subscription_invoice_actions','tc_manual_subscription_invoice_documents')
      and c.relrowsecurity;
  if n<>4 then raise exception 'manual_fiscal_rls_missing'; end if;
  foreach name in array array['tc_manual_subscription_invoice_tasks','tc_manual_subscription_invoice_events',
    'tc_manual_subscription_invoice_actions','tc_manual_subscription_invoice_documents'] loop
    if has_table_privilege('authenticated','private.'||name,'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('anon','private.'||name,'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'manual_fiscal_direct_ledger_grant';
    end if;
  end loop;
  if has_function_privilege('anon',
    'public.tc_admin_manual_subscription_invoices(text,uuid,bigint,uuid,jsonb,uuid)','EXECUTE')
    or has_function_privilege('authenticated',
    'private.tc_manual_subscription_invoice_intake(text,text,text,uuid,uuid,integer,timestamptz)','EXECUTE')
    or has_function_privilege('authenticated',
    'private.tc_manual_subscription_invoice_renewal_intake(text,text,text,text,uuid,integer,timestamptz)','EXECUTE') then
    raise exception 'manual_fiscal_privileged_intake_exposed';
  end if;
end;
$boundary$;

do $operator$
declare
  a uuid:=current_setting('truckcontrol_test.manual_task_a')::uuid;
  b uuid:=current_setting('truckcontrol_test.manual_task_b')::uuid;
  org_a uuid:=current_setting('truckcontrol_test.manual_org_a')::uuid;
  buyer jsonb:='{"company_name":"Empresa ficticia validada","tax_id":"DEMO-FAA-VALIDADO","address":"Direccion fiscal de prueba 123","email":"manual-native-validated@example.invalid","evidence_reference":"Validacion sintetica controlada, no factura"}';
  first_result jsonb; reply jsonb; before_task jsonb; before_actions jsonb;
  denied boolean; tbl text;
begin
  select to_jsonb(t) into strict before_task from private.tc_manual_subscription_invoice_tasks t where id=a;
  perform set_config('request.jwt.claim.sub','faa10000-0000-4000-8000-000000000001',true);
  perform set_config('request.jwt.claims','{"sub":"faa10000-0000-4000-8000-000000000001","role":"authenticated","session_id":"faa11000-0000-4000-8000-000000000001"}',true);
  execute 'set local role authenticated';
  reply:=public.tc_admin_manual_subscription_invoices('capabilities');
  if reply->>'document_upload_ready'<>'false' or reply->>'payments_ready'<>'false'
    or reply->>'delivery_verified'<>'false' then raise exception 'manual_fiscal_false_readiness'; end if;
  reply:=public.tc_admin_manual_subscription_invoices('detail',a);
  if reply->'items'->0->>'buyer_validated'<>'false'
    or (reply->'items'->0->>'row_version')::bigint<>1 then raise exception 'manual_fiscal_profile_treated_as_validation'; end if;

  denied:=false;
  begin
    perform public.tc_admin_manual_subscription_invoices('register_invoice',a,1,
      'faa40000-0000-4000-8000-000000000010','{}');
  exception when check_violation then denied:=true; end;
  if not denied then raise exception 'manual_fiscal_unvalidated_buyer_accepted'; end if;

  first_result:=public.tc_admin_manual_subscription_invoices('validate_buyer',a,1,
    'faa40000-0000-4000-8000-000000000001',buyer);
  reply:=public.tc_admin_manual_subscription_invoices('validate_buyer',a,1,
    'faa40000-0000-4000-8000-000000000001',buyer);
  if first_result->>'replayed'<>'false' or reply->>'replayed'<>'true'
    or reply->'task'<>first_result->'task'
    or first_result->'task'->>'buyer_snapshot_origin'<>'operator_validated'
    or first_result->'task'->>'buyer_validated'<>'true' then
    raise exception 'manual_fiscal_validation_or_replay_failed'; end if;

  denied:=false;
  begin
    perform public.tc_admin_manual_subscription_invoices('validate_buyer',a,1,
      'faa40000-0000-4000-8000-000000000001',buyer||'{"tax_id":"DEMO-FAA-CONFLICT"}');
  exception when check_violation then denied:=true; end;
  if not denied then raise exception 'manual_fiscal_conflicting_replay_accepted'; end if;
  denied:=false;
  begin
    perform public.tc_admin_manual_subscription_invoices('validate_buyer',a,1,
      'faa40000-0000-4000-8000-000000000002',buyer);
  exception when serialization_failure then denied:=true; end;
  if not denied then raise exception 'manual_fiscal_stale_writer_accepted'; end if;

  reply:=public.tc_admin_manual_subscription_invoices('validate_buyer',a,2,
    'faa40000-0000-4000-8000-000000000003',buyer||'{"address":"Direccion corregida ficticia 456"}');
  if (reply->'task'->>'row_version')::bigint<>3
    or reply->'task'->>'buyer_address'<>'Direccion corregida ficticia 456' then
    raise exception 'manual_fiscal_correction_not_audited'; end if;
  denied:=false;
  begin
    perform public.tc_admin_manual_subscription_invoices('validate_buyer',a,3,
      'faa40000-0000-4000-8000-000000000004',buyer||'{"evidence_reference":""}');
  exception when check_violation then denied:=true; end;
  if not denied then raise exception 'manual_fiscal_empty_evidence_accepted'; end if;

  -- No PDF evidence is manufactured. A syntactically valid private key is
  -- still rejected until an independent backend verifies its actual object.
  denied:=false;
  begin
    perform public.tc_admin_manual_subscription_invoices('register_invoice',a,3,
      'faa40000-0000-4000-8000-000000000005',jsonb_build_object(
        'invoice_number','SYNTHETIC-NOT-A-FISCAL-INVOICE',
        'ticketbai_reference','SYNTHETIC-NOT-TICKETBAI',
        'issued_at',now(),'pdf_object_key','subscription-invoices/'||org_a||'/'||a||'/faa50000-0000-4000-8000-000000000001.pdf',
        'pdf_sha256',repeat('0',64)));
  exception when check_violation then
    if sqlerrm<>'manual_invoice_document_not_verified' then raise; end if;
    denied:=true;
  end;
  if not denied then raise exception 'manual_fiscal_unverified_pdf_accepted'; end if;
  denied:=false;
  begin
    perform public.tc_admin_manual_subscription_invoices('report_sent',a,3,
      'faa40000-0000-4000-8000-000000000006',jsonb_build_object(
        'sent_at',now(),'recipient',buyer->>'email','reference','Synthetic no-send probe'));
  exception when check_violation then denied:=true; end;
  if not denied then raise exception 'manual_fiscal_send_without_invoice_accepted'; end if;

  reply:=public.tc_admin_manual_subscription_invoices('needs_review',b,1,
    'faa40000-0000-4000-8000-000000000007','{"reason":"customer_data_invalid"}');
  if reply->'task'->>'status'<>'needs_review' then raise exception 'manual_fiscal_review_missing'; end if;
  denied:=false;
  begin
    perform public.tc_admin_manual_subscription_invoices('validate_buyer',b,2,
      'faa40000-0000-4000-8000-000000000008',buyer);
  exception when check_violation then denied:=true; end;
  if not denied then raise exception 'manual_fiscal_terminal_review_reopened'; end if;
  execute 'reset role';

  if (select to_jsonb(t) from private.tc_manual_subscription_invoice_tasks t where id=a)<>before_task then
    raise exception 'manual_fiscal_original_snapshot_rewritten'; end if;
  if (select count(*) from private.tc_manual_subscription_invoice_actions where task_id=a)<>2
    or (select count(*) from private.tc_manual_subscription_invoice_actions where task_id=b)<>1
    or exists(select from private.tc_manual_subscription_invoice_actions
      where task_id in(a,b) and actor_id<>'faa10000-0000-4000-8000-000000000001') then
    raise exception 'manual_fiscal_actions_partial_or_wrong_actor'; end if;
  select jsonb_agg(to_jsonb(x) order by x.task_id,x.row_version) into before_actions
    from private.tc_manual_subscription_invoice_actions x where x.task_id in(a,b);
  denied:=false;
  begin
    update private.tc_manual_subscription_invoice_actions set data=data where task_id=a;
  exception when check_violation then denied:=true; end;
  if not denied or (select jsonb_agg(to_jsonb(x) order by x.task_id,x.row_version)
    from private.tc_manual_subscription_invoice_actions x where x.task_id in(a,b))<>before_actions then
    raise exception 'manual_fiscal_append_only_audit_changed'; end if;

  -- A live role revocation must reject even an otherwise matching replay.
  -- Move ONLY the synthetic grant, then roll back that subtransaction. No
  -- production grants are deleted and no change survives this probe.
  begin
    update private.tc_admins set user_id='faa10000-0000-4000-8000-000000000003'
      where user_id='faa10000-0000-4000-8000-000000000001';
    execute 'set local role authenticated';
    denied:=false;
    begin
      perform public.tc_admin_manual_subscription_invoices('validate_buyer',a,1,
        'faa40000-0000-4000-8000-000000000001',buyer);
    exception when insufficient_privilege then denied:=true; end;
    execute 'reset role';
    if not denied then raise exception 'manual_fiscal_revoked_role_replay_allowed'; end if;
    raise exception 'synthetic_grant_probe_rollback' using errcode='P9001';
  exception when sqlstate 'P9001' then null;
  end;

  -- Current identity/session, not user-editable metadata, controls all reads.
  perform set_config('request.jwt.claim.sub','faa10000-0000-4000-8000-000000000002',true);
  perform set_config('request.jwt.claims','{"sub":"faa10000-0000-4000-8000-000000000002","role":"authenticated","session_id":"faa11000-0000-4000-8000-000000000002","user_metadata":{"is_admin":true,"role":"admin"}}',true);
  execute 'set local role authenticated';
  for reply in select jsonb_build_object('task',v) from unnest(array[a,b]) v loop
    denied:=false;
    begin
      perform public.tc_admin_manual_subscription_invoices('detail',(reply->>'task')::uuid);
    exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'manual_fiscal_customer_read_global_queue'; end if;
  end loop;
  foreach tbl in array array['tc_manual_subscription_invoice_tasks','tc_manual_subscription_invoice_events',
    'tc_manual_subscription_invoice_actions','tc_manual_subscription_invoice_documents'] loop
    denied:=false;
    begin execute 'select count(*) from private.'||quote_ident(tbl);
    exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'manual_fiscal_private_ledger_visible'; end if;
  end loop;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub','faa10000-0000-4000-8000-000000000001',true);
  perform set_config('request.jwt.claims','{"sub":"faa10000-0000-4000-8000-000000000001","role":"authenticated","session_id":"faa11000-0000-4000-8000-000000000099"}',true);
  execute 'set local role authenticated';
  denied:=false;
  begin perform public.tc_admin_manual_subscription_invoices('detail',a);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'manual_fiscal_missing_session_accepted'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  denied:=false;
  begin perform public.tc_admin_manual_subscription_invoices('list');
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'manual_fiscal_anonymous_operator_allowed'; end if;
  execute 'reset role';
end;
$operator$;

do $renewals$
declare
  org_a uuid:=current_setting('truckcontrol_test.manual_org_a')::uuid;
  org_b uuid:=current_setting('truckcontrol_test.manual_org_b')::uuid;
  first_task uuid; second_task uuid; denied boolean; before_rows jsonb;
begin
  insert into private.tc_billing_subscriptions(
    provider_id,user_id,request_id,customer_id,plan_id,monthly_cents,currency,state,
    cancel_at_period_end,period_end,event_created
  ) values('sub_ManualNativeFaa','faa10000-0000-4000-8000-000000000002',
    'faa20000-0000-4000-8000-000000000003','cus_ManualNativeFaa','limited',36300,'EUR',
    'active',false,'2026-12-01T00:00:00Z',1793491200);
  insert into private.tc_subscription_invoices(
    invoice_id,subscription_id,user_id,amount_cents,currency,period_start,period_end
  ) values
    ('in_ManualNativeFaaSep','sub_ManualNativeFaa','faa10000-0000-4000-8000-000000000002',
      36300,'EUR','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),
    ('in_ManualNativeFaaOct','sub_ManualNativeFaa','faa10000-0000-4000-8000-000000000002',
      36300,'EUR','2026-10-01T00:00:00Z','2026-11-01T00:00:00Z');
  first_task:=private.tc_manual_subscription_invoice_renewal_intake(
    'acct_ManualNativeFaa','evt_ManualNativeFaaSep','in_ManualNativeFaaSep',
    'sub_ManualNativeFaa',org_a,36300,'2026-09-01T00:01:00Z');
  if private.tc_manual_subscription_invoice_renewal_intake(
    'acct_ManualNativeFaa','evt_ManualNativeFaaSep','in_ManualNativeFaaSep',
    'sub_ManualNativeFaa',org_a,36300,'2026-09-01T00:01:00Z')<>first_task then
    raise exception 'manual_fiscal_renewal_replay_changed_identity'; end if;
  second_task:=private.tc_manual_subscription_invoice_renewal_intake(
    'acct_ManualNativeFaa','evt_ManualNativeFaaOct','in_ManualNativeFaaOct',
    'sub_ManualNativeFaa',org_a,36300,'2026-10-01T00:01:00Z');
  if first_task=second_task
    or (select count(*) from private.tc_manual_subscription_invoice_tasks
      where request_id='faa20000-0000-4000-8000-000000000003')<>2
    or (select period_end from private.tc_manual_subscription_invoice_tasks where id=first_task)
      <>(select period_start from private.tc_manual_subscription_invoice_tasks where id=second_task) then
    raise exception 'manual_fiscal_renewal_periods_collapsed'; end if;
  select jsonb_agg(to_jsonb(t) order by t.id) into before_rows
    from private.tc_manual_subscription_invoice_tasks t where t.provider_account_id='acct_ManualNativeFaa';
  denied:=false;
  begin
    perform private.tc_manual_subscription_invoice_renewal_intake(
      'acct_ManualNativeFaa','evt_ManualNativeFaaCrossCompany','in_ManualNativeFaaSep',
      'sub_ManualNativeFaa',org_b,36300,'2026-09-01T00:01:00Z');
  exception when check_violation then denied:=true; end;
  if not denied then raise exception 'manual_fiscal_foreign_company_renewal_accepted'; end if;
  denied:=false;
  begin
    perform private.tc_manual_subscription_invoice_renewal_intake(
      'acct_ManualNativeFaa','evt_ManualNativeFaaWrongAmount','in_ManualNativeFaaSep',
      'sub_ManualNativeFaa',org_a,84700,'2026-09-01T00:01:00Z');
  exception when check_violation then denied:=true; end;
  if not denied then raise exception 'manual_fiscal_foreign_amount_renewal_accepted'; end if;
  denied:=false;
  begin
    perform private.tc_manual_subscription_invoice_intake(
      'acct_ManualNativeFaa','evt_ManualNativeFaaNoPeriod','pi_ManualNativeFaaNoPeriod',
      'faa20000-0000-4000-8000-000000000003',org_a,36300,now()-interval '1 hour');
  exception when check_violation then denied:=true; end;
  if not denied then raise exception 'manual_fiscal_recurring_order_without_period_accepted'; end if;
  if (select jsonb_agg(to_jsonb(t) order by t.id) from private.tc_manual_subscription_invoice_tasks t
    where t.provider_account_id='acct_ManualNativeFaa')<>before_rows then
    raise exception 'manual_fiscal_failed_renewal_left_partial_task'; end if;
end;
$renewals$;

do $unchanged$
declare after_state jsonb;
begin
  
    select jsonb_build_object(
      'users', (select md5(coalesce(jsonb_agg(u.id order by u.id),'[]')::text)
        from auth.users u where u.id::text not like 'faa10000-%'),
      'sessions', (select md5(coalesce(jsonb_agg(s.id order by s.id),'[]')::text)
        from auth.sessions s where s.id::text not like 'faa11000-%'),
      'organizations', (select md5(coalesce(jsonb_agg(to_jsonb(o) order by o.id),'[]')::text)
        from public.organizations o where o.owner_id::text not like 'faa10000-%'),
      'customers', (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.user_id),'[]')::text)
        from private.tc_customers c where c.user_id::text not like 'faa10000-%'),
      'admins', (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.user_id),'[]')::text)
        from private.tc_admins a where a.user_id::text not like 'faa10000-%'),
      'trucks', (select md5(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]')::text) from public.trucks t),
      'drivers', (select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]')::text) from public.drivers d),
      'finance', (select md5(coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]')::text) from public.finance_entries f),
      'plans', (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]')::text) from private.tc_plans p),
      'settings', (select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]')::text) from private.tc_settings s),
      'ai_limits', (select md5(coalesce(jsonb_agg(jsonb_build_object(
        'enabled',p.ai_enabled,'monthly_budget_cents',p.ai_monthly_budget_cents)),'[]')::text)
        from private.tc_provider_settings p),
      'payment_requests', (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]')::text)
        from private.tc_payment_requests p where p.id::text not like 'faa20000-%'),
      'subscriptions', (select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.provider_id),'[]')::text)
        from private.tc_billing_subscriptions s where s.provider_id not like 'sub_ManualNativeFaa%'),
      'subscription_invoices', (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.invoice_id),'[]')::text)
        from private.tc_subscription_invoices i where i.invoice_id not like 'in_ManualNativeFaa%')
    ) into after_state;
  if after_state<>current_setting('truckcontrol_test.manual_fiscal_before')::jsonb then
    raise exception 'manual_fiscal_existing_business_or_flags_changed';
  end if;
  if (select count(*) from private.tc_manual_subscription_invoice_tasks where provider_account_id='acct_ManualNativeFaa')<>4
    or exists(select from private.tc_manual_subscription_invoice_documents d
      join private.tc_manual_subscription_invoice_tasks t on t.id=d.task_id
      where t.provider_account_id='acct_ManualNativeFaa') then
    raise exception 'manual_fiscal_unexpected_synthetic_evidence';
  end if;
end;
$unchanged$;

select 'manual-fiscal-rollback-v1' as contract,'passed' as result,
  2 as synthetic_companies,0 as provider_calls,0 as real_emails_sent,
  false as stripe_settlement_proven,false as ticketbai_issuance_proven,
  false as document_delivery_proven,'stale_writer_cas_only' as concurrency_scope;
rollback;

-- A second independent result proves that this exact transaction left no rows.
select 'manual-fiscal-rollback-cleanup-v1' as contract,
  (select count(*)::int from auth.users where id::text like 'faa10000-%') as fixture_users_remaining,
  (select count(*)::int from auth.sessions where id::text like 'faa11000-%') as fixture_sessions_remaining,
  (select count(*)::int from private.tc_admins where user_id::text like 'faa10000-%') as fixture_admins_remaining,
  (select count(*)::int from private.tc_payment_requests where id::text like 'faa20000-%') as fixture_requests_remaining,
  (select count(*)::int from private.tc_manual_subscription_invoice_tasks where provider_account_id='acct_ManualNativeFaa') as fixture_tasks_remaining,
  (select count(*)::int from private.tc_manual_subscription_invoice_events where provider_event_id like 'evt_ManualNativeFaa%') as fixture_events_remaining,
  (select count(*)::int from private.tc_manual_subscription_invoice_actions where operation_id::text like 'faa40000-%') as fixture_actions_remaining,
  (select count(*)::int from private.tc_billing_subscriptions where provider_id like 'sub_ManualNativeFaa%') as fixture_subscriptions_remaining,
  (select count(*)::int from private.tc_subscription_invoices where invoice_id like 'in_ManualNativeFaa%') as fixture_invoices_remaining;

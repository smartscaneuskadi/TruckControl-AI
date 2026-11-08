-- Session-aware contract, 2026-11-08. Source: docs/verification/commercial-records-rollback.sql
-- Original Git blob: 60d78b0f35178d14b8984075cec894e6dc3e69a3. Original source remains unchanged.
-- Only mock Auth sessions/JWT fixtures extended; all original assertions,
-- economic operations, RLS denials, provider counters and rollback retained.
-- TruckControl only. All synthetic records and audit entries are rolled back.
begin;
do $$begin
 if exists(select from auth.users where id::text like 'fcf10000-%') then raise exception 'Fixture collision: preserve existing work';end if;
 if not(select registration_open and enforce_access and not payments_enabled and not sms_ready from private.tc_settings where id) then raise exception 'Unexpected live settings';end if;
end$$;
insert into auth.users(id,email,raw_user_meta_data) values
('fcf10000-0000-4000-8000-000000000001','commercial-a@example.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia A","company_name":"Comercial ficticia A","tax_id":"DEMO-COM-NATIVE-A","address":"Direccion ficticia 1","phone":"+12025550701","requested_plan":"full"}}'),
('fcf10000-0000-4000-8000-000000000002','commercial-b@example.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia B","company_name":"Comercial ficticia B","tax_id":"DEMO-COM-NATIVE-B","address":"Direccion ficticia 2","phone":"+12025550702","requested_plan":"full"}}');
insert into private.tc_auth_legal_consents(user_id,legal_version,source) values
('fcf10000-0000-4000-8000-000000000001','2026-11-02','authenticated_profile'),('fcf10000-0000-4000-8000-000000000002','2026-11-02','authenticated_profile');
update auth.users set email_confirmed_at=now() where id in('fcf10000-0000-4000-8000-000000000001','fcf10000-0000-4000-8000-000000000002');
select set_config('truckcontrol_test.com_session_a',gen_random_uuid()::text,true);
select set_config('truckcontrol_test.com_session_b',gen_random_uuid()::text,true);
insert into auth.sessions(id,user_id) values
(current_setting('truckcontrol_test.com_session_a')::uuid,'fcf10000-0000-4000-8000-000000000001'),
(current_setting('truckcontrol_test.com_session_b')::uuid,'fcf10000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','fcf10000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','fcf10000-0000-4000-8000-000000000001','role','authenticated','session_id',current_setting('truckcontrol_test.com_session_a'))::text,true);
select public.tc_finish_registration()->>'active' as fixture_a_active;
select set_config('request.jwt.claim.sub','fcf10000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','fcf10000-0000-4000-8000-000000000002','role','authenticated','session_id',current_setting('truckcontrol_test.com_session_b'))::text,true);
select public.tc_finish_registration()->>'active' as fixture_b_active;
reset role;
update private.tc_customers set trial_plan_id='full' where user_id in('fcf10000-0000-4000-8000-000000000001','fcf10000-0000-4000-8000-000000000002');
select set_config('truckcontrol_test.com_org',(select id::text from public.organizations where owner_id='fcf10000-0000-4000-8000-000000000001'),true);
select set_config('truckcontrol_test.com_other',(select id::text from public.organizations where owner_id='fcf10000-0000-4000-8000-000000000002'),true);
insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on) values
('fcf20000-0000-4000-8000-000000000001',current_setting('truckcontrol_test.com_org')::uuid,'DEMO-COM-1','Ficticio','Demo',2020,1000,'available','2050-01-01'),
('fcf20000-0000-4000-8000-000000000002',current_setting('truckcontrol_test.com_org')::uuid,'DEMO-COM-2','Ficticio','Demo',2020,1000,'available','2050-01-01');
insert into private.fleet_records(id,organization_id,kind,payload) values('fcf30000-0000-4000-8000-000000000001',current_setting('truckcontrol_test.com_org')::uuid,'trips',jsonb_build_object('reference','DEMO-COM-001','customerId',null,'truckId','fcf20000-0000-4000-8000-000000000001','driverId',null,'trailerId',null,'origin','Bilbao ficticio','destination','Lisboa ficticia','startOn',current_date,'endOn',current_date,'status','completed','distanceKm',500,'amountCents',100000,'notes','Ficticio'));
insert into public.finance_entries(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km) values
('fcf40000-0000-4000-8000-000000000001',current_setting('truckcontrol_test.com_org')::uuid,'fcf20000-0000-4000-8000-000000000001','expense','Coste ficticio',current_date,20000,'tolls','pending',0),
('fcf40000-0000-4000-8000-000000000002',current_setting('truckcontrol_test.com_org')::uuid,'fcf20000-0000-4000-8000-000000000002','expense','Otro camion ficticio',current_date,30000,'tolls','pending',0);
set local role authenticated;
select set_config('request.jwt.claim.sub','fcf10000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','fcf10000-0000-4000-8000-000000000001','role','authenticated','session_id',current_setting('truckcontrol_test.com_session_a'))::text,true);
do $$declare o uuid:=current_setting('truckcontrol_test.com_org')::uuid;t uuid:='fcf30000-0000-4000-8000-000000000001';d jsonb;s jsonb;r jsonb;denied boolean:=false;begin
 d:='{"id":"fcf50000-0000-4000-8000-000000000001","fields":{"name":"Taller ficticio","tax_id":"demo-native-supplier","email":"","phone":"","address":"","notes":"","archived":false}}';
 s:=public.tc_company_suppliers(o,'save',d);
 if s->'row'->>'tax_id'<>'DEMO-NATIVE-SUPPLIER' or public.tc_company_suppliers(o,'save',d)<>s then raise exception 'Supplier create/replay failed';end if;
 d:=jsonb_set(d,'{fields,archived}','true')||'{"expected_version":1}';s:=public.tc_company_suppliers(o,'save',d);
 if (s->'row'->>'row_version')::int<>2 or not(s->'row'->>'archived')::boolean then raise exception 'Supplier archive/version failed';end if;
 begin perform public.tc_company_suppliers(o,'save',jsonb_set(d,'{fields,name}','"Obsoleto"'));exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'Stale supplier update accepted';end if;
 r:=public.tc_trip_finance(o,'summary',jsonb_build_object('trip_id',t));
 if (r->>'income_cents')::bigint<>0 or r->>'reviewed_margin_cents' is not null then raise exception 'Quote counted as income or false review';end if;
 perform public.tc_book_record(o,t,1);
 d:=jsonb_build_object('trip_id',t,'entry_id','fcf40000-0000-4000-8000-000000000001','expected_entry_version',1);
 s:=public.tc_trip_finance(o,'link',d);
 if (s->>'recorded_margin_cents')::bigint<>80000 or public.tc_trip_finance(o,'link',d)<>s or jsonb_array_length(s->'rows')<>2 then raise exception 'Trip accounting/deduplication failed';end if;
 r:=public.tc_trip_finance(o,'candidates',jsonb_build_object('trip_id',t));if jsonb_array_length(r->'rows')<>0 then raise exception 'Candidates include used or other-truck entries';end if;
 r:=public.tc_trip_finance(o,'review',jsonb_build_object('trip_id',t,'expected_fingerprint',s->>'fingerprint'));if not(r->>'reviewed')::boolean or (r->>'reviewed_margin_cents')::bigint<>80000 then raise exception 'Review failed';end if;
 denied:=false;begin perform public.tc_trip_finance(o,'link',d||'{"entry_id":"fcf40000-0000-4000-8000-000000000002"}');exception when check_violation then denied:=true;end;if not denied then raise exception 'Other truck accepted';end if;
 if jsonb_array_length(public.tc_commercial_backup_page(o,'suppliers')->'rows')<>1 or jsonb_array_length(public.tc_commercial_backup_page(o,'trip_links')->'rows')<>1 or jsonb_array_length(public.tc_commercial_backup_page(o,'trip_reviews')->'rows')<>1 then raise exception 'Commercial export lost records';end if;
end$$;
reset role;
insert into private.company_suppliers(organization_id,id,name,tax_id) select current_setting('truckcontrol_test.com_org')::uuid,('fcf50000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Proveedor ficticio '||n,'DEMO-COM-SUP-'||n from generate_series(2,205)n;
update public.finance_entries set amount_cents=25000 where id='fcf40000-0000-4000-8000-000000000001';
set local role authenticated;
do $$declare o uuid:=current_setting('truckcontrol_test.com_org')::uuid;a jsonb;b jsonb;s jsonb;denied boolean:=false;begin
 a:=public.tc_company_suppliers(o,'list');b:=public.tc_company_suppliers(o,'list',jsonb_build_object('after',a->'rows'->199->>'id'));
 if jsonb_array_length(a->'rows')<>200 or jsonb_array_length(b->'rows')<>5 then raise exception 'Supplier pagination truncated';end if;
 s:=public.tc_trip_finance(o,'summary','{"trip_id":"fcf30000-0000-4000-8000-000000000001"}');if (s->>'reviewed')::boolean or s->>'reviewed_margin_cents' is not null or (s->>'recorded_margin_cents')::bigint<>75000 then raise exception 'Changed expense kept stale review';end if;
 begin perform 1 from private.company_suppliers;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Direct private access allowed';end if;
end$$;
select set_config('request.jwt.claim.sub','fcf10000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','fcf10000-0000-4000-8000-000000000002','role','authenticated','session_id',current_setting('truckcontrol_test.com_session_b'))::text,true);
do $$declare denied boolean:=false;o uuid:=current_setting('truckcontrol_test.com_org')::uuid;begin
 begin perform public.tc_company_suppliers(o,'list');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Foreign supplier access allowed';end if;
 denied:=false;begin perform public.tc_trip_finance(o,'summary','{"trip_id":"fcf30000-0000-4000-8000-000000000001"}');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Foreign trip access allowed';end if;
end$$;
reset role;
insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values(current_setting('truckcontrol_test.com_org')::uuid,'fcf10000-0000-4000-8000-000000000002','viewer','active','fcf10000-0000-4000-8000-000000000001');
set local role authenticated;
do $$declare denied boolean:=false;o uuid:=current_setting('truckcontrol_test.com_org')::uuid;begin
 if jsonb_array_length(public.tc_company_suppliers(o,'list')->'rows')<>200 then raise exception 'Viewer read failed';end if;
 begin perform public.tc_company_suppliers(o,'save','{}');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Viewer write allowed';end if;
 denied:=false;begin perform public.tc_commercial_backup_page(o,'suppliers');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Viewer backup allowed';end if;
end$$;
reset role;
update private.tc_memberships set status='revoked' where organization_id=current_setting('truckcontrol_test.com_org')::uuid and user_id='fcf10000-0000-4000-8000-000000000002';
set local role authenticated;
do $$declare denied boolean:=false;begin begin perform public.tc_company_suppliers(current_setting('truckcontrol_test.com_org')::uuid,'list');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Revoked membership still allowed';end if;end$$;
reset role;
select 'commercial-records-rollback-v1' as contract,'passed' as result,0 as provider_calls,0 as real_emails_sent;
rollback;

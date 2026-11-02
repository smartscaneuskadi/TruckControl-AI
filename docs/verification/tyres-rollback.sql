-- Only truckcontrol-ai. Synthetic tenant data; no providers, files or real sessions.
begin;
do $$ begin
 if exists(select 1 from auth.users where id::text like 'f6100000-%') or exists(select 1 from public.trucks where id::text like 'f6200000-%') or exists(select 1 from private.company_tyres where id::text like 'f6300000-%') then
  raise exception 'Fixture collision: preserve existing work';end if;
 if not (select registration_open and enforce_access and not payments_enabled and not sms_ready from private.tc_settings where id) then raise exception 'Unexpected live settings';end if;
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('f6100000-0000-4000-8000-000000000001','tyre-a@truckcontrol-test.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia A","company_name":"Cubiertas ficticias A","tax_id":"DEMO-TYRE-A","address":"Direccion ficticia 1","phone":"+12025550121","requested_plan":"full"}}'),
 ('f6100000-0000-4000-8000-000000000002','tyre-b@truckcontrol-test.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia B","company_name":"Cubiertas ficticias B","tax_id":"DEMO-TYRE-B","address":"Direccion ficticia 2","phone":"+12025550122","requested_plan":"full"}}');
insert into private.tc_auth_legal_consents(user_id,legal_version,source) values
 ('f6100000-0000-4000-8000-000000000001','2026-11-02','authenticated_profile'),
 ('f6100000-0000-4000-8000-000000000002','2026-11-02','authenticated_profile');
update auth.users set email_confirmed_at=now() where id in('f6100000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','f6100000-0000-4000-8000-000000000001',true);
select (public.tc_finish_registration()->>'active')::boolean as fixture_a_activated;
select set_config('request.jwt.claim.sub','f6100000-0000-4000-8000-000000000002',true);
select (public.tc_finish_registration()->>'active')::boolean as fixture_b_activated;
reset role;
update private.tc_customers set module_overrides='{"maintenance":true}' where user_id in('f6100000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000002');
select set_config('truckcontrol_test.tyre_org_a',(select id::text from public.organizations where owner_id='f6100000-0000-4000-8000-000000000001'),true);
select set_config('truckcontrol_test.tyre_org_b',(select id::text from public.organizations where owner_id='f6100000-0000-4000-8000-000000000002'),true);
insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on) values
 ('f6200000-0000-4000-8000-000000000001',current_setting('truckcontrol_test.tyre_org_a')::uuid,'DEMO-121','Ficticio','Demo',2020,1000,'available','2050-01-01'),
 ('f6200000-0000-4000-8000-000000000002',current_setting('truckcontrol_test.tyre_org_b')::uuid,'DEMO-122','Ficticio','Demo',2020,1000,'available','2050-01-01');
select set_config('truckcontrol_test.tyre_data','{"code":"DEMO-TYRE-1","truckId":"f6200000-0000-4000-8000-000000000001","position":"Eje 1 izquierda","status":"mounted","brand":"Ficticio","model":"Demo","size":"315/70 R22.5","installedOn":"2025-12-31","installedKm":100,"measuredOn":"2026-01-01","treadTenthsMm":15,"pressureKpa":850,"minTreadTenthsMm":20,"minPressureKpa":900,"maxPressureKpa":1000,"nextCheckOn":"2026-01-02","notes":"Datos ficticios"}',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','f6100000-0000-4000-8000-000000000001',true);
do $$ declare o uuid:=current_setting('truckcontrol_test.tyre_org_a')::uuid;d jsonb:=current_setting('truckcontrol_test.tyre_data')::jsonb;r jsonb;denied boolean:=false;begin
 r:=public.tc_save_tyre(o,'f6300000-0000-4000-8000-000000000001',d);
 if r->>'organizationId'<>o::text or (r->>'version')::integer<>1 then raise exception 'Native save or scope failed';end if;
 if public.tc_save_tyre(o,'f6300000-0000-4000-8000-000000000001',d)<>r then raise exception 'Create replay not idempotent';end if;
 if jsonb_array_length(public.tc_tyre_page(o,'history',null,'f6300000-0000-4000-8000-000000000001'))<>1 then raise exception 'Replay duplicated revision';end if;
 begin perform public.tc_save_tyre(o,'f6300000-0000-4000-8000-000000000002',jsonb_set(d,'{code}','"DEMO-TYRE-2"'));
 exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Mounted position duplicated';end if;
 denied:=false;
 begin perform public.tc_save_tyre(o,'f6300000-0000-4000-8000-000000000002',d||'{"code":"OTRO","truckId":"f6200000-0000-4000-8000-000000000002"}');
 exception when foreign_key_violation then denied:=true;end;
 if not denied then raise exception 'Foreign vehicle accepted';end if;
 denied:=false;
 begin perform public.tc_save_tyre(o,'f6300000-0000-4000-8000-000000000002',d||'{"code":"OTRO","amountCents":10000}');
 exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Untrusted financial field accepted';end if;
 d:=d||'{"pressureKpa":950,"notes":"Segunda revision ficticia"}';
 r:=public.tc_save_tyre(o,'f6300000-0000-4000-8000-000000000001',d,1);
 if (r->>'version')::integer<>2 or public.tc_save_tyre(o,'f6300000-0000-4000-8000-000000000001',d,1)<>r then raise exception 'Update replay failed';end if;
 denied:=false;
 begin perform public.tc_save_tyre(o,'f6300000-0000-4000-8000-000000000001',d||'{"notes":"Obsoleto"}',1);
 exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'Stale revision overwritten';end if;
 d:=d||'{"status":"retired","truckId":null,"position":""}';
 perform public.tc_save_tyre(o,'f6300000-0000-4000-8000-000000000001',d,2);
 perform public.tc_save_tyre(o,'f6300000-0000-4000-8000-000000000002',current_setting('truckcontrol_test.tyre_data')::jsonb||'{"code":"DEMO-TYRE-2"}');
 if jsonb_array_length(public.tc_tyre_page(o,'history',null,'f6300000-0000-4000-8000-000000000001'))<>3 then raise exception 'Retirement lost history';end if;
end $$;
select set_config('request.jwt.claim.sub','f6100000-0000-4000-8000-000000000002',true);
do $$ declare denied boolean:=false;o uuid:=current_setting('truckcontrol_test.tyre_org_a')::uuid;begin
 begin perform public.tc_tyre_page(o);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign tenant read accepted';end if;
 perform public.tc_save_tyre(current_setting('truckcontrol_test.tyre_org_b')::uuid,'f6300000-0000-4000-8000-000000000999',current_setting('truckcontrol_test.tyre_data')::jsonb||'{"code":"DEMO-B","truckId":"f6200000-0000-4000-8000-000000000002"}');
end $$;
select set_config('request.jwt.claim.sub','f6100000-0000-4000-8000-000000000001',true);
do $$ declare o uuid:=current_setting('truckcontrol_test.tyre_org_a')::uuid;d jsonb:=current_setting('truckcontrol_test.tyre_data')::jsonb||'{"status":"stock","truckId":null,"position":""}';n integer;a jsonb;b jsonb;begin
 for n in 10..212 loop
  perform public.tc_save_tyre(o,('f6300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,d||jsonb_build_object('code','STOCK-FICTICIO-'||n));
 end loop;
 a:=public.tc_tyre_page(o);b:=public.tc_tyre_page(o,'tyres',(a->199->>'id')::uuid);
 if jsonb_array_length(a)<>200 or jsonb_array_length(b)<>5 or (select count(distinct value->>'id') from jsonb_array_elements(a||b))<>205 then raise exception 'Native keyset pagination failed';end if;
 if exists(select 1 from jsonb_array_elements(a||b) r where r->>'organizationId'<>o::text) then raise exception 'Foreign tyre leaked';end if;
end $$;
reset role;
insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values(current_setting('truckcontrol_test.tyre_org_a')::uuid,'f6100000-0000-4000-8000-000000000002','viewer','active','f6100000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','f6100000-0000-4000-8000-000000000002',true);
do $$ declare o uuid:=current_setting('truckcontrol_test.tyre_org_a')::uuid;denied boolean:=false;a jsonb;begin
 a:=public.tc_tyre_page(o,'history',null,'f6300000-0000-4000-8000-000000000001');
 if jsonb_array_length(a)<>3 or exists(select 1 from jsonb_array_elements(a) r where r ? 'actor_id' or r ? 'actorId') then raise exception 'History omitted revisions or exposed actor';end if;
 begin perform public.tc_save_tyre(o,'f6300000-0000-4000-8000-000000000001',current_setting('truckcontrol_test.tyre_data')::jsonb,3);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Viewer write accepted';end if;
 denied:=false;
 begin update private.company_tyre_history set row_version=999 where organization_id=o;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'History update privilege';end if;
 denied:=false;
 begin delete from private.company_tyres where organization_id=o;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Tyre delete privilege';end if;
end $$;
reset role;
update private.tc_memberships set status='revoked' where organization_id=current_setting('truckcontrol_test.tyre_org_a')::uuid and user_id='f6100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','f6100000-0000-4000-8000-000000000002',true);
do $$ declare denied boolean:=false;begin
 begin perform public.tc_tyre_page(current_setting('truckcontrol_test.tyre_org_a')::uuid);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Revoked member still reads tyres';end if;
end $$;
reset role;
update private.tc_customers set module_overrides='{"maintenance":false}' where user_id='f6100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f6100000-0000-4000-8000-000000000001',true);
do $$ declare denied boolean:=false;begin
 begin perform public.tc_tyre_page(current_setting('truckcontrol_test.tyre_org_a')::uuid);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Disabled maintenance still reads tyres';end if;
end $$;
reset role;
set local role anon;
do $$ declare denied boolean:=false;begin
 begin perform public.tc_tyre_page(current_setting('truckcontrol_test.tyre_org_a')::uuid);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous read accepted';end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.finance_entries where organization_id in(current_setting('truckcontrol_test.tyre_org_a')::uuid,current_setting('truckcontrol_test.tyre_org_b')::uuid)) then raise exception 'Tyres booked a financial entry';end if;
 if (select prosecdef from pg_proc where oid='public.tc_save_tyre(uuid,uuid,jsonb,bigint)'::regprocedure) or (select prosecdef from pg_proc where oid='public.tc_tyre_page(uuid,text,uuid,uuid)'::regprocedure) or has_function_privilege('authenticated','private.tc_tyre_audit()','execute') then raise exception 'Unexpected exposed privilege elevation';end if;
 if not (select relrowsecurity from pg_class where oid='private.company_tyres'::regclass) or not (select relrowsecurity from pg_class where oid='private.company_tyre_history'::regclass) then raise exception 'Missing RLS';end if;
end $$;
rollback;
select 'native_tyre_rollback' as test,
 not exists(select 1 from auth.users where id::text like 'f6100000-%') as fixture_users_absent,
 not exists(select 1 from public.trucks where id::text like 'f6200000-%') as fixture_trucks_absent,
 not exists(select 1 from private.company_tyres where id::text like 'f6300000-%') as fixture_tyres_absent,
 not exists(select 1 from private.company_tyre_history where tyre_id::text like 'f6300000-%') as fixture_history_absent;

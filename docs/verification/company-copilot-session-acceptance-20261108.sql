-- Session-aware contract, 2026-11-08. Source: supabase/tests/company-copilot-acceptance.sql
-- Original Git blob: 07ac0e04adb6c8001a6d26b387ee495cde333f1c. Original source remains unchanged.
-- Only mock Auth sessions/JWT fixtures extended; all original assertions,
-- economic operations, RLS denials, provider counters and rollback retained.
begin;
do $$
declare
 s_u uuid:=gen_random_uuid();s_v uuid:=gen_random_uuid();s_m uuid:=gen_random_uuid();
 u uuid:='ff710000-0000-4000-8000-000000000001';v uuid:='ff710000-0000-4000-8000-000000000002';m uuid:='ff710000-0000-4000-8000-000000000003';
 x uuid:='ff720000-0000-4000-8000-000000000001';y uuid:='ff720000-0000-4000-8000-000000000002';
 tx uuid:='ff730000-0000-4000-8000-000000000001';ty uuid:='ff730000-0000-4000-8000-000000000002';
 rid uuid;aid uuid;record_id uuid;request2 uuid;result jsonb;again jsonb;ctx jsonb;payload jsonb;
 denied boolean;before_settings text;before_plans text;before_policy text;before_data text;n integer;
begin
 if (select app_name from private.tc_settings where id) is distinct from 'TruckControl AI' or to_regclass('private.tc_copilot_actions') is null then raise exception 'Wrong project or missing copilot migration';end if;
 if exists(select 1 from auth.users where id in(u,v,m)) or exists(select 1 from public.organizations where id in(x,y)) then raise exception 'Fixture collision; preserve all existing work';end if;
 if not coalesce((select ai_enabled from private.tc_provider_settings where id),false) or not coalesce((select enforce_access from private.tc_settings where id),false)
  or coalesce((select sms_ready from private.tc_settings where id),true) or exists(select 1 from private.tc_modules where id in('assistant','document_ai','customers','trucks') and not enabled) then raise exception 'Fixture prerequisites unavailable; do not alter production settings';end if;
 select md5(to_jsonb(s)::text) into before_settings from private.tc_settings s where id;
 select md5(jsonb_agg(to_jsonb(p) order by id)::text) into before_plans from private.tc_plans p;
 select md5(to_jsonb(s)::text) into before_policy from private.tc_provider_settings s where id;
 select md5(coalesce(jsonb_agg(t order by t->>'id')::text,'')) into before_data from (select to_jsonb(t) t from public.trucks t where organization_id not in(x,y) union all select to_jsonb(d) from public.drivers d where organization_id not in(x,y) union all select to_jsonb(e) from public.finance_entries e where organization_id not in(x,y) union all select to_jsonb(r) from private.fleet_records r where organization_id not in(x,y)) data;
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(u,'copilot-rollback-a@example.invalid',now(),'{"is_admin":true}'),(v,'copilot-rollback-b@example.invalid',now(),'{}'),(m,'copilot-rollback-member@example.invalid',now(),'{}');
 insert into auth.sessions(id,user_id) values(s_u,u),(s_v,v),(s_m,m);
 insert into private.tc_customers(user_id,contact_name,company_name,tax_id,address,email,phone,requested_plan,status,trial_started_at,trial_ends_at,trial_plan_id,ai_allowed,ai_opt_in,module_overrides)
 values(u,'Persona ficticia','DEMO Copiloto A','DEMO-COP-A','Direccion ficticia','copilot-rollback-a@example.invalid','+12025550191','limited','trial',now(),now()+interval '10 days','limited',true,true,'{"assistant":true,"document_ai":true,"customers":true,"trucks":true}'),
 (v,'Persona ficticia','DEMO Copiloto B','DEMO-COP-B','Direccion ficticia','copilot-rollback-b@example.invalid','+12025550192','limited','trial',now(),now()+interval '10 days','limited',true,true,'{"assistant":true,"document_ai":true,"customers":true,"trucks":true}'),
 (m,'Persona ficticia','DEMO Miembro','DEMO-COP-M','Direccion ficticia','copilot-rollback-member@example.invalid','+12025550193','limited','trial',now(),now()+interval '10 days','limited',true,true,'{"assistant":true,"document_ai":true,"customers":true,"trucks":true}') on conflict(user_id) do update set ai_allowed=true,ai_opt_in=true,trial_plan_id='limited';
 insert into public.organizations(id,owner_id,name) values(x,u,'DEMO Copiloto A'),(y,v,'DEMO Copiloto B');
 insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values(x,m,'viewer','active',u);
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',s_u)::text,true);
 execute 'set local role authenticated';
 insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on,route) values(tx,x,'DEMO-CP-A','Scania','Ficticio',2020,100000,'available','2027-01-20','');
 result:=public.tc_company_copilot(x,'status');if result->>'allowed' is distinct from 'true' or result->>'can_write' is distinct from 'true' then raise exception 'Company access failed';end if;
 denied:=false;begin perform public.tc_company_copilot(y,'status');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Foreign company access or editable metadata elevated authority';end if;
 denied:=false;begin perform public.company_copilot_server(x,u,'begin',jsonb_build_object('request_id',gen_random_uuid()));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Browser can forge model turns';end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',v::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','session_id',s_v)::text,true);execute 'set local role authenticated';
 insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on,route) values(ty,y,'DEMO-CP-B','MAN','Ficticio',2020,100000,'available','2027-01-20','');execute 'reset role';
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',s_u)::text,true);execute 'set local role authenticated';ctx:=public.tc_company_copilot(x,'context','{"query":"camiones ficticios"}');
 if ctx->>'organization_id' is distinct from x::text or jsonb_array_length(ctx->'entities'->'truck'->'items') is distinct from 1 or position(ty::text in ctx::text)<>0 then raise exception 'Company context isolation failed';end if;execute 'reset role';
 rid:=gen_random_uuid();payload:='{"name":"Cliente ficticio nativo","taxId":"DEMO-COPILOT","email":"","phone":"","address":"Direccion ficticia","notes":""}';
 execute 'set local role service_role';result:=public.company_copilot_server(x,u,'begin',jsonb_build_object('request_id',rid));if result->>'started' is distinct from 'true' then raise exception 'Turn lease failed';end if;
 result:=public.company_copilot_server(x,u,'finish',jsonb_build_object('request_id',rid,'reply','Propuesta ficticia nativa.','items',jsonb_build_array(jsonb_build_object('entity','customers','mode','create','record_id',null,'expected_version',null,'fields',payload))));
 again:=public.company_copilot_server(x,u,'begin',jsonb_build_object('request_id',rid));if again is distinct from result then raise exception 'Repeated turn changed result';end if;execute 'reset role';
 aid:=(result->'actions'->0->>'id')::uuid;record_id:=(result->'actions'->0->>'record_id')::uuid;
 if exists(select 1 from private.fleet_records where id=record_id) then raise exception 'Model output executed a task';end if;
 perform set_config('request.jwt.claim.sub',v::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','session_id',s_v)::text,true);execute 'set local role authenticated';denied:=false;begin perform public.tc_company_copilot(y,'execute',jsonb_build_object('id',aid));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Foreign actor executed a proposal';end if;execute 'reset role';
 perform set_config('request.jwt.claim.sub',m::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated','session_id',s_m)::text,true);execute 'set local role authenticated';result:=public.tc_company_copilot(x,'status');if result->>'can_write' is distinct from 'false' then raise exception 'Viewer gained write';end if;
 denied:=false;begin perform public.tc_company_copilot(x,'execute',jsonb_build_object('id',aid));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Viewer executed another user task';end if;execute 'reset role';
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','session_id',s_u)::text,true);execute 'set local role authenticated';
 denied:=false;begin update private.tc_copilot_actions set state='applied' where id=aid;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Raw proposal DML allowed';end if;
 result:=public.tc_company_copilot(x,'execute',jsonb_build_object('id',aid));if result->>'state' is distinct from 'applied' then raise exception 'Confirmed task not applied';end if;
 again:=public.tc_company_copilot(x,'execute',jsonb_build_object('id',aid));if again is distinct from result then raise exception 'Repeated task changed result';end if;execute 'reset role';
 if (select count(*) from private.fleet_records where id=record_id and organization_id=x) is distinct from 1 or (select count(*) from private.tc_admin_audit where action='copilot_task_apply' and target_id=record_id::text) is distinct from 1 then raise exception 'Duplicate record or audit';end if;
 -- Invalidate an earlier result by withdrawing a capability; do not expose its stored reply.
 update private.tc_customers set module_overrides=module_overrides||'{"customers":false}' where user_id=u;
 execute 'set local role authenticated';denied:=false;begin perform public.tc_company_copilot(x,'result',jsonb_build_object('request_id',rid));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Withdrawn capability still exposed old model result';end if;execute 'reset role';
 update private.tc_customers set module_overrides=module_overrides||'{"customers":true}' where user_id=u;
 -- Two-stage stale row check preserves a newer manual edit.
 request2:=gen_random_uuid();execute 'set local role service_role';perform public.company_copilot_server(x,u,'begin',jsonb_build_object('request_id',request2));
 result:=public.company_copilot_server(x,u,'finish',jsonb_build_object('request_id',request2,'reply','Actualizar ruta ficticia.','items',jsonb_build_array(jsonb_build_object('entity','truck','mode','update','record_id',tx,'expected_version',1,'fields','{"route":"Ruta propuesta"}'::jsonb))));execute 'reset role';aid:=(result->'actions'->0->>'id')::uuid;
 execute 'set local role authenticated';update public.trucks set route='Cambio manual posterior' where organization_id=x and id=tx;
 denied:=false;begin perform public.tc_company_copilot(x,'execute',jsonb_build_object('id',aid));exception when serialization_failure then denied:=true;end;if not denied then raise exception 'Stale proposal overwrote data';end if;execute 'reset role';
 if (select route from public.trucks where id=tx) is distinct from 'Cambio manual posterior' then raise exception 'Manual route changed';end if;
 -- Expiry and cancellation retain records.
 update private.tc_copilot_actions set expires_at=now()-interval '1 second' where id=aid;
 execute 'set local role authenticated';denied:=false;begin perform public.tc_company_copilot(x,'execute',jsonb_build_object('id',aid));exception when serialization_failure then denied:=true;end;if not denied then raise exception 'Expired task executed';end if;
 result:=public.tc_company_copilot(x,'cancel',jsonb_build_object('id',aid));if result->>'state' is distinct from 'cancelled' then raise exception 'Cancellation failed';end if;execute 'reset role';
 -- AI consent can be withdrawn independently of company write privileges.
 update private.tc_customers set ai_opt_in=false where user_id=u;
 execute 'set local role authenticated';denied:=false;begin perform public.tc_company_copilot(x,'context','{"query":"todo"}');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Withdrawn AI consent ignored';end if;execute 'reset role';
 update private.tc_customers set ai_opt_in=true where user_id=u;
 -- The existing 50-truck plan still governs the new path; production plans stay intact.
 if (private.tc_user_access(u)->>'max_trucks')::integer is distinct from 50 then raise exception 'Fixture plan is not the expected 50-truck plan';end if;
 execute 'set local role authenticated';
 for n in 1..49 loop insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on,route) values(gen_random_uuid(),x,'DEMO-CQ-'||n,'MAN','Ficticio',2020,0,'available','2027-01-20','');end loop;execute 'reset role';
 request2:=gen_random_uuid();execute 'set local role service_role';perform public.company_copilot_server(x,u,'begin',jsonb_build_object('request_id',request2));
 result:=public.company_copilot_server(x,u,'finish',jsonb_build_object('request_id',request2,'reply','Camion ficticio 51.','items',jsonb_build_array(jsonb_build_object('entity','truck','mode','create','record_id',null,'expected_version',null,'fields','{"plate":"DEMO-COP-51","brand":"Scania","model":"Ficticio","year":2020,"odometerKm":0,"status":"available","driverId":null,"inspectionDueOn":"2027-01-20","route":""}'::jsonb))));execute 'reset role';aid:=(result->'actions'->0->>'id')::uuid;
 execute 'set local role authenticated';denied:=false;begin perform public.tc_company_copilot(x,'execute',jsonb_build_object('id',aid));exception when raise_exception then denied:=true;end;if not denied then raise exception 'Truck limit bypassed';end if;execute 'reset role';
 if (select count(*) from public.trucks where organization_id=x) is distinct from 50 then raise exception 'Truck limit changed data';end if;
 update auth.users set banned_until=now()+interval '1 day' where id=u;execute 'set local role authenticated';denied:=false;begin perform public.tc_company_copilot(x,'status');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Banned actor kept copilot access';end if;execute 'reset role';
 if has_function_privilege('anon','public.tc_company_copilot(uuid,text,jsonb)','execute') or has_function_privilege('authenticated','public.company_copilot_server(uuid,uuid,text,jsonb)','execute') or has_table_privilege('authenticated','private.tc_copilot_actions','update') then raise exception 'Unexpected grants';end if;
 if (select count(*) from pg_class where oid in('private.tc_copilot_turns'::regclass,'private.tc_copilot_actions'::regclass) and relrowsecurity) is distinct from 2 then raise exception 'RLS missing';end if;
 if before_settings is distinct from (select md5(to_jsonb(s)::text) from private.tc_settings s where id) or before_plans is distinct from (select md5(jsonb_agg(to_jsonb(p) order by id)::text) from private.tc_plans p) or before_policy is distinct from (select md5(to_jsonb(s)::text) from private.tc_provider_settings s where id) then raise exception 'Commercial/provider settings changed';end if;
 if before_data is distinct from (select md5(coalesce(jsonb_agg(t order by t->>'id')::text,'')) from (select to_jsonb(t) t from public.trucks t where organization_id not in(x,y) union all select to_jsonb(d) from public.drivers d where organization_id not in(x,y) union all select to_jsonb(e) from public.finance_entries e where organization_id not in(x,y) union all select to_jsonb(r) from private.fleet_records r where organization_id not in(x,y)) data) then raise exception 'Existing company data changed';end if;
end;$$;
rollback;
select now() as checked_at,(select count(*) from supabase_migrations.schema_migrations) as migrations,
 (select count(*) from auth.users where id::text like 'ff710000-%') as fixture_users_remaining,
 (select count(*) from public.organizations where id::text like 'ff720000-%') as fixture_companies_remaining,
 (select count(*) from private.tc_copilot_turns) as copilot_turns,(select count(*) from private.tc_copilot_actions) as copilot_actions,
 payments_enabled,prices_are_examples from private.tc_settings where id;

-- Synthetic, transactional acceptance. No external calls or real customer records.
begin;
do $$
declare
 u uuid:='ffb10000-0000-4000-8000-000000000001';v uuid:='ffb10000-0000-4000-8000-000000000002';
 x uuid:='ffb20000-0000-4000-8000-000000000001';y uuid:='ffb20000-0000-4000-8000-000000000002';
 tx uuid:='ffb30000-0000-4000-8000-000000000001';ty uuid:='ffb30000-0000-4000-8000-000000000002';doc uuid:='ffb40000-0000-4000-8000-000000000001';
 p text;c jsonb;r jsonb;a jsonb;turn uuid;first_turn uuid;denied boolean;settings_before text;plans_before text;provider_before text;data_before text;calls_before bigint;profiles_before text;n integer:=0;
begin
 if (select app_name from private.tc_settings where id) is distinct from 'TruckControl AI' or to_regclass('private.tc_specialist_turns') is null then raise exception 'Wrong project or missing migration';end if;
 if exists(select 1 from auth.users where id in(u,v)) or exists(select 1 from public.organizations where id in(x,y)) then raise exception 'Fixture collision; preserve existing data';end if;
 select md5(to_jsonb(s)::text) into settings_before from private.tc_settings s where id;
 select md5(jsonb_agg(to_jsonb(t) order by id)::text) into plans_before from private.tc_plans t;
 select md5(to_jsonb(s)::text) into provider_before from private.tc_provider_settings s where id;
 select count(*) into calls_before from private.tc_ai_calls;
 select md5(jsonb_agg(to_jsonb(t) order by profile)::text) into profiles_before from private.tc_specialist_verifications t;
 select md5(coalesce(jsonb_agg(t order by t->>'id')::text,'')) into data_before from (select to_jsonb(t) t from public.trucks t where organization_id not in(x,y) union all select to_jsonb(t) from public.drivers t where organization_id not in(x,y) union all select to_jsonb(t) from public.finance_entries t where organization_id not in(x,y) union all select to_jsonb(t) from private.fleet_records t where organization_id not in(x,y)) d;
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(u,'specialists-rollback-a@example.invalid',now(),'{"is_admin":true}'),(v,'specialists-rollback-b@example.invalid',now(),'{}');
 insert into private.tc_customers(user_id,contact_name,company_name,tax_id,address,email,phone,requested_plan,status,trial_started_at,trial_ends_at,trial_plan_id,ai_allowed,ai_opt_in,module_overrides)
 values(u,'Persona ficticia','DEMO Especialistas A','DEMO-SP-A','Direccion ficticia','specialists-rollback-a@example.invalid','+12025550391','limited','trial',now(),now()+interval '10 days','full',true,true,'{"assistant":true,"document_ai":true,"trucks":true,"drivers":true,"income":true,"expenses":true,"documents":true,"fuel":true,"maintenance":true,"trips":true,"dashboard":true,"profitability":true,"deadlines":true,"alerts":true,"customers":true,"trailers":true}'),
 (v,'Persona ficticia','DEMO Especialistas B','DEMO-SP-B','Direccion ficticia','specialists-rollback-b@example.invalid','+12025550392','limited','trial',now(),now()+interval '10 days','full',true,true,'{"assistant":true,"document_ai":true,"trucks":true}') on conflict(user_id) do update set ai_allowed=true,ai_opt_in=true,trial_plan_id='full';
 insert into public.organizations(id,owner_id,name) values(x,u,'DEMO Especialistas A'),(y,v,'DEMO Especialistas B');
 insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,inspection_due_on,route) values(tx,x,'DEMO-SP-A','Scania','Ficticio',2020,100800,'available',current_date+30,''),(ty,y,'DEMO-SP-B','MAN','Ficticio',2020,500000,'available',current_date+30,'');
 insert into public.finance_entries(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km) values(gen_random_uuid(),x,tx,'income','Ingreso ficticio',current_date,110000,'transport','paid',1000),(gen_random_uuid(),x,tx,'expense','Gasto ficticio',current_date,33000,'fuel','paid',0);
 insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes) values(doc,x,'Documento ficticio.pdf',x::text||'/'||doc::text||'/document.pdf','application/pdf',100);
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 c:=public.tc_company_specialists(x,'status');if jsonb_array_length(c->'profiles')<>8 then raise exception 'Profile catalog incomplete';end if;
 denied:=false;begin perform public.tc_company_specialists(y,'status');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Foreign company exposed';end if;
 denied:=false;begin perform public.company_specialists_server(x,u,'begin','{}');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Server RPC exposed';end if;
 denied:=false;begin perform 1 from private.tc_specialist_turns;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Raw ledger exposed';end if;
 foreach p in array array['general','documents','finance','fuel','maintenance','drivers','trips','management'] loop
  c:=public.tc_company_specialists(x,'prepare',jsonb_build_object('profile',p,'query','Consulta ficticia de prueba','document_ids',case when p='documents' then jsonb_build_array(doc) else '[]'::jsonb end));
  if c->>'organization_id'<>x::text or c->>'profile'<>p or c::text like '%'||ty::text||'%' or c::text like '%object_path%' then raise exception 'Context scope or document secrecy failed';end if;
  if p='finance' and ((c->'statistics'->'values'->'finance_by_truck'->0->>'profitCents')::bigint<>77000 or (c->'statistics'->'values'->'finance_by_truck'->0->>'expenseEurosPerKm')::numeric<>0.33) then raise exception 'Financial arithmetic failed';end if;
  if p='documents' and c->'documents'->0->>'id'<>doc::text then raise exception 'Selected document missing';end if;
  turn:=gen_random_uuid();if first_turn is null then first_turn:=turn;end if;
  execute 'set local role service_role';
  r:=public.company_specialists_server(x,u,'begin',jsonb_build_object('request_id',turn,'profile',p,'context',c));if r->>'started' is distinct from 'true' then raise exception 'Turn did not start';end if;
  denied:=false;begin perform public.company_specialists_server(x,u,'finish',jsonb_build_object('request_id',turn,'reply','Respuesta ficticia','items','[]'::jsonb,'citations',jsonb_build_array('FOREIGN-REFERENCE'),'uncertainties','[]'::jsonb));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Unprovided citation accepted';end if;
  r:=public.company_specialists_server(x,u,'finish',jsonb_build_object('request_id',turn,'reply','Respuesta ficticia basada en datos autorizados.','items','[]'::jsonb,'citations',jsonb_build_array('R1'),'uncertainties',jsonb_build_array('No se han consultado servicios externos.')));
  a:=public.company_specialists_server(x,u,'finish',jsonb_build_object('request_id',turn,'reply','Respuesta modificada','items','[]'::jsonb,'citations','[]'::jsonb,'uncertainties','[]'::jsonb));
  if a is distinct from r or r->>'profile'<>p or jsonb_array_length(r->'sources')<>1 then raise exception 'Source/turn immutability failed';end if;
  execute 'set local role authenticated';
  a:=public.tc_company_specialists(x,'result',jsonb_build_object('request_id',turn));if a is distinct from r then raise exception 'Result recovery failed';end if;
  n:=n+1;
 end loop;
 r:=public.tc_company_specialists(x,'jobs_status','{"profile":"general"}');if r->'preference'->>'enabled' is distinct from 'false' then raise exception 'Digest was implicitly opted in';end if;
 r:=public.tc_company_specialists(x,'jobs_save','{"profile":"general","enabled":true,"cadence":"daily","expected_version":0}');
 r:=public.tc_company_specialists(x,'jobs_run','{"profile":"general"}');if r->'jobs'->0->>'state' is distinct from 'complete' or r->'jobs'->0->'summary'->>'paid_model_calls' is distinct from '0' then raise exception 'Digest processing failed';end if;
 a:=public.tc_company_specialists(x,'jobs_run','{"profile":"general"}');if a->'jobs' is distinct from r->'jobs' then raise exception 'Duplicate digest generated';end if;
 execute 'reset role';
 update private.tc_customers set ai_opt_in=false where user_id=u;
 execute 'set local role authenticated';
 denied:=false;begin perform public.tc_company_specialists(x,'result',jsonb_build_object('request_id',first_turn));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Consent withdrawal did not protect old result';end if;
 execute 'reset role';
 if n<>8 or (select count(*) from private.tc_ai_calls)<>calls_before then raise exception 'Unexpected provider usage';end if;
 if (select md5(to_jsonb(s)::text) from private.tc_settings s where id) is distinct from settings_before or (select md5(jsonb_agg(to_jsonb(t) order by id)::text) from private.tc_plans t) is distinct from plans_before or (select md5(to_jsonb(s)::text) from private.tc_provider_settings s where id) is distinct from provider_before then raise exception 'Commercial policy changed';end if;
 if (select md5(jsonb_agg(to_jsonb(t) order by profile)::text) from private.tc_specialist_verifications t) is distinct from profiles_before then raise exception 'Mock acceptance falsely attested real connections';end if;
 if (select md5(coalesce(jsonb_agg(t order by t->>'id')::text,'')) from (select to_jsonb(t) t from public.trucks t where organization_id not in(x,y) union all select to_jsonb(t) from public.drivers t where organization_id not in(x,y) union all select to_jsonb(t) from public.finance_entries t where organization_id not in(x,y) union all select to_jsonb(t) from private.fleet_records t where organization_id not in(x,y)) d) is distinct from data_before then raise exception 'Existing business data changed';end if;
end;$$;
rollback;
select now() as checked_at,(select count(*) from supabase_migrations.schema_migrations) as migrations,
 (select count(*) from auth.users where id in('ffb10000-0000-4000-8000-000000000001','ffb10000-0000-4000-8000-000000000002')) as fixture_users_remaining,
 (select count(*) from public.organizations where id in('ffb20000-0000-4000-8000-000000000001','ffb20000-0000-4000-8000-000000000002')) as fixture_companies_remaining,
 (select count(*) from private.tc_specialist_turns where user_id='ffb10000-0000-4000-8000-000000000001') as fixture_turns_remaining,
 (select count(*) from private.tc_specialist_preferences where user_id='ffb10000-0000-4000-8000-000000000001') as fixture_preferences_remaining,
 (select count(*) from private.tc_specialist_jobs where user_id='ffb10000-0000-4000-8000-000000000001') as fixture_jobs_remaining;

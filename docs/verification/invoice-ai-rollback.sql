-- Native proof for truckcontrol-ai only. No provider/storage request or real user.
-- Synthetic users, documents and one internal reservation are rolled back together.
begin;
do $$ begin
 if exists(select 1 from auth.users where id::text like 'e4100000-%') or
    exists(select 1 from private.company_documents where id::text like 'e4200000-%') or
    exists(select 1 from private.invoice_documents where id::text like 'e4200000-%') then
  raise exception 'Fixture collision: preserve existing work';end if;
 if not (select registration_open and enforce_access and not payments_enabled and not sms_ready from private.tc_settings where id) then
  raise exception 'Unexpected live settings';end if;
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('e4100000-0000-4000-8000-000000000001','ai-reading-a@truckcontrol-test.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia A","company_name":"Lectura ficticia A","tax_id":"DEMO-READ-A","address":"Direccion ficticia 1","phone":"+12025550081","requested_plan":"full"}}'),
 ('e4100000-0000-4000-8000-000000000002','ai-reading-b@truckcontrol-test.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia B","company_name":"Lectura ficticia B","tax_id":"DEMO-READ-B","address":"Direccion ficticia 2","phone":"+12025550082","requested_plan":"full"}}');
insert into private.tc_auth_legal_consents(user_id,legal_version,source) values
 ('e4100000-0000-4000-8000-000000000001','2026-11-02','authenticated_profile'),
 ('e4100000-0000-4000-8000-000000000002','2026-11-02','authenticated_profile');
update auth.users set email_confirmed_at=now() where id in('e4100000-0000-4000-8000-000000000001','e4100000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','e4100000-0000-4000-8000-000000000001',true);
select (public.tc_finish_registration()->>'active')::boolean as fixture_a_activated;
select set_config('request.jwt.claim.sub','e4100000-0000-4000-8000-000000000002',true);
select (public.tc_finish_registration()->>'active')::boolean as fixture_b_activated;
reset role;
update private.tc_customers set ai_allowed=true,ai_opt_in=true,module_overrides='{"gmail":true,"invoice_ai":true}'
 where user_id in('e4100000-0000-4000-8000-000000000001','e4100000-0000-4000-8000-000000000002');
select set_config('truckcontrol_test.org_a',(select id::text from public.organizations where owner_id='e4100000-0000-4000-8000-000000000001'),true);
select set_config('truckcontrol_test.org_b',(select id::text from public.organizations where owner_id='e4100000-0000-4000-8000-000000000002'),true);
do $$ declare n integer;d uuid;o uuid;begin
 for n in 1..3 loop
  d:=('e4200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  o:=current_setting(case when n<=2 then 'truckcontrol_test.org_a' else 'truckcontrol_test.org_b' end)::uuid;
  insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes)
   values(d,o,'Original ficticio.pdf',o::text||'/'||d::text||'/document.pdf','application/pdf',case when n=2 then 7340032 else 100 end);
  insert into private.invoice_documents(id,organization_id,message_id,attachment_id,content_hash,document_id)
   values(d,o,'fictitious-ai-'||n,'synthetic',lpad(to_hex(n),64,'0'),d);
 end loop;
end $$;
set local role service_role;
do $$ declare o uuid:=current_setting('truckcontrol_test.org_a')::uuid;
 u uuid:='e4100000-0000-4000-8000-000000000001';a jsonb;b jsonb;denied boolean:=false;begin
 a:=public.company_invoice_ai_server('status',jsonb_build_object('organization_id',o,'user_id',u,'invoice_ids',jsonb_build_array('e4200000-0000-4000-8000-000000000001','e4200000-0000-4000-8000-000000000002','e4200000-0000-4000-8000-000000000003')));
 if jsonb_array_length(a)<>2 or a->0->>'state'<>'available' or not (a->0->>'can_analyze')::boolean or a->1->>'state'<>'too_large' or (a->1->>'can_analyze')::boolean then
  raise exception 'Native invoice states/tenant filtering failed';end if;
 if exists(select 1 from jsonb_array_elements(a) s where (select count(*) from jsonb_object_keys(s))<>3) then
  raise exception 'Status exposed private metadata';end if;
 b:=public.company_invoice_ai_server('prepare',jsonb_build_object('organization_id',o,'user_id',u,'invoice_id','e4200000-0000-4000-8000-000000000001'));
 if b->>'state'<>'available' or b->'document'->>'object_path'<>o::text||'/e4200000-0000-4000-8000-000000000001/document.pdf' then
  raise exception 'Verified original unavailable';end if;
 if public.company_invoice_ai_server('prepare',jsonb_build_object('organization_id',o,'user_id',u,'invoice_id','e4200000-0000-4000-8000-000000000003')) is not null then
  raise exception 'Foreign original exposed';end if;
 begin perform public.company_invoice_ai_server('prepare',jsonb_build_object('organization_id',o,'user_id','e4100000-0000-4000-8000-000000000002','invoice_id','e4200000-0000-4000-8000-000000000001'));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign actor accepted';end if;
 if public.company_invoice_ai_server('prepare',jsonb_build_object('organization_id',o,'user_id',u,'invoice_id','e4200000-0000-4000-8000-000000000002'))->>'state'<>'too_large' then
  raise exception 'Oversize original accepted';end if;
 -- No provider call: internal reserve is rolled back, not charged or settled.
 a:=public.company_ai_budget_server('reserve',jsonb_build_object('organization_id',o,'user_id',u,'invoice_id','e4200000-0000-4000-8000-000000000001','kind','invoice','model','gpt-6-luna'));
 if a is null then raise exception 'Synthetic reservation unavailable';end if;
 if public.company_invoice_ai_server('prepare',jsonb_build_object('organization_id',o,'user_id',u,'invoice_id','e4200000-0000-4000-8000-000000000001'))->>'state'<>'attempted' then
  raise exception 'Reserved attempt can be repeated';end if;
 if public.company_ai_budget_server('reserve',jsonb_build_object('organization_id',o,'user_id',u,'invoice_id','e4200000-0000-4000-8000-000000000001','kind','invoice','model','gpt-6-luna')) is not null then
  raise exception 'Duplicate invoice reservation accepted';end if;
end $$;
reset role;
insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values
 (current_setting('truckcontrol_test.org_a')::uuid,'e4100000-0000-4000-8000-000000000002','viewer','active','e4100000-0000-4000-8000-000000000001');
set local role service_role;
do $$ declare o uuid:=current_setting('truckcontrol_test.org_a')::uuid;a jsonb;denied boolean:=false;begin
 a:=public.company_invoice_ai_server('status',jsonb_build_object('organization_id',o,'user_id','e4100000-0000-4000-8000-000000000002','invoice_ids',jsonb_build_array('e4200000-0000-4000-8000-000000000001')));
 if jsonb_array_length(a)<>1 or (a->0->>'can_analyze')::boolean then raise exception 'Viewer acquired analysis permission';end if;
 begin perform public.company_invoice_ai_server('prepare',jsonb_build_object('organization_id',o,'user_id','e4100000-0000-4000-8000-000000000002','invoice_id','e4200000-0000-4000-8000-000000000001'));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Viewer can prepare analysis';end if;
end $$;
reset role;
update private.tc_customers set ai_opt_in=false where user_id='e4100000-0000-4000-8000-000000000001';
set local role service_role;
do $$ declare denied boolean:=false;begin
 begin perform public.company_invoice_ai_server('prepare',jsonb_build_object('organization_id',current_setting('truckcontrol_test.org_a'),'user_id','e4100000-0000-4000-8000-000000000001','invoice_id','e4200000-0000-4000-8000-000000000001'));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Opt-out ignored';end if;
end $$;
reset role;
set local role authenticated;
do $$ declare denied boolean:=false;begin
 begin perform public.company_invoice_ai_server('status','{}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Client acquired server-only RPC';end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.finance_entries where organization_id in(current_setting('truckcontrol_test.org_a')::uuid,current_setting('truckcontrol_test.org_b')::uuid)) then raise exception 'Analysis booked expense';end if;
 if (select count(*) from private.tc_ai_calls where invoice_id::text like 'e4200000-%')<>1 then raise exception 'Unexpected synthetic reservations';end if;
 if (select prosecdef from pg_proc where oid='public.company_invoice_ai_server(text,jsonb)'::regprocedure) or
    has_function_privilege('anon','public.company_invoice_ai_server(text,jsonb)','execute') or
    has_function_privilege('authenticated','private.tc_invoice_ai_server(text,jsonb)','execute') then
  raise exception 'Unexpected privilege elevation';end if;
end $$;
rollback;
select 'native_invoice_ai_rollback' as test,
 not exists(select 1 from auth.users where id::text like 'e4100000-%') as fixture_users_absent,
 not exists(select 1 from private.company_documents where id::text like 'e4200000-%') as fixture_documents_absent,
 not exists(select 1 from private.invoice_documents where id::text like 'e4200000-%') as fixture_invoices_absent,
 not exists(select 1 from private.tc_ai_calls where invoice_id::text like 'e4200000-%') as fixture_reservations_absent;

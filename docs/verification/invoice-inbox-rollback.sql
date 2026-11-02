-- Only truckcontrol-ai. Read-only invoice pagination under native RLS.
-- No email/provider API, real session, password or customer data. Everything rolls back.
begin;
do $$ begin
 if exists(select 1 from auth.users where id in('f8100000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000002','f8100000-0000-4000-8000-000000000003')) then
  raise exception 'Fixture collision: preserve existing work';end if;
 if not (select registration_open and enforce_access and not payments_enabled and not sms_ready from private.tc_settings where id) then
  raise exception 'Unexpected live settings';end if;
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('f8100000-0000-4000-8000-000000000001','inbox-a@truckcontrol-test.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia A","company_name":"Basico ficticio A","tax_id":"DEMO-BASIC-A","address":"Direccion ficticia 1","phone":"+12025550071","requested_plan":"full","trial_plan_id":"full","trial_days":9999},"is_admin":true,"paid_plan":"full"}'),
 ('f8100000-0000-4000-8000-000000000002','inbox-b@truckcontrol-test.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia B","company_name":"Basico ficticio B","tax_id":"DEMO-BASIC-B","address":"Direccion ficticia 2","phone":"+12025550072","requested_plan":"full"}}');
set local role authenticated;
select set_config('request.jwt.claim.sub','f8100000-0000-4000-8000-000000000001',true);
do $$ declare a jsonb;begin
 a:=public.tc_finish_registration();
 if (a->>'active')::boolean then raise exception 'Unverified signup activated';end if;
end $$;
reset role;
-- Trusted server receipt fixtures, not editable metadata; no old consent is rewritten.
insert into private.tc_auth_legal_consents(user_id,legal_version,source) values
 ('f8100000-0000-4000-8000-000000000001','2026-11-02','authenticated_profile'),
 ('f8100000-0000-4000-8000-000000000002','2026-11-02','authenticated_profile');
do $$ begin
 if exists(select 1 from private.tc_customers where user_id in('f8100000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000002')) then
  raise exception 'Receipt bypassed native email confirmation';end if;
end $$;
update auth.users set email_confirmed_at=now() where id in('f8100000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub','f8100000-0000-4000-8000-000000000001',true);
select (public.tc_finish_registration()->>'active')::boolean as fixture_a_activated;
select set_config('request.jwt.claim.sub','f8100000-0000-4000-8000-000000000002',true);
select (public.tc_finish_registration()->>'active')::boolean as fixture_b_activated;
reset role;
-- Only these synthetic customer overrides change; no existing data or keys touched.
update private.tc_customers set module_overrides='{"gmail":true}' where user_id in ('f8100000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000002');
select set_config('truckcontrol_test.org_a',(select id::text from public.organizations where owner_id='f8100000-0000-4000-8000-000000000001'),true);
select set_config('truckcontrol_test.org_b',(select id::text from public.organizations where owner_id='f8100000-0000-4000-8000-000000000002'),true);
do $$ declare n integer;d uuid;o uuid;begin
 if exists(select 1 from private.company_documents where id::text like 'f8200000-%') then raise exception 'Fixture collision: preserve originals';end if;
 for n in 1..206 loop
  d:=('f8200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  o:=current_setting(case when n<=205 then 'truckcontrol_test.org_a' else 'truckcontrol_test.org_b' end)::uuid;
  insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes) values(d,o,'Factura ficticia.pdf',o::text||'/'||d::text||'/document.pdf','application/pdf',100);
  insert into private.invoice_documents(id,organization_id,message_id,attachment_id,content_hash,document_id) values(d,o,'fictitious-'||n,'synthetic',lpad(to_hex(n),64,'0'),d);
 end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f8100000-0000-4000-8000-000000000001',true);
do $$ declare o uuid:=current_setting('truckcontrol_test.org_a')::uuid;a jsonb;b jsonb;denied boolean:=false;begin
 a:=public.tc_invoice_page(o);b:=public.tc_invoice_page(o,(a->199->>'id')::uuid);
 if jsonb_array_length(a)<>200 or jsonb_array_length(b)<>5 then raise exception 'Native pagination incomplete';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(a||b))<>205 then raise exception 'Page overlap';end if;
 if exists(select 1 from jsonb_array_elements(a||b) where value->>'organization_id'<>o::text) then raise exception 'Foreign invoice leaked';end if;
 if (select count(*) from public.list_company_invoices(o))<>200 then raise exception 'Legacy RPC changed';end if;
 if public.tc_invoice_page(o,(b->4->>'id')::uuid)<>'[]'::jsonb then raise exception 'End cursor failed';end if;
 begin perform public.tc_invoice_page(current_setting('truckcontrol_test.org_b')::uuid);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign tenant accepted';end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f8100000-0000-4000-8000-000000000002',true);
do $$ declare denied boolean:=false;begin
 begin perform public.tc_invoice_page(current_setting('truckcontrol_test.org_a')::uuid,'f8200000-0000-4000-8000-000000000200');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Cursor grants tenant access';end if;
 if jsonb_array_length(public.tc_invoice_page(current_setting('truckcontrol_test.org_b')::uuid))<>1 then raise exception 'Own tenant invoice missing';end if;
end $$;
reset role;
insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values(current_setting('truckcontrol_test.org_a')::uuid,'f8100000-0000-4000-8000-000000000002','viewer','active','f8100000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','f8100000-0000-4000-8000-000000000002',true);
do $$ begin
 if jsonb_array_length(public.tc_invoice_page(current_setting('truckcontrol_test.org_a')::uuid))<>200 then raise exception 'Authorized viewer cannot read';end if;
end $$;
reset role;
update private.tc_memberships set status='revoked' where organization_id=current_setting('truckcontrol_test.org_a')::uuid and user_id='f8100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','f8100000-0000-4000-8000-000000000002',true);
do $$ declare denied boolean:=false;begin
 begin perform public.tc_invoice_page(current_setting('truckcontrol_test.org_a')::uuid,'f8200000-0000-4000-8000-000000000200');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Revoked member can read subsequent page';end if;
end $$;
reset role;
set local role anon;
do $$ declare denied boolean:=false;begin
 begin perform public.tc_invoice_page(current_setting('truckcontrol_test.org_a')::uuid);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous invoice read accepted';end if;
end $$;
reset role;
update private.tc_customers set module_overrides='{"gmail":false}' where user_id='f8100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f8100000-0000-4000-8000-000000000001',true);
do $$ declare denied boolean:=false;begin
 begin perform public.tc_invoice_page(current_setting('truckcontrol_test.org_a')::uuid);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Disabled Gmail module accepted';end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.finance_entries where organization_id in(current_setting('truckcontrol_test.org_a')::uuid,current_setting('truckcontrol_test.org_b')::uuid)) then raise exception 'Read operation booked expenses';end if;
 if (select prosecdef from pg_proc where oid='public.tc_invoice_page(uuid,uuid)'::regprocedure) then raise exception 'Unexpected privilege elevation';end if;
 if has_function_privilege('anon','public.tc_invoice_page(uuid,uuid)','execute') then raise exception 'Anonymous RPC grant';end if;
end $$;
rollback;
select 'native_invoice_inbox_rollback' as test,
 not exists(select 1 from auth.users where id in ('f8100000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000002')) as fixture_users_absent,
 not exists(select 1 from private.company_documents where id::text like 'f8200000-%') as fixture_documents_absent,
 not exists(select 1 from private.invoice_documents where id::text like 'f8200000-%') as fixture_invoices_absent;

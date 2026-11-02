-- Only truckcontrol-ai. Native Auth confirmation and immutable legal-receipt fixtures.
-- No email/provider API, real session, password or customer data. Everything rolls back.
begin;
do $$ begin
 if exists(select 1 from auth.users where id in('d3100000-0000-4000-8000-000000000001','d3100000-0000-4000-8000-000000000002','d3100000-0000-4000-8000-000000000003')) then
  raise exception 'Fixture collision: preserve existing work';end if;
 if not (select registration_open and enforce_access and not payments_enabled and not sms_ready from private.tc_settings where id) then
  raise exception 'Unexpected live settings';end if;
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('d3100000-0000-4000-8000-000000000001','documents-a@truckcontrol-test.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia A","company_name":"Basico ficticio A","tax_id":"DEMO-BASIC-A","address":"Direccion ficticia 1","phone":"+12025550071","requested_plan":"full","trial_plan_id":"full","trial_days":9999},"is_admin":true,"paid_plan":"full"}'),
 ('d3100000-0000-4000-8000-000000000002','documents-b@truckcontrol-test.invalid','{"truckcontrol_registration":{"contact_name":"Persona ficticia B","company_name":"Basico ficticio B","tax_id":"DEMO-BASIC-B","address":"Direccion ficticia 2","phone":"+12025550072","requested_plan":"full"}}');
set local role authenticated;
select set_config('request.jwt.claim.sub','d3100000-0000-4000-8000-000000000001',true);
do $$ declare a jsonb;begin
 a:=public.tc_finish_registration();
 if (a->>'active')::boolean then raise exception 'Unverified signup activated';end if;
end $$;
reset role;
-- Trusted server receipt fixtures, not editable metadata; no old consent is rewritten.
insert into private.tc_auth_legal_consents(user_id,legal_version,source) values
 ('d3100000-0000-4000-8000-000000000001','2026-11-02','authenticated_profile'),
 ('d3100000-0000-4000-8000-000000000002','2026-11-02','authenticated_profile');
do $$ begin
 if exists(select 1 from private.tc_customers where user_id in('d3100000-0000-4000-8000-000000000001','d3100000-0000-4000-8000-000000000002')) then
  raise exception 'Receipt bypassed native email confirmation';end if;
end $$;
update auth.users set email_confirmed_at=now() where id in('d3100000-0000-4000-8000-000000000001','d3100000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub','d3100000-0000-4000-8000-000000000001',true);
select (public.tc_finish_registration()->>'active')::boolean as fixture_a_activated;
select set_config('request.jwt.claim.sub','d3100000-0000-4000-8000-000000000002',true);
select (public.tc_finish_registration()->>'active')::boolean as fixture_b_activated;
reset role;
-- Documentary fixtures only; no production customer or module is changed.
update private.tc_customers set module_overrides='{"documents":true}' where user_id in ('d3100000-0000-4000-8000-000000000001','d3100000-0000-4000-8000-000000000002');
select set_config('truckcontrol_test.org_a',(select id::text from public.organizations where owner_id='d3100000-0000-4000-8000-000000000001'),true);
select set_config('truckcontrol_test.org_b',(select id::text from public.organizations where owner_id='d3100000-0000-4000-8000-000000000002'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','d3100000-0000-4000-8000-000000000001',true);
do $$ declare o uuid:=current_setting('truckcontrol_test.org_a')::uuid;d uuid:='d3200000-0000-4000-8000-000000000001';t jsonb:='{"category":"insurance","status":"active","expires_on":"2026-12-01","remind_days":30}';v jsonb;b jsonb;denied boolean:=false;begin
 perform public.tc_register_document(o,jsonb_build_object('id',d,'name','Documento ficticio.pdf','object_path',o::text||'/'||d::text||'/document.pdf','content_type','application/pdf','size_bytes',100),t);
 select to_jsonb(x) into b from public.get_company_document(o,d)x;
 v:=public.tc_document_page(o);
 if jsonb_array_length(v)<>1 or v->0->'tracking'->>'row_version'<>'1' then raise exception 'Native document registration failed';end if;
 begin perform public.tc_update_document_metadata(o,d,t,0);exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'Stale edit accepted';end if;
 v:=public.tc_update_document_metadata(o,d,t||'{"status":"archived"}',1);
 if v->>'row_version'<>'2' or v->>'status'<>'archived' then raise exception 'Native metadata update failed';end if;
 if (select to_jsonb(x) from public.get_company_document(o,d)x) is distinct from b then raise exception 'Original metadata changed';end if;
 v:=public.tc_backup_page(o,'documents');if v->0 ? 'tracking' then raise exception 'Legacy contract changed';end if;
 v:=public.tc_backup_page_v2(o,'documents');if v->0->'tracking'->>'status'<>'archived' then raise exception 'Enriched backup incomplete';end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','d3100000-0000-4000-8000-000000000002',true);
do $$ declare o uuid:=current_setting('truckcontrol_test.org_a')::uuid;denied boolean:=false;begin
 if exists(select 1 from private.tc_document_details where organization_id=o) then raise exception 'Foreign metadata leaked';end if;
 begin perform public.tc_document_page(o);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign document list accepted';end if;
 denied:=false;
 begin perform public.tc_update_document_metadata(o,'d3200000-0000-4000-8000-000000000001','{"category":"other","status":"active","expires_on":null,"remind_days":30}',2);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign update accepted';end if;
end $$;
reset role;
insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values(current_setting('truckcontrol_test.org_a')::uuid,'d3100000-0000-4000-8000-000000000002','viewer','active','d3100000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','d3100000-0000-4000-8000-000000000002',true);
do $$ declare o uuid:=current_setting('truckcontrol_test.org_a')::uuid;denied boolean:=false;begin
 if jsonb_array_length(public.tc_document_page(o))<>1 then raise exception 'Viewer cannot read authorized metadata';end if;
 begin perform public.tc_update_document_metadata(o,'d3200000-0000-4000-8000-000000000001','{"category":"other","status":"active","expires_on":null,"remind_days":30}',2);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Viewer write accepted';end if;
end $$;
reset role;
set local role anon;
do $$ declare denied boolean:=false;begin
 begin perform public.tc_document_page(current_setting('truckcontrol_test.org_a')::uuid);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous metadata access accepted';end if;
end $$;
reset role;
update private.tc_customers set module_overrides='{"documents":false}' where user_id='d3100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','d3100000-0000-4000-8000-000000000001',true);
do $$ declare denied boolean:=false;begin
 if exists(select 1 from private.tc_document_details) then raise exception 'Disabled document metadata leaked';end if;
 begin perform public.tc_document_page(current_setting('truckcontrol_test.org_a')::uuid);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Disabled module accepted';end if;
end $$;
reset role;
rollback;
select 'native_document_tracking_rollback' as test,
 not exists(select 1 from auth.users where id in ('d3100000-0000-4000-8000-000000000001','d3100000-0000-4000-8000-000000000002')) as fixture_users_absent,
 not exists(select 1 from private.company_documents where id='d3200000-0000-4000-8000-000000000001') as fixture_document_absent,
 not exists(select 1 from private.tc_document_details where document_id='d3200000-0000-4000-8000-000000000001') as fixture_metadata_absent;

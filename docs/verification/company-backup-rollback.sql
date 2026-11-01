-- TruckControl only. No provider/Storage HTTP calls, Auth API or real data.
-- New synthetic users and records exist only inside this rolled-back transaction.
begin;
do $$ begin
 if not (select enforce_access and registration_open and not payments_enabled from private.tc_settings where id) then
  raise exception 'Unexpected live access settings';end if;
 if exists(select 1 from auth.users where id in ('fb100000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000002')) then
  raise exception 'Fixture collision: preserve existing work';end if;
end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('fb100000-0000-4000-8000-000000000001','backup-a@truckcontrol-test.invalid',now(),'{}'),
 ('fb100000-0000-4000-8000-000000000002','backup-b@truckcontrol-test.invalid',now(),'{}');
insert into private.tc_customers(user_id,contact_name,company_name,tax_id,address,email,phone,trial_started_at,trial_ends_at) values
 ('fb100000-0000-4000-8000-000000000001','Persona ficticia A','Copia ficticia A','DEMO-BACKUP-A','Direccion ficticia 1','backup-a@truckcontrol-test.invalid','+12025550081',now(),now()+interval '10 days'),
 ('fb100000-0000-4000-8000-000000000002','Persona ficticia B','Copia ficticia B','DEMO-BACKUP-B','Direccion ficticia 2','backup-b@truckcontrol-test.invalid','+12025550082',now(),now()+interval '10 days');
insert into public.organizations(id,owner_id,name) values
 ('fb300000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','Copia ficticia A'),
 ('fb300000-0000-4000-8000-000000000002','fb100000-0000-4000-8000-000000000002','Copia ficticia B');
insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes)
 select ('fb200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'fb300000-0000-4000-8000-000000000001','Ficticio.pdf',
 'fb300000-0000-4000-8000-000000000001/fb200000-0000-4000-8000-'||lpad(n::text,12,'0')||'/document.pdf','application/pdf',100
 from generate_series(1,201) n;
insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes) values
 ('fb200000-0000-4000-8000-000000000999','fb300000-0000-4000-8000-000000000002','Otro ficticio.pdf','fb300000-0000-4000-8000-000000000002/fb200000-0000-4000-8000-000000000999/document.pdf','application/pdf',100);
insert into private.invoice_documents(organization_id,message_id,attachment_id,content_hash,document_id) values
 ('fb300000-0000-4000-8000-000000000001','backup-fixture','fixture',repeat('b',64),'fb200000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-000000000001',true);
do $$ declare a jsonb;b jsonb;denied boolean:=false;begin
 a:=public.tc_backup_page('fb300000-0000-4000-8000-000000000001','documents',null);
 b:=public.tc_backup_page('fb300000-0000-4000-8000-000000000001','documents','fb200000-0000-4000-8000-000000000200');
 if jsonb_array_length(a)<>200 or jsonb_array_length(b)<>1 then raise exception 'Pagination truncated';end if;
 if exists(select 1 from jsonb_array_elements(a||b) x where x->>'organization_id'<>'fb300000-0000-4000-8000-000000000001') then raise exception 'Tenant leak';end if;
 if (a->0) ?| array['refresh_token','api_key','extracted_text','access_token'] then raise exception 'Unexpected private fields';end if;
 if jsonb_array_length(public.tc_backup_page('fb300000-0000-4000-8000-000000000001','invoices',null))<>1 then raise exception 'Invoice missing';end if;
 begin perform public.tc_backup_page('fb300000-0000-4000-8000-000000000002','documents',null);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign company accepted';end if;
 denied:=false;
 begin perform public.tc_backup_page('fb300000-0000-4000-8000-000000000001','gmail_tokens',null);
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Arbitrary private collection accepted';end if;
end $$;
reset role;
set local role anon;
do $$ declare denied boolean:=false;begin
 begin perform public.tc_backup_page('fb300000-0000-4000-8000-000000000001','documents',null);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous backup accepted';end if;
end $$;
reset role;
insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values
 ('fb300000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000002','operator','active','fb100000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-000000000002',true);
do $$ declare denied boolean:=false;begin
 begin perform public.tc_backup_page('fb300000-0000-4000-8000-000000000001','documents',null);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Operator backup accepted';end if;
end $$;
reset role;
update private.tc_memberships set role='admin' where organization_id='fb300000-0000-4000-8000-000000000001' and user_id='fb100000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
 if jsonb_array_length(public.tc_backup_page('fb300000-0000-4000-8000-000000000001','documents',null))<>200 then raise exception 'Company administrator denied';end if;
end $$;
reset role;
update private.tc_memberships set status='revoked' where organization_id='fb300000-0000-4000-8000-000000000001' and user_id='fb100000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ declare denied boolean:=false;begin
 begin perform public.tc_backup_page('fb300000-0000-4000-8000-000000000001','documents',null);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Revoked administrator accepted';end if;
end $$;
reset role;
update private.tc_customers set module_overrides='{"documents":false,"gmail":false}' where user_id='fb100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','fb100000-0000-4000-8000-000000000001',true);
do $$ declare denied boolean:=false;begin
 begin perform public.tc_backup_page('fb300000-0000-4000-8000-000000000001','documents',null);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Disabled modules accepted';end if;
end $$;
reset role;
update private.tc_customers set module_overrides='{}',status='suspended' where user_id='fb100000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare denied boolean:=false;begin
 begin perform public.tc_backup_page('fb300000-0000-4000-8000-000000000001','documents',null);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Suspended company accepted';end if;
end $$;
reset role;
rollback;
select 'company_backup_passed_and_rolled_back' as verification,
 (select count(*) from auth.users where id in ('fb100000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000002')) as fixture_users_remaining,
 (select count(*) from public.organizations where id in ('fb300000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000002')) as fixture_companies_remaining,
 (select count(*) from private.company_documents where organization_id in ('fb300000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000002')) as fixture_documents_remaining,
 (select registration_open and enforce_access and not payments_enabled from private.tc_settings where id) as launch_safeguards_preserved;

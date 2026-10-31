-- Dedicated TruckControl project only. Synthetic rows, no Auth API or providers.
-- Every change is rolled back. Any failed assertion raises an exception.
begin;
-- Uncommitted test configuration; invisible to other connections and rolled back.
update private.tc_modules set enabled=true where id in ('documents','gmail');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('e1000000-0000-4000-8000-000000000001','boundary-a@example.com',now(),'{}'),
 ('e1000000-0000-4000-8000-000000000002','boundary-b@example.com',now(),'{}');
insert into private.tc_customers(user_id,contact_name,company_name,tax_id,address,email,phone,module_overrides) values
 ('e1000000-0000-4000-8000-000000000001','Persona ficticia A','Empresa ficticia A','DEMO-A','Dirección ficticia','boundary-a@example.com','+34600000201','{"documents":false,"gmail":true}'),
 ('e1000000-0000-4000-8000-000000000002','Persona ficticia B','Empresa ficticia B','DEMO-B','Dirección ficticia','boundary-b@example.com','+34600000202','{}');
insert into public.organizations(id,owner_id,name) values
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','Empresa ficticia A'),
 ('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002','Empresa ficticia B');
insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes) values
 ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Permiso ficticio.pdf','e2000000-0000-4000-8000-000000000001/e3000000-0000-4000-8000-000000000001/document.pdf','application/pdf',100),
 ('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','Factura ficticia.pdf','e2000000-0000-4000-8000-000000000001/e3000000-0000-4000-8000-000000000002/document.pdf','application/pdf',100),
 ('e3000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000002','Otro permiso.pdf','e2000000-0000-4000-8000-000000000002/e3000000-0000-4000-8000-000000000003/document.pdf','application/pdf',100);
insert into private.invoice_documents(organization_id,message_id,attachment_id,content_hash,document_id) values
 ('e2000000-0000-4000-8000-000000000001','synthetic-boundary','synthetic-attachment',repeat('f',64),'e3000000-0000-4000-8000-000000000002');
insert into storage.objects(bucket_id,name)
 select 'truckcontrol-documents',object_path from private.company_documents
 where organization_id in ('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002');
insert into storage.objects(bucket_id,name) values('truckcontrol-documents','e2000000-0000-4000-8000-000000000001/e3000000-0000-4000-8000-000000000004/orphan.pdf');
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from public.list_company_documents('e2000000-0000-4000-8000-000000000001'))<>1
 or (select count(*) from storage.objects where bucket_id='truckcontrol-documents')<>1
 or not exists(select 1 from public.get_company_document('e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000002'))
 then raise exception 'Gmail-only permission leaked or lost a document';end if;
end $$;
reset role;
update private.tc_customers set module_overrides='{"documents":true,"gmail":false}' where user_id='e1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if (select count(*) from public.list_company_documents('e2000000-0000-4000-8000-000000000001'))<>2
 or (select count(*) from storage.objects where bucket_id='truckcontrol-documents')<>2
 then raise exception 'Library permission leaked an orphan or foreign document';end if;
end $$;
reset role;
update private.tc_customers set status='suspended' where user_id='e1000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.list_company_documents('e2000000-0000-4000-8000-000000000001'))
 or exists(select 1 from storage.objects where bucket_id='truckcontrol-documents')
 then raise exception 'Suspension did not revoke document access';end if;
end $$;
reset role;
rollback;
select 'document_module_boundaries_passed_and_rolled_back' as verification,
 (select count(*) from auth.users where id in ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002')) as synthetic_users_remaining,
 (select registration_open from private.tc_settings) as registration_open;

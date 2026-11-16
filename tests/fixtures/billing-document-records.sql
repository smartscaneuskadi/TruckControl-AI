-- Owned synthetic actors/metadata only. Loaded into disposable PGlite/CI PG.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select ('ba210000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'billing-doc-'||n||'@example.invalid',now(),jsonb_build_object('truckcontrol_registration',jsonb_build_object(
 'contact_name','Persona ficticia','company_name','Empresa documental ficticia '||n,'tax_id','DEMO-BILLING-'||n,
 'address','Dirección sintética 100','phone','+12025551'||lpad(n::text,3,'0')))
from unnest(array[1,2,3,9]) n;
insert into auth.sessions(id,user_id) select ('ba220000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('ba210000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from unnest(array[1,2,3,9]) n;
insert into private.tc_admins(user_id) values('ba210000-0000-4000-8000-000000000009');
update private.tc_customers set status='trial',trial_started_at=now(),trial_ends_at=now()+interval '10 days',
 trial_plan_id='full',ai_allowed=true,ai_opt_in=true where user_id::text like 'ba210000-%';
insert into private.tc_memberships(organization_id,user_id,role,status,invited_by)
 select id,'ba210000-0000-4000-8000-000000000003','operator','active',owner_id from public.organizations
 where owner_id='ba210000-0000-4000-8000-000000000001';
insert into public.drivers(id,organization_id,name,license,license_expires_on)
 select 'ba230000-0000-4000-8000-000000000001',id,'Conductor ficticio','DEMO-C','2028-01-01'
 from public.organizations where owner_id='ba210000-0000-4000-8000-000000000001';
insert into public.trucks(id,organization_id,plate,brand,model,year,driver_id,inspection_due_on)
 select ('ba240000-0000-4000-8000-'||lpad(v.n::text,12,'0'))::uuid,o.id,'DEMO-BILL-'||v.n,'Demo','Demo',2026,
 case when v.n=1 then 'ba230000-0000-4000-8000-000000000001'::uuid end,'2028-01-01'
 from (values(1,1),(2,1),(9,2)) v(n,owner_n) join public.organizations o
 on o.owner_id=('ba210000-0000-4000-8000-'||lpad(v.owner_n::text,12,'0'))::uuid;
insert into public.finance_entries(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km)
 select ('ba250000-0000-4000-8000-'||lpad(v.n::text,12,'0'))::uuid,o.id,
 ('ba240000-0000-4000-8000-'||lpad(v.truck_n::text,12,'0'))::uuid,v.kind,'Movimiento ficticio',current_date,
 10000,case when v.kind='income' then 'transport' else 'other' end,'pending',case when v.kind='income' then 100 else 0 end
 from (values(1,1,1,'income'),(2,1,1,'expense'),(9,2,9,'expense')) v(n,owner_n,truck_n,kind)
 join public.organizations o on o.owner_id=('ba210000-0000-4000-8000-'||lpad(v.owner_n::text,12,'0'))::uuid;
insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes,truck_id,driver_id)
 select ('ba260000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,o.id,'Documento ficticio '||n||'.pdf',
 o.id::text||'/ba260000-0000-4000-8000-'||lpad(n::text,12,'0')||'/document.pdf','application/pdf',100,
 case when n=1 then 'ba240000-0000-4000-8000-000000000001'::uuid end,
 case when n=4 then 'ba230000-0000-4000-8000-000000000001'::uuid end
 from generate_series(1,9) n join public.organizations o
 on o.owner_id=case when n=9 then 'ba210000-0000-4000-8000-000000000002'::uuid else 'ba210000-0000-4000-8000-000000000001'::uuid end;
insert into storage.objects(bucket_id,name) select 'truckcontrol-documents',object_path from private.company_documents where id::text like 'ba260000-%';
insert into private.tc_document_details(organization_id,document_id,category,label,finance_entry_id)
 select o.id,('ba260000-0000-4000-8000-'||lpad(v.n::text,12,'0'))::uuid,v.category,v.label,
 case when v.entry_n is not null then ('ba250000-0000-4000-8000-'||lpad(v.entry_n::text,12,'0'))::uuid end
 from (values(1,'technical_card','Ficha del vehículo',null::integer),(2,'ticket','Justificante del gasto',2),
 (3,'invoice',null,null),(4,'identity','Identidad del conductor',null),(6,'delivery_note','Entrega del viaje',1)) v(n,category,label,entry_n)
 join public.organizations o on o.owner_id='ba210000-0000-4000-8000-000000000001';
insert into private.invoice_documents(id,organization_id,message_id,attachment_id,content_hash,document_id)
 select 'ba270000-0000-4000-8000-000000000003',id,'demo-message','demo-attachment',repeat('a',64),'ba260000-0000-4000-8000-000000000003'
 from public.organizations where owner_id='ba210000-0000-4000-8000-000000000001';

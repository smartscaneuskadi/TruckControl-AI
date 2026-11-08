-- These are synthetic CI actors only. Never load into a managed project.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('fc110000-0000-4000-8000-000000000090','pedidos@smartscaneuskadi.com',now(),'{}'),
 ('fc110000-0000-4000-8000-000000000001','ci-company-a@example.invalid',now(),
  '{"truckcontrol_registration":{"contact_name":"CI operator A","company_name":"CI fictional company A","tax_id":"SYNTHETIC-PG-A","address":"Synthetic street 100","phone":"+12025551001","requested_plan":"limited"}}'),
 ('fc110000-0000-4000-8000-000000000002','ci-company-b@example.invalid',now(),
  '{"truckcontrol_registration":{"contact_name":"CI operator B","company_name":"CI fictional company B","tax_id":"SYNTHETIC-PG-B","address":"Synthetic street 200","phone":"+12025551002","requested_plan":"limited"}}'),
 ('fc110000-0000-4000-8000-000000000003','ci-monthly@example.invalid',now(),
  '{"truckcontrol_registration":{"contact_name":"CI monthly operator","company_name":"CI fictional monthly company","tax_id":"SYNTHETIC-PG-M","address":"Synthetic street 300","phone":"+12025551003","requested_plan":"limited"}}'),
 ('fc110000-0000-4000-8000-000000000004','ci-rollback@example.invalid',now(),
  '{"truckcontrol_registration":{"contact_name":"CI rollback operator","company_name":"CI fictional rollback company","tax_id":"SYNTHETIC-PG-R","address":"Synthetic street 400","phone":"+12025551004","requested_plan":"limited"}}');
insert into auth.sessions(id,user_id) values
 ('fc220000-0000-4000-8000-000000000090','fc110000-0000-4000-8000-000000000090'),
 ('fc220000-0000-4000-8000-000000000001','fc110000-0000-4000-8000-000000000001'),
 ('fc220000-0000-4000-8000-000000000002','fc110000-0000-4000-8000-000000000002'),
 ('fc220000-0000-4000-8000-000000000003','fc110000-0000-4000-8000-000000000003'),
 ('fc220000-0000-4000-8000-000000000004','fc110000-0000-4000-8000-000000000004');
insert into public.trucks(id,organization_id,plate,brand,model,year,inspection_due_on)
 select 'fc330000-0000-4000-8000-000000000001',id,'PG CI A','MAN','Synthetic',2026,'2027-12-31'
 from public.organizations where owner_id='fc110000-0000-4000-8000-000000000001';
insert into public.trucks(id,organization_id,plate,brand,model,year,inspection_due_on)
 select 'fc330000-0000-4000-8000-000000000002',id,'PG CI B','Scania','Synthetic',2026,'2027-12-31'
 from public.organizations where owner_id='fc110000-0000-4000-8000-000000000002';
insert into private.tc_payment_requests(
 id,user_id,plan_id,quoted_cents,plan_revision,status,checkout_id,net_cents,vat_rate_bps,vat_cents
)
 select ('fc440000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
        ('fc110000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
        p.id,36300,p.revision,'checkout','cs_test_Postgres'||n,30000,2100,6300
 from generate_series(1,4) n cross join private.tc_plans p where p.id='limited';
insert into private.tc_subscription_orders(user_id,request_id,checkout_id,terms_version)
 values ('fc110000-0000-4000-8000-000000000003','fc440000-0000-4000-8000-000000000003',
         'cs_test_Postgres3','ci-synthetic-only');
-- This account has no relation to Stripe. It opens only the synthetic test
-- channel in this disposable container. Live channels and all workers stay OFF.
insert into private.tc_manual_stripe_channels(provider_account_id,mode,enabled,isolated_test_instance)
 values('acct_PostgresIsolated','test',true,true);
insert into storage.objects(bucket_id,name,metadata)
 values('tc-subscription-fiscal','synthetic-fiscal-placeholder.pdf',
        '{"synthetic":true,"mimetype":"application/pdf","size":8}');

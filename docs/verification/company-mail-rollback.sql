-- TruckControl only. Synthetic records, no Auth API/email/provider/file uploads.
-- No DDL or global setting changes. All fixture rows are rolled back.
-- Requires the mail module enabled by normal platform administration; never
-- enable it merely to pass this fixture. Use company-mail-disabled-rollback.sql
-- while the live module is closed.
begin;
do $$ begin
 if not (select enforce_access from private.tc_settings where id=true)
  or (select registration_open or payments_enabled from private.tc_settings where id=true) then
  raise exception 'Unexpected live settings';end if;
 if exists(select 1 from auth.users where id in ('f1000000-0000-4000-8000-000000000301','f1000000-0000-4000-8000-000000000302')) then
  raise exception 'Fixture IDs already exist; preserve them';end if;
end $$;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at,raw_user_meta_data) values
 ('f1000000-0000-4000-8000-000000000301','mail-a@truckcontrol-test.invalid',now(),'12025550131',now(),'{}'),
 ('f1000000-0000-4000-8000-000000000302','mail-b@truckcontrol-test.invalid',now(),'12025550132',now(),'{}');
insert into private.tc_customers(user_id,contact_name,company_name,tax_id,address,email,phone) values
 ('f1000000-0000-4000-8000-000000000301','Persona ficticia A','Empresa ficticia A','MAIL-TEST-A','Dirección ficticia A','mail-a@truckcontrol-test.invalid','+12025550131'),
 ('f1000000-0000-4000-8000-000000000302','Persona ficticia B','Empresa ficticia B','MAIL-TEST-B','Dirección ficticia B','mail-b@truckcontrol-test.invalid','+12025550132');
insert into public.organizations(id,owner_id,name) values
 ('f2000000-0000-4000-8000-000000000301','f1000000-0000-4000-8000-000000000301','Empresa ficticia correo A'),
 ('f2000000-0000-4000-8000-000000000302','f1000000-0000-4000-8000-000000000302','Empresa ficticia correo B');

set local role anon;
do $$ declare denied boolean:=false;begin
 begin perform public.company_mail_server('get_inbox','{}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous server RPC access';end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000301',true);
do $$ declare denied boolean:=false;begin
 begin perform public.company_mail_server('get_inbox','{}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Authenticated server RPC access';end if;
 denied:=false;
 begin perform 1 from private.company_mail_inboxes;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Client read internal inbox table';end if;
end $$;
reset role;

set local role service_role;
do $$
declare org uuid:='f2000000-0000-4000-8000-000000000301';actor uuid:='f1000000-0000-4000-8000-000000000301';
 foreign_actor uuid:='f1000000-0000-4000-8000-000000000302';doc uuid:=gen_random_uuid();r jsonb;d jsonb;lease jsonb;denied boolean:=false;
 recipient text:=repeat('a',43)||'@forward-test.invalid';
begin
 r:=public.company_mail_server('enable_inbox',jsonb_build_object('organization_id',org,'user_id',actor,'recipient',recipient,'domain','forward-test.invalid'));
 if r->>'recipient'<>recipient or r->>'enabled'<>'true' then raise exception 'Inbox creation failed';end if;
 begin perform public.company_mail_server('get_inbox',jsonb_build_object('organization_id',org,'user_id',foreign_actor));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Foreign user reached inbox';end if;
 d:=jsonb_build_object('organization_id',org,'user_id',actor,'import_source','email_upload','message_id','synthetic-mail-a',
  'attachment_id','synthetic-attachment-a','content_hash',repeat('a',64),'total_cents',12100,
  'document',jsonb_build_object('id',doc,'name','Factura ficticia.pdf','object_path',org::text||'/'||doc::text||'/document.pdf','content_type','application/pdf','size_bytes',100));
 r:=public.company_mail_server('record_invoice',d);
 if r->>'status'<>'needs_review' or r->>'total_cents' is not null or r->>'import_source'<>'email_upload' then
  raise exception 'Unreviewed email booked or invented amounts';end if;
 if public.company_mail_server('record_invoice',d)->>'duplicate'<>'true' then raise exception 'Duplicate accepted';end if;
 lease:=public.company_mail_server('delivery_begin',jsonb_build_object('recipient',recipient,'delivery_id','synthetic-delivery','body_hash',repeat('b',64)));
 if lease->>'state'<>'ready' then raise exception 'Delivery lease missing';end if;
 if public.company_mail_server('delivery_begin',jsonb_build_object('recipient',recipient,'delivery_id','synthetic-delivery','body_hash',repeat('b',64)))->>'state'<>'busy' then
  raise exception 'Concurrent delivery accepted';end if;
 doc:=gen_random_uuid();
 d:=d||jsonb_build_object('import_source','forwarded_email','message_id','synthetic-mail-b','attachment_id','synthetic-attachment-b','content_hash',repeat('b',64),
  'delivery_id','synthetic-delivery','lease_token',lease->>'lease_token',
  'document',jsonb_build_object('id',doc,'name','Factura reenviada ficticia.pdf','object_path',org::text||'/'||doc::text||'/document.pdf','content_type','application/pdf','size_bytes',120));
 perform public.company_mail_server('record_invoice',d);
 perform public.company_mail_server('delivery_finish',jsonb_build_object('organization_id',org,'user_id',actor,'delivery_id','synthetic-delivery','lease_token',lease->>'lease_token','succeeded',true,'imported',1));
 r:=public.company_mail_server('delivery_begin',jsonb_build_object('recipient',recipient,'delivery_id','synthetic-delivery','body_hash',repeat('b',64)));
 if r->>'state'<>'complete' or r->>'imported'<>'1' then raise exception 'Replay not deduplicated';end if;
 perform public.company_mail_server('disable_inbox',jsonb_build_object('organization_id',org,'user_id',actor));
 denied:=false;
 begin perform public.company_mail_server('delivery_begin',jsonb_build_object('recipient',recipient,'delivery_id','synthetic-disabled','body_hash',repeat('c',64)));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Disabled inbox accepted email';end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000302',true);
do $$ begin
 if exists(select 1 from public.list_company_invoices('f2000000-0000-4000-8000-000000000301')) then
  raise exception 'Foreign company read invoices';end if;
end $$;
reset role;
insert into private.tc_memberships(organization_id,user_id,role,status,invited_by) values
 ('f2000000-0000-4000-8000-000000000301','f1000000-0000-4000-8000-000000000302','viewer','active','f1000000-0000-4000-8000-000000000301');
set local role service_role;
do $$ declare denied boolean:=false;begin
 begin perform public.company_mail_server('enable_inbox',jsonb_build_object('organization_id','f2000000-0000-4000-8000-000000000301',
  'user_id','f1000000-0000-4000-8000-000000000302','recipient',repeat('a',43)||'@forward-test.invalid','domain','forward-test.invalid'));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Viewer administered inbox';end if;
end $$;
reset role;
update private.tc_customers set status='suspended' where user_id='f1000000-0000-4000-8000-000000000301';
set local role service_role;
do $$ declare denied boolean:=false;begin
 begin perform public.company_mail_server('get_inbox',jsonb_build_object('organization_id','f2000000-0000-4000-8000-000000000301','user_id','f1000000-0000-4000-8000-000000000301'));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Suspended company accepted';end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.finance_entries where organization_id in ('f2000000-0000-4000-8000-000000000301','f2000000-0000-4000-8000-000000000302')) then
  raise exception 'Import booked an expense';end if;
end $$;
rollback;
select 'company_mail_passed_and_rolled_back' as verification,
 (select count(*) from auth.users where id in ('f1000000-0000-4000-8000-000000000301','f1000000-0000-4000-8000-000000000302')) as synthetic_users_remaining,
 (select count(*) from public.organizations where id in ('f2000000-0000-4000-8000-000000000301','f2000000-0000-4000-8000-000000000302')) as synthetic_companies_remaining,
 (select enforce_access from private.tc_settings where id=true) as enforce_access,
 (select registration_open from private.tc_settings where id=true) as registration_open,
 (select payments_enabled from private.tc_settings where id=true) as payments_enabled;

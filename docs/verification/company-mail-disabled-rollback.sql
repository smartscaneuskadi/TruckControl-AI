-- TruckControl only, synthetic accounts. Verify the current closed mail module
-- without enabling any live control, provider, public signup, AI or payment.
begin;
do $$ begin
 if not (select enforce_access from private.tc_settings where id=true)
  or (select registration_open or payments_enabled from private.tc_settings where id=true)
  or (select enabled from private.tc_modules where id='gmail') then
  raise exception 'Expected access control and closed mail module';end if;
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
 denied:=false;
 begin perform 1 from private.company_mail_receipts;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Client read internal receipts';end if;
end $$;
reset role;
set local role service_role;
do $$ declare a jsonb; operation text; denied boolean;
 ctx jsonb:=jsonb_build_object('organization_id','f2000000-0000-4000-8000-000000000301','user_id','f1000000-0000-4000-8000-000000000301');
begin
 a:=public.tc_company_server_access(p_org=>'f2000000-0000-4000-8000-000000000301',p_user=>'f1000000-0000-4000-8000-000000000301');
 if not coalesce((a->>'active')::boolean,false) or coalesce((a->'features'->>'gmail')::boolean,false) then
  raise exception 'Expected an active synthetic account with mail disabled';end if;
 foreach operation in array array['get_inbox','enable_inbox','disable_inbox','exists','record_invoice'] loop
  denied:=false;
  begin perform public.company_mail_server(operation,ctx);exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Disabled mail module accepted %',operation;end if;
 end loop;
 denied:=false;
 begin perform public.company_mail_server('delivery_begin',jsonb_build_object('recipient',repeat('a',43)||'@forward-test.invalid','delivery_id','closed-test','body_hash',repeat('a',64)));
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unissued inbox accepted delivery';end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.company_mail_inboxes where organization_id in ('f2000000-0000-4000-8000-000000000301','f2000000-0000-4000-8000-000000000302'))
  or exists(select 1 from private.invoice_documents where organization_id in ('f2000000-0000-4000-8000-000000000301','f2000000-0000-4000-8000-000000000302'))
  or exists(select 1 from public.finance_entries where organization_id in ('f2000000-0000-4000-8000-000000000301','f2000000-0000-4000-8000-000000000302')) then
  raise exception 'Closed intake created data';end if;
end $$;
rollback;
select 'company_mail_disabled_passed_and_rolled_back' as verification,
 (select count(*) from auth.users where id in ('f1000000-0000-4000-8000-000000000301','f1000000-0000-4000-8000-000000000302')) as synthetic_users_remaining,
 (select count(*) from public.organizations where id in ('f2000000-0000-4000-8000-000000000301','f2000000-0000-4000-8000-000000000302')) as synthetic_companies_remaining,
 (select enforce_access from private.tc_settings where id=true) as enforce_access,
 (select registration_open from private.tc_settings where id=true) as registration_open,
 (select payments_enabled from private.tc_settings where id=true) as payments_enabled,
 (select enabled from private.tc_modules where id='gmail') as mail_module_enabled;

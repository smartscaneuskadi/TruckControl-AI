-- Synthetic transaction only: no Auth API, email, SMS, provider or charge.
begin;
update private.tc_settings set registration_open=true,sms_ready=false where id=true;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('a7110000-0000-4000-8000-000000000001','offer-check@example.com',now(),
 '{"truckcontrol_registration":{"contact_name":"Persona ficticia","company_name":"Oferta ficticia","tax_id":"DEMO-OFFER","address":"Dirección ficticia 10","phone":"+34600000601","requested_plan":"full"},"is_admin":true,"trial_days":9999}');
select set_config('request.jwt.claim.sub','a7110000-0000-4000-8000-000000000001',true);
do $$ declare c private.tc_customers; b private.tc_payment_requests; f private.tc_payment_requests; ending timestamptz; begin
 select * into c from private.tc_customers where user_id='a7110000-0000-4000-8000-000000000001';
 if c.user_id is null or c.trial_ends_at<>c.trial_started_at+interval '10 days' or c.requested_plan<>'full' then raise exception 'New offer provisioning failed';end if;
 if exists(select 1 from private.tc_admins where user_id=c.user_id) then raise exception 'Forged admin metadata accepted';end if;
 select * into b from private.tc_payment_requests where id=public.tc_request_plan('limited');
 select * into f from private.tc_payment_requests where id=public.tc_request_plan('full');
 if b.quoted_cents<>36300 or b.net_cents<>30000 or b.vat_rate_bps<>2100 or b.vat_cents<>6300
   or f.quoted_cents<>84700 or f.net_cents<>70000 or f.vat_rate_bps<>2100 or f.vat_cents<>14700 then raise exception 'VAT quote mismatch';end if;
 if public.tc_request_plan('full')<>f.id then raise exception 'Quote is not idempotent';end if;
 update private.tc_customers set trial_ends_at=trial_started_at+interval '30 days' where user_id=c.user_id returning trial_ends_at into ending;
 perform private.tc_provision(c.user_id);
 if (select trial_ends_at from private.tc_customers where user_id=c.user_id)<>ending then raise exception 'Existing trial was reset';end if;
 if has_function_privilege('anon','private.tc_quote_vat(integer)','execute') or has_function_privilege('authenticated','private.tc_quote_vat(integer)','execute')
   or has_table_privilege('anon','private.tc_payment_requests','select') or has_table_privilege('authenticated','private.tc_payment_requests','select') then raise exception 'Private quote data exposed';end if;
 if (select payments_enabled from private.tc_settings where id=true) then raise exception 'Payments unexpectedly enabled';end if;
end $$;
rollback;
select jsonb_build_object('verification','offer_checked_and_rolled_back','synthetic_users_remaining',(select count(*) from auth.users where id='a7110000-0000-4000-8000-000000000001'),
 'customers_remaining',(select count(*) from private.tc_customers),'subscriptions_remaining',(select count(*) from private.tc_billing_subscriptions),
 'registration_open',(select registration_open from private.tc_settings where id=true),'payments_enabled',(select payments_enabled from private.tc_settings where id=true));

-- Bounded native PostgreSQL check: 50 trucks, 2,100 ledger rows, two tenants.
-- No Auth API, messages, providers or permanent data. All fixtures roll back.
begin;
update private.tc_settings set sms_ready=false where id=true;
update private.tc_modules set enabled=true where id in ('trucks','drivers','income','expenses','profitability');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('f3000000-0000-4000-8000-000000000001','capacity-a@example.com',now(),'{}'),
  ('f3000000-0000-4000-8000-000000000002','capacity-b@example.com',now(),'{}');
insert into private.tc_customers(user_id,contact_name,company_name,tax_id,address,email,phone) values
  ('f3000000-0000-4000-8000-000000000001','Persona ficticia A','Capacidad ficticia A','DEMO-A','Dirección ficticia','capacity-a@example.com','+34600000401'),
  ('f3000000-0000-4000-8000-000000000002','Persona ficticia B','Capacidad ficticia B','DEMO-B','Dirección ficticia','capacity-b@example.com','+34600000402');
insert into public.organizations(id,owner_id,name) values
  ('f4000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001','Capacidad ficticia A'),
  ('f4000000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000002','Capacidad ficticia B');
insert into public.trucks(organization_id,plate,brand,model,year,inspection_due_on)
  select 'f4000000-0000-4000-8000-000000000001','DEMO '||lpad(n::text,4,'0'),'Ficticia','Prueba',2026,current_date+365 from generate_series(1,50) n;
insert into public.trucks(organization_id,plate,brand,model,year,inspection_due_on)
  values('f4000000-0000-4000-8000-000000000002','DEMO B001','Ficticia','Prueba',2026,current_date+365);
with numbered as (
  select id,row_number() over(order by plate) n from public.trucks where organization_id='f4000000-0000-4000-8000-000000000001'
)
insert into public.finance_entries(organization_id,truck_id,kind,concept,date,amount_cents,category,distance_km)
  select 'f4000000-0000-4000-8000-000000000001',t.id,case when g.n%3=0 then 'income' else 'expense' end,
    'Apunte ficticio '||g.n,current_date-(g.n%180),case when g.n%3=0 then 50000 else 10000 end,
    case when g.n%3=0 then 'transport' else 'fuel' end,case when g.n%3=0 then 500 else 0 end
  from generate_series(1,2100) g(n) join numbered t on t.n=1+(g.n%50);
insert into public.finance_entries(organization_id,truck_id,kind,concept,date,amount_cents,category)
  select organization_id,id,'expense','Apunte de otra empresa',current_date,100,'other'
  from public.trucks where organization_id='f4000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','f3000000-0000-4000-8000-000000000001',true);
do $$ declare denied boolean:=false; begin
  if (select count(*) from public.trucks)<>50 or (select count(*) from public.finance_entries)<>2100
    or exists(select 1 from public.finance_entries where organization_id='f4000000-0000-4000-8000-000000000002')
    then raise exception 'Fleet or financial tenant isolation failed';end if;
  begin
    insert into public.trucks(organization_id,plate,brand,model,year,inspection_due_on)
      values('f4000000-0000-4000-8000-000000000001','DEMO 0051','Ficticia','Prueba',2026,current_date+365);
  exception when check_violation or raise_exception then denied:=true;end;
  if not denied then raise exception 'Truck 51 was accepted';end if;
end $$;
explain(analyze,buffers,format json)
  select id,date,amount_cents,kind,category,truck_id from public.finance_entries
  where organization_id='f4000000-0000-4000-8000-000000000001' order by date desc limit 1000;
reset role;
rollback;
select 'fleet_capacity_passed_and_rolled_back' as verification,
  (select count(*) from auth.users where id in ('f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002')) as synthetic_users_remaining,
  (select count(*) from public.trucks) as trucks_remaining,
  (select count(*) from public.finance_entries) as ledger_rows_remaining,
  (select registration_open from private.tc_settings where id=true) as registration_open,
  (select payments_enabled from private.tc_settings where id=true) as payments_enabled;

-- Owner-approved launch offer. Existing customers, trials, quotes and paid periods remain unchanged.
alter table private.tc_customers alter column trial_ends_at set default now()+interval '10 days';

-- Keep unknown historical tax treatment null; never infer or rewrite an old quote.
alter table private.tc_payment_requests
 add column net_cents integer,
 add column vat_rate_bps integer,
 add column vat_cents integer,
 add constraint tc_payment_quote_tax_check check (
  (net_cents is null and vat_rate_bps is null and vat_cents is null) or
  (net_cents is not null and vat_rate_bps is not null and vat_cents is not null
   and net_cents between 100 and 100000000 and vat_rate_bps between 0 and 10000
   and vat_cents=((net_cents::bigint*vat_rate_bps+5000)/10000)::integer
   and quoted_cents=net_cents+vat_cents)
 );

create function private.tc_quote_vat(p_net_cents integer) returns integer
 language sql immutable strict security invoker set search_path='' as $$
 select ((p_net_cents::bigint*2100+5000)/10000)::integer;
$$;
revoke all on function private.tc_quote_vat(integer) from public,anon,authenticated;

update private.tc_plans set name=case id when 'limited' then 'Básico' else 'Full' end,
 monthly_cents=case id when 'limited' then 30000 else 70000 end,
 max_trucks=50,published=true,revision=revision+1,updated_at=now()
 where id in ('limited','full');
update private.tc_settings set prices_are_examples=false,payments_enabled=false,updated_at=now() where id=true;

create or replace function private.tc_provision(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u record; r jsonb; s private.tc_settings; v_phone text;
begin
  select * into s from private.tc_settings where id=true;
  select * into u from auth.users where id=p_user_id for update;
  if not found then return; end if;
  if u.email_confirmed_at is not null and lower(u.email)=lower(s.owner_email) then
    insert into private.tc_admins(user_id) values(p_user_id) on conflict do nothing;
    return;
  end if;
  if not s.registration_open or u.email_confirmed_at is null then return; end if;
  if s.sms_ready and u.phone_confirmed_at is null then return; end if;
  r := u.raw_user_meta_data->'truckcontrol_registration';
  if r is null or jsonb_typeof(r)<>'object' then return; end if;
  v_phone := coalesce(r->>'phone','');
  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then return; end if;
  if s.sms_ready and ('+'||regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'))<>v_phone then return; end if;
  if char_length(btrim(coalesce(r->>'contact_name',''))) not between 2 and 100
    or char_length(btrim(coalesce(r->>'company_name',''))) not between 2 and 100
    or char_length(btrim(coalesce(r->>'tax_id',''))) not between 3 and 30
    or char_length(btrim(coalesce(r->>'address',''))) not between 5 and 240 then return; end if;
  insert into private.tc_customers(user_id,contact_name,company_name,tax_id,address,email,phone,requested_plan,trial_started_at,trial_ends_at)
    values(p_user_id,btrim(r->>'contact_name'),btrim(r->>'company_name'),btrim(r->>'tax_id'),btrim(r->>'address'),u.email,v_phone,
      case when r->>'requested_plan'='full' then 'full' else 'limited' end,now(),now()+interval '10 days')
    on conflict(user_id) do nothing;
  if not exists(select 1 from public.organizations where owner_id=p_user_id) then
    insert into public.organizations(owner_id,name) values(p_user_id,btrim(r->>'company_name'));
  end if;
end;
$$;
revoke all on function private.tc_provision(uuid) from public,anon,authenticated;

create or replace function private.tc_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('app_name',s.app_name,'trial_days',10,'prices_are_examples',s.prices_are_examples,
  'payments_enabled',s.payments_enabled,'sms_ready',s.sms_ready,'registration_open',s.registration_open,'plans',
  (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'monthly_cents',p.monthly_cents,'currency',p.currency,
   'vat_rate_bps',2100,'monthly_vat_cents',private.tc_quote_vat(p.monthly_cents),
   'monthly_total_cents',p.monthly_cents+private.tc_quote_vat(p.monthly_cents),
   'max_trucks',p.max_trucks,'modules',p.modules,'revision',p.revision) order by p.monthly_cents),'[]'::jsonb)
   from private.tc_plans p where published)) from private.tc_settings s where id=true;
$$;
revoke all on function private.tc_catalog() from public,anon,authenticated;
grant execute on function private.tc_catalog() to anon,authenticated;

create or replace function private.tc_request_plan(p_plan_id text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); p private.tc_plans; request_id uuid;
begin
 if actor is null or not exists(select 1 from private.tc_customers where user_id=actor) then
  raise exception 'Completa la verificación de tu cuenta' using errcode='42501';end if;
 perform 1 from private.tc_customers where user_id=actor for update;
 update private.tc_payment_requests set status='cancelled' where user_id=actor and status in ('requested','checkout') and created_at<now()-interval '1 day';
 select * into p from private.tc_plans where id=p_plan_id and published;
 if not found then raise exception 'Plan no disponible';end if;
 select id into request_id from private.tc_payment_requests where user_id=actor and plan_id=p_plan_id
   and plan_revision=p.revision and status in ('requested','checkout') order by created_at desc limit 1;
 if request_id is null then
  insert into private.tc_payment_requests(user_id,plan_id,quoted_cents,plan_revision,net_cents,vat_rate_bps,vat_cents) values(actor,p.id,p.monthly_cents+private.tc_quote_vat(p.monthly_cents),p.revision,p.monthly_cents,2100,private.tc_quote_vat(p.monthly_cents)) returning id into request_id;
 end if;
 update private.tc_customers set requested_plan=p_plan_id,updated_at=now() where user_id=actor;
 return request_id;
end;
$$;

revoke all on function private.tc_request_plan(text) from public,anon,authenticated;
grant execute on function private.tc_request_plan(text) to authenticated;

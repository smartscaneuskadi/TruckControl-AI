-- New registrations receive Basic; legacy trial grants and paid periods are preserved.
alter table private.tc_customers add column trial_plan_id text not null default 'full' references private.tc_plans(id);
alter table private.tc_customers alter column trial_plan_id set default 'limited';
create index tc_customers_trial_plan_idx on private.tc_customers(trial_plan_id);
create function private.tc_customer_plan(c private.tc_customers) returns text
language sql stable security invoker set search_path='' as $$
 select case when c.trial_plan_id='limited' and c.status='active' then c.paid_plan
  when now()<c.trial_ends_at then c.trial_plan_id
  when c.status='active' then c.paid_plan else coalesce(c.trial_plan_id,'full') end;
$$;
revoke all on function private.tc_customer_plan(private.tc_customers) from public,anon,authenticated;

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
  -- Auth metadata is user-editable. New customers need an immutable server receipt.
  if (select enabled from private.tc_auth_mail_settings where id) and not exists(
    select 1 from private.tc_customers where user_id=p_user_id) and (
      not (select legal_ready from private.tc_auth_mail_settings where id) or not exists(
        select 1 from private.tc_auth_legal_consents c join private.tc_auth_mail_settings m on m.id
        where c.user_id=p_user_id and c.legal_version=m.legal_version)) then return;end if;

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
  insert into private.tc_customers(user_id,contact_name,company_name,tax_id,address,email,phone,requested_plan,trial_plan_id,trial_started_at,trial_ends_at)
    values(p_user_id,btrim(r->>'contact_name'),btrim(r->>'company_name'),btrim(r->>'tax_id'),btrim(r->>'address'),u.email,v_phone,
      case when r->>'requested_plan'='full' then 'full' else 'limited' end,'limited',now(),now()+interval '10 days')
    on conflict(user_id) do nothing;
  if not exists(select 1 from public.organizations where owner_id=p_user_id) then
    insert into public.organizations(owner_id,name) values(p_user_id,btrim(r->>'company_name'));
  end if;
end;
$$;
revoke all on function private.tc_provision(uuid) from public,anon,authenticated;

create or replace function private.tc_user_access(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.tc_customers; p private.tc_plans; s private.tc_settings; active boolean; f jsonb; is_admin boolean; requires_phone boolean;
begin
  -- Internal-only helper: all externally callable wrappers bind auth.uid().
  if p_user_id is null then return '{}'::jsonb;end if;
  select * into s from private.tc_settings where id=true;
  select exists(select 1 from private.tc_admins where user_id=p_user_id) into is_admin;
  select * into c from private.tc_customers where user_id=p_user_id;
  requires_phone := not is_admin and c.user_id is not null and s.sms_ready and not exists(
    select 1 from auth.users u where u.id=p_user_id and u.phone_confirmed_at is not null
    and ('+'||regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'))=c.phone);
  active := is_admin or (c.user_id is not null and c.status<>'suspended' and not coalesce(requires_phone,false) and
    ((c.status='trial' and now()<c.trial_ends_at) or (c.status='active' and now()<c.paid_until)));
  select * into p from private.tc_plans where id=private.tc_customer_plan(c);
  select jsonb_object_agg(m.id,coalesce(active,false) and m.enabled and
    (is_admin or coalesce((c.module_overrides->>m.id)::boolean,(p.modules->>m.id)::boolean,false)) and
    (m.id not in ('invoice_ai','document_ai') or (not is_admin and c.ai_allowed and c.ai_opt_in))) into f from private.tc_modules m;
  return jsonb_build_object('is_admin',is_admin,'active',coalesce(active,false),'features',coalesce(f,'{}'),
    'profile',case when c.user_id is null then null else to_jsonb(c)-'stripe_subscription_id' end,
    'plan',private.tc_customer_plan(c),
    'max_trucks',coalesce(p.max_trucks,50),'requires_phone_verification',coalesce(requires_phone,false),
    'sms_ready',s.sms_ready,'prices_are_examples',s.prices_are_examples,'payments_enabled',s.payments_enabled);
end;
$$;
revoke all on function private.tc_user_access(uuid) from public,anon,authenticated;

create or replace function private.tc_organization_access_for(p_org uuid,p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o public.organizations; c private.tc_customers; a private.tc_customers; s private.tc_settings;
 r text; plan_id text; enabled boolean; phone_needed boolean; u record; profile jsonb;
begin
 r:=private.tc_company_role_for(p_org,p_user);
 if r is null then return jsonb_build_object('active',false,'features','{}'::jsonb,'profile',null);end if;
 select * into s from private.tc_settings where id=true;
 if not s.enforce_access then
  return jsonb_build_object('active',true,'is_admin',false,'features',(select jsonb_object_agg(id,true) from private.tc_modules),
   'company_role',r,'can_write',r<>'viewer','can_manage',r in ('owner','admin'),'organization_id',p_org,'profile',null,'max_trucks',50);
 end if;
 select * into o from public.organizations where id=p_org;
 select * into c from private.tc_customers where user_id=o.owner_id;
 select * into a from private.tc_customers where user_id=p_user;
 select * into u from auth.users where id=p_user;
 phone_needed:=s.sms_ready and (u.phone_confirmed_at is null or ('+'||regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'))<>a.phone);
 enabled:=c.user_id is not null and a.user_id is not null and a.status<>'suspended' and c.status<>'suspended'
  and u.email_confirmed_at is not null and not coalesce(phone_needed,true)
  and ((c.status='trial' and now()<c.trial_ends_at) or (c.status='active' and now()<c.paid_until));
 plan_id:=private.tc_customer_plan(c);
 profile:=to_jsonb(a)-'stripe_subscription_id'||jsonb_build_object('company_name',o.name,
  'status',case when a.status='suspended' then 'suspended' else c.status end,
  'trial_started_at',c.trial_started_at,'trial_ends_at',c.trial_ends_at,'paid_until',c.paid_until,'paid_plan',c.paid_plan,'trial_plan_id',c.trial_plan_id);
 return jsonb_build_object('active',coalesce(enabled,false),'is_admin',false,
  'features',private.tc_company_features(p_org,p_user,plan_id,coalesce(enabled,false)),
  'company_role',r,'can_write',coalesce(enabled,false) and r<>'viewer','can_manage',coalesce(enabled,false) and r in ('owner','admin'),
  'organization_id',p_org,'profile',profile,'plan',plan_id,
  'max_trucks',coalesce((select max_trucks from private.tc_plans where id=plan_id),50),
  'requires_phone_verification',coalesce(phone_needed,false),'sms_ready',s.sms_ready,
  'prices_are_examples',s.prices_are_examples,'payments_enabled',s.payments_enabled);
end;
$$;
revoke all on function private.tc_organization_access_for(uuid,uuid) from public,anon,authenticated;

create or replace function private.tc_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('app_name',s.app_name,'trial_days',10,'trial_plan','limited','prices_are_examples',s.prices_are_examples,
  'payments_enabled',s.payments_enabled,'sms_ready',s.sms_ready,'registration_open',s.registration_open,'plans',
  (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'monthly_cents',p.monthly_cents,'currency',p.currency,
   'vat_rate_bps',2100,'monthly_vat_cents',private.tc_quote_vat(p.monthly_cents),
   'monthly_total_cents',p.monthly_cents+private.tc_quote_vat(p.monthly_cents),
   'max_trucks',p.max_trucks,'modules',p.modules,'revision',p.revision) order by p.monthly_cents),'[]'::jsonb)
   from private.tc_plans p where published)) from private.tc_settings s where id=true;
$$;
revoke all on function private.tc_catalog() from public,anon,authenticated;
grant execute on function private.tc_catalog() to anon,authenticated;

-- New consent version; existing receipts/contracts remain immutable.
update private.tc_auth_mail_settings set legal_version='2026-11-02' where id;

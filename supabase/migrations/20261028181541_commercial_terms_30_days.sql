-- Preserve historical trials while applying the owner's new commercial terms.
do $$ begin
 if exists(select 1 from pg_constraint where conrelid='private.tc_customers'::regclass
   and conname='tc_customers_check' and pg_get_constraintdef(oid) like '%10 days%') then
  alter table private.tc_customers drop constraint tc_customers_check;
 end if;
end $$;
alter table private.tc_customers add constraint tc_customers_trial_period_check
 check(trial_ends_at=trial_started_at+interval '10 days' or trial_ends_at=trial_started_at+interval '30 days');
alter table private.tc_customers alter column trial_ends_at set default now()+interval '30 days';
update private.tc_plans set name='Inicial',monthly_cents=1000,max_trucks=50,
 modules=modules||'{"documents":true,"gmail":true,"assistant":true}'::jsonb,
 published=true,revision=revision+1,updated_at=now() where id='limited';
update private.tc_plans set max_trucks=50,published=false,revision=revision+1,updated_at=now() where id='full';

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
      'limited',now(),now()+interval '30 days')
    on conflict(user_id) do nothing;
  if not exists(select 1 from public.organizations where owner_id=p_user_id) then
    insert into public.organizations(owner_id,name) values(p_user_id,btrim(r->>'company_name'));
  end if;
end;
$$;
revoke all on function private.tc_provision(uuid) from public,anon,authenticated;

create or replace function private.tc_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('app_name',s.app_name,'trial_days',30,'prices_are_examples',s.prices_are_examples,
  'payments_enabled',s.payments_enabled,'sms_ready',s.sms_ready,'registration_open',s.registration_open,'plans',
  (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'monthly_cents',p.monthly_cents,'currency',p.currency,
     'max_trucks',p.max_trucks,'modules',p.modules,'revision',p.revision) order by p.monthly_cents),'[]'::jsonb)
     from private.tc_plans p where published)) from private.tc_settings s where id=true;
$$;
revoke all on function private.tc_catalog() from public,anon,authenticated;
grant execute on function private.tc_catalog() to anon,authenticated;

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
  select * into p from private.tc_plans where id=case when now()<c.trial_ends_at then 'full' when c.status='active' then c.paid_plan else 'full' end;
  select jsonb_object_agg(m.id,coalesce(active,false) and m.enabled and
    (is_admin or coalesce((c.module_overrides->>m.id)::boolean,(p.modules->>m.id)::boolean,false)) and
    (m.id<>'invoice_ai' or (not is_admin and c.ai_allowed and c.ai_opt_in))) into f from private.tc_modules m;
  return jsonb_build_object('is_admin',is_admin,'active',coalesce(active,false),'features',coalesce(f,'{}'),
    'profile',case when c.user_id is null then null else to_jsonb(c)-'stripe_subscription_id' end,
    'plan',case when now()<c.trial_ends_at then 'full' when c.status='active' then c.paid_plan else 'full' end,
    'max_trucks',coalesce(p.max_trucks,50),'requires_phone_verification',coalesce(requires_phone,false),
    'sms_ready',s.sms_ready,'prices_are_examples',s.prices_are_examples,'payments_enabled',s.payments_enabled);
end;
$$;
revoke all on function private.tc_user_access(uuid) from public,anon,authenticated;

-- Separate audited operations into bounded functions; preserve the RPC interfaces.
-- Every privileged admin helper verifies auth.uid(); Gmail remains service-role only.
create or replace function private.tc_gmail_state(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_org uuid := nullif(p_data->>'organization_id','')::uuid; v_state private.gmail_oauth_states; v_result jsonb; v_doc jsonb;
begin
 case p_action
  when 'state_create' then
    delete from private.gmail_oauth_states where expires_at < now();
    if not exists(select 1 from public.organizations where id=v_org and owner_id=(p_data->>'user_id')::uuid) then
      raise exception 'Empresa no disponible' using errcode='42501';
    end if;
    insert into private.gmail_oauth_states(state_hash,organization_id,user_id)
      values(p_data->>'state_hash',v_org,(p_data->>'user_id')::uuid);
    return '{}'::jsonb;
  when 'state_consume' then
    delete from private.gmail_oauth_states where state_hash=p_data->>'state_hash' returning * into v_state;
    if not found or v_state.expires_at < now() then return null; end if;
    if not exists(select 1 from public.organizations where id=v_state.organization_id and owner_id=v_state.user_id) then return null; end if;
    return to_jsonb(v_state);
  when 'pending_create' then
    delete from private.gmail_oauth_pending where expires_at < now();
    insert into private.gmail_oauth_pending(ticket_hash,organization_id,user_id,google_subject,email,refresh_token_cipher)
      values(p_data->>'ticket_hash',v_org,(p_data->>'user_id')::uuid,p_data->>'google_subject',p_data->>'email',p_data->>'refresh_token_cipher');
    return '{}'::jsonb;
  when 'pending_consume' then
    delete from private.gmail_oauth_pending where ticket_hash=p_data->>'ticket_hash' and organization_id=v_org
      and user_id=(p_data->>'user_id')::uuid and expires_at>now()
      and exists(select 1 from public.organizations where id=v_org and owner_id=(p_data->>'user_id')::uuid)
      returning to_jsonb(private.gmail_oauth_pending.*) into v_result;
    return v_result;
 else raise exception 'Unsupported internal operation';
 end case;
end;
$$;
revoke all on function private.tc_gmail_state(text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_gmail_state(text,jsonb) to service_role;
end if;end $$;

create or replace function private.tc_gmail_connection(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_org uuid := nullif(p_data->>'organization_id','')::uuid; v_state private.gmail_oauth_states; v_result jsonb; v_doc jsonb;
begin
 case p_action
  when 'connect' then
    if not exists(select 1 from public.organizations where id=v_org and owner_id=(p_data->>'user_id')::uuid) then
      raise exception 'Empresa no disponible' using errcode='42501';
    end if;
    -- Unique google_subject prevents silently sharing one mailbox across companies.
    insert into private.gmail_connections(organization_id,connected_by,google_subject,email)
      values(v_org,(p_data->>'user_id')::uuid,p_data->>'google_subject',p_data->>'email')
      on conflict(organization_id) do update set connected_by=excluded.connected_by,google_subject=excluded.google_subject,
        email=excluded.email,status='connected',connected_at=now(),sync_page_token=null;
    insert into private.gmail_tokens values(v_org,p_data->>'refresh_token_cipher')
      on conflict(organization_id) do update set refresh_token_cipher=excluded.refresh_token_cipher;
    return '{}'::jsonb;
  when 'credentials' then
    select jsonb_build_object('email',c.email,'user_id',c.connected_by,'google_subject',c.google_subject,'refresh_token_cipher',t.refresh_token_cipher,'page_token',c.sync_page_token)
      into v_result from private.gmail_connections c join private.gmail_tokens t using(organization_id)
      where c.organization_id=v_org and c.status='connected';
    return v_result;
  when 'disconnect' then
    delete from private.gmail_oauth_states where organization_id=v_org;
    delete from private.gmail_oauth_pending where organization_id=v_org;
    delete from private.gmail_connections where organization_id=v_org;
    return '{}'::jsonb;
 else raise exception 'Unsupported internal operation';
 end case;
end;
$$;
revoke all on function private.tc_gmail_connection(text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_gmail_connection(text,jsonb) to service_role;
end if;end $$;

create or replace function private.tc_gmail_sync(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_org uuid := nullif(p_data->>'organization_id','')::uuid; v_state private.gmail_oauth_states; v_result jsonb; v_doc jsonb;
begin
 case p_action
  when 'lock_sync' then
    update private.gmail_connections set sync_lease_until=now()+interval '5 minutes'
      where organization_id=v_org and (sync_lease_until is null or sync_lease_until<now()) and status='connected';
    return to_jsonb(found);
  when 'finish_sync' then
    update private.gmail_connections set last_sync_at=case when p_data->>'succeeded'='true' then now() else last_sync_at end,sync_lease_until=null,
      sync_page_token=case when p_data->>'succeeded'='true' then nullif(p_data->>'page_token','') else sync_page_token end,
      status=case when p_data->>'reauthorize'='true' then 'reauthorize' else status end where organization_id=v_org;
    return '{}'::jsonb;
  when 'exists' then
    return to_jsonb(exists(select 1 from private.invoice_documents where organization_id=v_org and
      (content_hash=p_data->>'content_hash' or (message_id=p_data->>'message_id' and attachment_id=p_data->>'attachment_id'))));
 else raise exception 'Unsupported internal operation';
 end case;
end;
$$;
revoke all on function private.tc_gmail_sync(text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_gmail_sync(text,jsonb) to service_role;
end if;end $$;

create or replace function private.tc_gmail_invoices(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_org uuid := nullif(p_data->>'organization_id','')::uuid; v_state private.gmail_oauth_states; v_result jsonb; v_doc jsonb;
begin
 case p_action
  when 'reserve_ai' then
    insert into private.invoice_ai_usage(organization_id,month,attempts) values(v_org,date_trunc('month',now())::date,1)
      on conflict(organization_id,month) do update set attempts=private.invoice_ai_usage.attempts+1
      where private.invoice_ai_usage.attempts<100 returning to_jsonb(attempts) into v_result;
    return to_jsonb(v_result is not null);
  when 'record_invoice' then
    v_doc := p_data->'document';
    insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes)
      values((v_doc->>'id')::uuid,v_org,v_doc->>'name',v_doc->>'object_path',v_doc->>'content_type',(v_doc->>'size_bytes')::integer);
    insert into private.invoice_documents(organization_id,message_id,attachment_id,content_hash,document_id,
      supplier,invoice_number,invoice_date,net_cents,tax_cents,total_cents,currency,review_note)
      values(v_org,p_data->>'message_id',p_data->>'attachment_id',p_data->>'content_hash',(v_doc->>'id')::uuid,
      coalesce(p_data->>'supplier',''),coalesce(p_data->>'invoice_number',''),nullif(p_data->>'invoice_date','')::date,
      (p_data->>'net_cents')::bigint,(p_data->>'tax_cents')::bigint,(p_data->>'total_cents')::bigint,
      coalesce(p_data->>'currency','EUR'),coalesce(p_data->>'review_note','')) returning to_jsonb(private.invoice_documents.*) into v_result;
    return v_result;
 else raise exception 'Unsupported internal operation';
 end case;
end;
$$;
revoke all on function private.tc_gmail_invoices(text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_gmail_invoices(text,jsonb) to service_role;
end if;end $$;

create or replace function public.gmail_server(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if p_action in ('state_create','state_consume','pending_create','pending_consume') then return private.tc_gmail_state(p_action,p_data);end if;
 if p_action in ('connect','credentials','disconnect') then return private.tc_gmail_connection(p_action,p_data);end if;
 if p_action in ('lock_sync','finish_sync','exists') then return private.tc_gmail_sync(p_action,p_data);end if;
 if p_action in ('reserve_ai','record_invoice') then return private.tc_gmail_invoices(p_action,p_data);end if;
 raise exception 'Unsupported internal operation';
end;
$$;
revoke all on function public.gmail_server(text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.gmail_server(text,jsonb) to service_role;
end if;end $$;

create or replace function private.tc_admin_snapshot(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p_action constant text := 'snapshot';actor uuid := (select auth.uid()); target uuid; result jsonb; old_record jsonb; updated_record jsonb;
  plan private.tc_plans; request private.tc_payment_requests; receipt text; until_date timestamptz;
begin
 if actor is null or not exists(select 1 from private.tc_admins where user_id=actor) then
  raise exception 'Solo la cuenta administradora puede realizar esta operación' using errcode='42501';end if;
  return jsonb_build_object('settings',(select to_jsonb(s)-'owner_email' from private.tc_settings s where id=true),
   'plans',(select coalesce(jsonb_agg(to_jsonb(p) order by monthly_cents),'[]') from private.tc_plans p),
   'modules',(select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]') from private.tc_modules m),
   'customers',(select coalesce(jsonb_agg(to_jsonb(c)-'stripe_subscription_id' order by created_at desc),'[]') from private.tc_customers c),
   'pending_registrations',(select coalesce(jsonb_agg(p),'[]') from (select u.id,u.email,
      u.email_confirmed_at is not null as email_confirmed,u.phone_confirmed_at is not null as phone_confirmed,
      u.raw_user_meta_data->'truckcontrol_registration'->>'company_name' as company_name
      from auth.users u where not exists(select 1 from private.tc_customers c where c.user_id=u.id)
      and not exists(select 1 from private.tc_admins a where a.user_id=u.id)
      and u.raw_user_meta_data ? 'truckcontrol_registration' limit 500)p),
   'payment_requests',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc),'[]') from private.tc_payment_requests r),
   'audit',(select coalesce(jsonb_agg(a),'[]') from (select * from private.tc_admin_audit order by created_at desc limit 100)a));

end;
$$;
revoke all on function private.tc_admin_snapshot(jsonb) from public,anon,authenticated;

create or replace function private.tc_admin_module(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p_action constant text := 'module';actor uuid := (select auth.uid()); target uuid; result jsonb; old_record jsonb; updated_record jsonb;
  plan private.tc_plans; request private.tc_payment_requests; receipt text; until_date timestamptz;
begin
 if actor is null or not exists(select 1 from private.tc_admins where user_id=actor) then
  raise exception 'Solo la cuenta administradora puede realizar esta operación' using errcode='42501';end if;
  update private.tc_modules set enabled=(p_data->>'enabled')::boolean where id=p_data->>'id' returning to_jsonb(private.tc_modules.*) into updated_record;
  if not found then raise exception 'Módulo no válido';end if;
 insert into private.tc_admin_audit(actor_id,action,target_id,details) values(actor,p_action,coalesce(target::text,p_data->>'id',p_data->>'request_id'),
  jsonb_build_object('before',old_record-'stripe_subscription_id','after',updated_record));
 return coalesce(updated_record,'{}');
end;
$$;
revoke all on function private.tc_admin_module(jsonb) from public,anon,authenticated;

create or replace function private.tc_admin_customer(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p_action constant text := 'customer';actor uuid := (select auth.uid()); target uuid; result jsonb; old_record jsonb; updated_record jsonb;
  plan private.tc_plans; request private.tc_payment_requests; receipt text; until_date timestamptz;
begin
 if actor is null or not exists(select 1 from private.tc_admins where user_id=actor) then
  raise exception 'Solo la cuenta administradora puede realizar esta operación' using errcode='42501';end if;
  target := (p_data->>'user_id')::uuid;
  select to_jsonb(c) into old_record from private.tc_customers c where user_id=target for update;
  if not found then raise exception 'Cliente no disponible';end if;
  if p_data ? 'module_overrides' and not private.tc_validate_module_map(p_data->'module_overrides') then raise exception 'Módulos no válidos';end if;
  update private.tc_customers set ai_allowed=case when p_data ? 'ai_allowed' then (p_data->>'ai_allowed')::boolean else ai_allowed end,
   status=case when p_data->>'suspended'='true' then 'suspended' when p_data->>'suspended'='false'
     then case when paid_until>now() then 'active' else 'trial' end else status end,
   module_overrides=case when p_data ? 'module_overrides' then p_data->'module_overrides' else module_overrides end,updated_at=now()
   where user_id=target returning to_jsonb(private.tc_customers.*)-'stripe_subscription_id' into updated_record;
 insert into private.tc_admin_audit(actor_id,action,target_id,details) values(actor,p_action,coalesce(target::text,p_data->>'id',p_data->>'request_id'),
  jsonb_build_object('before',old_record-'stripe_subscription_id','after',updated_record));
 return coalesce(updated_record,'{}');
end;
$$;
revoke all on function private.tc_admin_customer(jsonb) from public,anon,authenticated;

create or replace function private.tc_admin_plan(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p_action constant text := 'plan';actor uuid := (select auth.uid()); target uuid; result jsonb; old_record jsonb; updated_record jsonb;
  plan private.tc_plans; request private.tc_payment_requests; receipt text; until_date timestamptz;
begin
 if actor is null or not exists(select 1 from private.tc_admins where user_id=actor) then
  raise exception 'Solo la cuenta administradora puede realizar esta operación' using errcode='42501';end if;
  if not private.tc_validate_module_map(p_data->'modules') then raise exception 'Módulos no válidos';end if;
  update private.tc_plans set name=p_data->>'name',monthly_cents=(p_data->>'monthly_cents')::integer,
   max_trucks=(p_data->>'max_trucks')::integer,modules=p_data->'modules',published=(p_data->>'published')::boolean,
   revision=revision+1,updated_at=now() where id=p_data->>'id' returning to_jsonb(private.tc_plans.*) into updated_record;
  if not found then raise exception 'Plan no válido';end if;
 insert into private.tc_admin_audit(actor_id,action,target_id,details) values(actor,p_action,coalesce(target::text,p_data->>'id',p_data->>'request_id'),
  jsonb_build_object('before',old_record-'stripe_subscription_id','after',updated_record));
 return coalesce(updated_record,'{}');
end;
$$;
revoke all on function private.tc_admin_plan(jsonb) from public,anon,authenticated;

create or replace function private.tc_admin_settings(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p_action constant text := 'settings';actor uuid := (select auth.uid()); target uuid; result jsonb; old_record jsonb; updated_record jsonb;
  plan private.tc_plans; request private.tc_payment_requests; receipt text; until_date timestamptz;
begin
 if actor is null or not exists(select 1 from private.tc_admins where user_id=actor) then
  raise exception 'Solo la cuenta administradora puede realizar esta operación' using errcode='42501';end if;
  if p_data->>'payments_enabled'='true' and coalesce((p_data->>'prices_are_examples')::boolean,
    (select prices_are_examples from private.tc_settings where id=true)) then raise exception 'Confirma los precios antes de habilitar cobros';end if;
  update private.tc_settings set
   prices_are_examples=coalesce((p_data->>'prices_are_examples')::boolean,prices_are_examples),
   payments_enabled=coalesce((p_data->>'payments_enabled')::boolean,payments_enabled),
   registration_open=coalesce((p_data->>'registration_open')::boolean,registration_open),updated_at=now()
   where id=true returning to_jsonb(private.tc_settings.*)-'owner_email' into updated_record;
  if (updated_record->>'prices_are_examples')::boolean and (updated_record->>'payments_enabled')::boolean then
   raise exception 'Los precios de ejemplo no pueden generar cobros';end if;
 insert into private.tc_admin_audit(actor_id,action,target_id,details) values(actor,p_action,coalesce(target::text,p_data->>'id',p_data->>'request_id'),
  jsonb_build_object('before',old_record-'stripe_subscription_id','after',updated_record));
 return coalesce(updated_record,'{}');
end;
$$;
revoke all on function private.tc_admin_settings(jsonb) from public,anon,authenticated;

create or replace function private.tc_admin_manual_payment(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p_action constant text := 'manual_payment';actor uuid := (select auth.uid()); target uuid; result jsonb; old_record jsonb; updated_record jsonb;
  plan private.tc_plans; request private.tc_payment_requests; receipt text; until_date timestamptz;
begin
 if actor is null or not exists(select 1 from private.tc_admins where user_id=actor) then
  raise exception 'Solo la cuenta administradora puede realizar esta operación' using errcode='42501';end if;
  if (select prices_are_examples from private.tc_settings where id=true) then raise exception 'Los precios son de ejemplo; no se puede registrar un cobro real';end if;
  select * into request from private.tc_payment_requests where id=(p_data->>'request_id')::uuid for update;
  if not found then raise exception 'Solicitud no disponible';end if;
  if request.status='paid' then return jsonb_build_object('id',request.id,'already_paid',true);end if;
  receipt := btrim(coalesce(p_data->>'receipt',''));
  if char_length(receipt) not between 3 and 160 then raise exception 'Añade la referencia del pago confirmado';end if;
  select * into plan from private.tc_plans where id=request.plan_id;
  select greatest(coalesce(paid_until,now()),now(),trial_ends_at)+interval '1 month' into until_date from private.tc_customers where user_id=request.user_id for update;
  update private.tc_customers set paid_plan=request.plan_id,paid_until=until_date,
   status=case when status='suspended' then 'suspended' else 'active' end,updated_at=now() where user_id=request.user_id;
  update private.tc_payment_requests set status='paid' where id=request.id returning to_jsonb(private.tc_payment_requests.*) into updated_record;
  updated_record := updated_record||jsonb_build_object('receipt',receipt,'access_until',until_date);
 insert into private.tc_admin_audit(actor_id,action,target_id,details) values(actor,p_action,coalesce(target::text,p_data->>'id',p_data->>'request_id'),
  jsonb_build_object('before',old_record-'stripe_subscription_id','after',updated_record));
 return coalesce(updated_record,'{}');
end;
$$;
revoke all on function private.tc_admin_manual_payment(jsonb) from public,anon,authenticated;

create or replace function private.tc_admin_control(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); target uuid; result jsonb; old_record jsonb; updated_record jsonb;
  plan private.tc_plans; request private.tc_payment_requests; receipt text; until_date timestamptz;
begin
 if actor is null or not exists(select 1 from private.tc_admins where user_id=actor) then
  raise exception 'Solo la cuenta administradora puede realizar esta operación' using errcode='42501';end if;
 if p_action='snapshot' then return private.tc_admin_snapshot(p_data);end if;
 if p_action='module' then return private.tc_admin_module(p_data);end if;
 if p_action='customer' then return private.tc_admin_customer(p_data);end if;
 if p_action='plan' then return private.tc_admin_plan(p_data);end if;
 if p_action='settings' then return private.tc_admin_settings(p_data);end if;
 if p_action='manual_payment' then return private.tc_admin_manual_payment(p_data);end if;
 raise exception 'Operación no disponible';
end;
$$;
revoke all on function private.tc_admin_control(text,jsonb) from public,anon,authenticated;
grant execute on function private.tc_admin_control(text,jsonb) to authenticated;

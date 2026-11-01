-- Independent TruckControl runtime. No provider, payment or signup is enabled.
create table private.tc_provider_settings (
 id boolean primary key default true check(id),
 ai_enabled boolean not null default false,
 ai_monthly_budget_cents integer not null default 0 check(ai_monthly_budget_cents between 0 and 100000),
 ai_model text not null default 'gpt-6-luna' check(ai_model='gpt-6-luna'),
 receiving_enabled boolean not null default false,
 receiving_domain text check(receiving_domain is null or (char_length(receiving_domain) between 3 and 253 and receiving_domain ~ '^[a-z0-9.-]+$'))
);
insert into private.tc_provider_settings(id) values(true);
create table private.tc_ai_monthly_budget (
 month date primary key,
 reserved_micro_usd bigint not null default 0 check(reserved_micro_usd>=0),
 estimated_micro_usd bigint not null default 0 check(estimated_micro_usd>=0)
);
create table private.tc_ai_calls (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 invoice_id uuid unique references private.invoice_documents(id) on delete restrict,
 kind text not null check(kind in ('document','invoice')),
 month date not null references private.tc_ai_monthly_budget(month) on delete restrict,
 model text not null check(model='gpt-6-luna'),
 state text not null default 'reserved' check(state in ('reserved','settled')),
 reserved_micro_usd integer not null default 1000000 check(reserved_micro_usd=1000000),
 estimated_micro_usd integer check(estimated_micro_usd between 0 and 1000000),
 input_tokens integer check(input_tokens between 0 and 1050000),
 output_tokens integer check(output_tokens between 0 and 1200),
 created_at timestamptz not null default now(),
 check(invoice_id is null or kind='invoice')
);
create index tc_ai_calls_organization_idx on private.tc_ai_calls(organization_id,created_at);
create index tc_ai_calls_user_idx on private.tc_ai_calls(user_id);
create index tc_ai_calls_month_idx on private.tc_ai_calls(month);
alter table private.tc_provider_settings enable row level security;
alter table private.tc_ai_monthly_budget enable row level security;
alter table private.tc_ai_calls enable row level security;
revoke all on private.tc_provider_settings,private.tc_ai_monthly_budget,private.tc_ai_calls from public,anon,authenticated;

-- Placeholders contain no credentials. Preserve every existing secret unchanged.
do $$ declare n text;begin
 if to_regclass('vault.secrets') is not null and
  (to_regprocedure('vault.create_secret(text,text,text)') is not null or to_regprocedure('vault.create_secret(text,text,text,uuid)') is not null) then
  foreach n in array array['truckcontrol_openai_api_key','truckcontrol_resend_api_key','truckcontrol_resend_webhook_secret'] loop
   if not exists(select 1 from vault.secrets where name=n) then
    perform vault.create_secret('pending',n,'TruckControl only. Configure through Vault; never paste into chat or Git.');
   end if;
  end loop;
  if not exists(select 1 from vault.secrets where name='truckcontrol_mail_ingress_signing_key') then
   perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'truckcontrol_mail_ingress_signing_key','TruckControl receiver HMAC. Independent of Gmail/AES.');
  end if;
 end if;
end $$;

-- Only the service-role backend can retrieve the specifically named credentials.
create function private.tc_provider_runtime_config(p_scope text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s private.tc_provider_settings; result jsonb;begin
 select * into s from private.tc_provider_settings where id=true;
 if p_scope='ai' then
  result:=jsonb_build_object('enabled',s.ai_enabled,'monthly_budget_cents',s.ai_monthly_budget_cents,'model',s.ai_model);
  if to_regclass('vault.decrypted_secrets') is not null then
   result:=result||jsonb_build_object('api_key',(select decrypted_secret from vault.decrypted_secrets where name='truckcontrol_openai_api_key'));
  end if;
 elsif p_scope='mail' then
  result:=jsonb_build_object('enabled',s.receiving_enabled,'domain',s.receiving_domain);
  if to_regclass('vault.decrypted_secrets') is not null then
   select result||jsonb_build_object('api_key',max(decrypted_secret) filter(where name='truckcontrol_resend_api_key'),
    'webhook_secret',max(decrypted_secret) filter(where name='truckcontrol_resend_webhook_secret'),
    'signing_key',max(decrypted_secret) filter(where name='truckcontrol_mail_ingress_signing_key'))
   into result from vault.decrypted_secrets where name in ('truckcontrol_resend_api_key','truckcontrol_resend_webhook_secret','truckcontrol_mail_ingress_signing_key');
  end if;
 else raise exception 'Unknown runtime scope';end if;
 return result;
end $$;
revoke all on function private.tc_provider_runtime_config(text) from public,anon,authenticated;
create function public.company_provider_runtime_config(p_scope text) returns jsonb
language sql stable security invoker set search_path='' as $$select private.tc_provider_runtime_config(p_scope);$$;
revoke all on function public.company_provider_runtime_config(text) from public,anon,authenticated;

-- Reserve a conservative maximum BEFORE every model request. A timeout retains
-- the whole reservation; retrying can never release an unknown provider charge.
create function private.tc_ai_budget_server(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s private.tc_provider_settings; a jsonb; b private.tc_ai_monthly_budget;
 c private.tc_ai_calls; org uuid; actor uuid; invoice uuid; kind text; m date;
 it integer; ot integer; estimate integer; consumed boolean;
begin
 if p_action='reserve' then
  org:=(p_data->>'organization_id')::uuid;actor:=(p_data->>'user_id')::uuid;
  invoice:=nullif(p_data->>'invoice_id','')::uuid;kind:=p_data->>'kind';
  select * into s from private.tc_provider_settings where id=true;
  if not s.ai_enabled or s.ai_monthly_budget_cents<100 or p_data->>'model' is distinct from s.ai_model then return null;end if;
  a:=public.tc_company_server_access(p_org=>org,p_user=>actor);
  if kind not in ('document','invoice') or kind is null or not coalesce((a->>'active')::boolean,false) then return null;end if;
  if kind='document' and (not coalesce((a->'features'->>'assistant')::boolean,false) or not coalesce((a->'features'->>'document_ai')::boolean,false)) then return null;end if;
  if kind='invoice' and (not coalesce((a->>'can_write')::boolean,false) or not coalesce((a->'features'->>'gmail')::boolean,false) or not coalesce((a->'features'->>'invoice_ai')::boolean,false)) then return null;end if;
  if invoice is not null and (kind<>'invoice' or not exists(select 1 from private.invoice_documents where id=invoice and organization_id=org and status='needs_review')
   or exists(select 1 from private.tc_ai_calls where invoice_id=invoice)) then return null;end if;
  m:=date_trunc('month',timezone('UTC',now()))::date;
  insert into private.tc_ai_monthly_budget(month) values(m) on conflict do nothing;
  select * into b from private.tc_ai_monthly_budget where month=m for update;
  -- Do not keep a policy snapshot taken before waiting for another reservation.
  select * into s from private.tc_provider_settings where id=true;
  if not s.ai_enabled or s.ai_monthly_budget_cents<100 or p_data->>'model' is distinct from s.ai_model then return null;end if;
  if b.reserved_micro_usd+b.estimated_micro_usd+1000000>s.ai_monthly_budget_cents::bigint*10000 then return null;end if;
  if kind='document' then consumed:=private.tc_consume_document_ai(org,actor);
  else consumed:=coalesce((private.tc_gmail_invoices('reserve_ai',p_data))::boolean,false);end if;
  if not consumed then return null;end if;
  insert into private.tc_ai_calls(organization_id,user_id,invoice_id,kind,month,model)
   values(org,actor,invoice,kind,m,s.ai_model) returning * into c;
  update private.tc_ai_monthly_budget set reserved_micro_usd=reserved_micro_usd+1000000 where month=m;
  return jsonb_build_object('id',c.id,'reserved_micro_usd',1000000);
 elsif p_action='settle' then
  select * into c from private.tc_ai_calls where id=(p_data->>'id')::uuid for update;
  if not found then raise exception 'Unknown reservation';end if;
  if c.state='settled' then return jsonb_build_object('settled',true);end if;
  it:=(p_data->>'input_tokens')::integer;ot:=(p_data->>'output_tokens')::integer;
  if it is null or ot is null or it<0 or it>1050000 or ot<0 or ot>1200 then raise exception 'Invalid token usage';end if;
  -- Upper estimate includes long-context input/output, cache-write and regional
  -- premiums at documented standard rates (2026-11-01). Never an actual invoice.
  estimate:=((it::bigint*825+ot::bigint*825+999)/1000)::integer;
  if estimate>c.reserved_micro_usd then raise exception 'Usage exceeds reservation';end if;
  update private.tc_ai_monthly_budget set reserved_micro_usd=reserved_micro_usd-c.reserved_micro_usd,
   estimated_micro_usd=estimated_micro_usd+estimate where month=c.month;
  update private.tc_ai_calls set state='settled',input_tokens=it,output_tokens=ot,estimated_micro_usd=estimate where id=c.id;
  return jsonb_build_object('settled',true);
 else raise exception 'Unknown budget action';end if;
end $$;
revoke all on function private.tc_ai_budget_server(text,jsonb) from public,anon,authenticated;
create function public.company_ai_budget_server(p_action text,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.tc_ai_budget_server(p_action,p_data);$$;
revoke all on function public.company_ai_budget_server(text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant select on private.tc_provider_settings to service_role;
 grant select,insert,update on private.tc_ai_monthly_budget,private.tc_ai_calls to service_role;
 create policy provider_settings_server on private.tc_provider_settings for select to service_role using(true);
 create policy ai_monthly_budget_server on private.tc_ai_monthly_budget for all to service_role using(true) with check(true);
 create policy ai_calls_server on private.tc_ai_calls for all to service_role using(true) with check(true);
 grant execute on function private.tc_provider_runtime_config(text),public.company_provider_runtime_config(text),
  private.tc_ai_budget_server(text,jsonb),public.company_ai_budget_server(text,jsonb) to service_role;
end if;end $$;

-- Preserve existing import semantics while allowing the signed provider to
-- check an issued recipient before fetching any message. No mail is enabled.
create or replace function private.tc_company_mail_server(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 v_org uuid; v_user uuid; a jsonb; box private.company_mail_inboxes;
 receipt private.company_mail_receipts; result jsonb; doc jsonb; source text;
begin
 if p_action in ('delivery_begin','delivery_check') then
  select * into box from private.company_mail_inboxes
   where recipient=p_data->>'recipient' and enabled;
  if not found then raise exception 'Buzón no disponible' using errcode='42501';end if;
  v_org:=box.organization_id;v_user:=box.created_by;
 else
  v_org:=(p_data->>'organization_id')::uuid;v_user:=(p_data->>'user_id')::uuid;
 end if;
 a:=public.tc_company_server_access(p_org=>v_org,p_user=>v_user);
 if not coalesce((a->>'active')::boolean,false) or not coalesce((a->'features'->>'gmail')::boolean,false) then
  raise exception 'Empresa o servicio no disponible' using errcode='42501';
 end if;
 if p_action in ('enable_inbox','disable_inbox') and not coalesce((a->>'can_manage')::boolean,false) then
  raise exception 'Requiere administración' using errcode='42501';end if;
 if p_action not in ('get_inbox','enable_inbox','disable_inbox') and not coalesce((a->>'can_write')::boolean,false) then
  raise exception 'Requiere escritura' using errcode='42501';end if;
 -- Serialize this intake's quotas and identities across concurrent deliveries.
 if p_action in ('record_invoice','delivery_begin','enable_inbox') then
  perform 1 from public.organizations where id=v_org for update;
 end if;
 if p_action='delivery_begin' then
  select * into box from private.company_mail_inboxes where organization_id=v_org
   and recipient=p_data->>'recipient' and enabled for update;
  if not found or box.created_by<>v_user then
   raise exception 'Buzón no disponible' using errcode='42501';end if;
 end if;
 case p_action
 when 'delivery_check' then return 'true'::jsonb;
 when 'get_inbox' then
  select jsonb_build_object('recipient',recipient,'enabled',enabled) into result
   from private.company_mail_inboxes where organization_id=v_org;
  return result;
 when 'enable_inbox' then
  select * into box from private.company_mail_inboxes where organization_id=v_org for update;
  if found then
   if split_part(box.recipient,'@',2)<>p_data->>'domain' then
    raise exception 'Cambio de dominio requiere revisión';end if;
   update private.company_mail_inboxes set enabled=true,created_by=v_user where organization_id=v_org;
  else
   if split_part(p_data->>'recipient','@',2)<>p_data->>'domain' or char_length(coalesce(p_data->>'domain',''))<3 then
    raise exception 'Dominio inválido';end if;
   insert into private.company_mail_inboxes(organization_id,recipient,created_by)
    values(v_org,p_data->>'recipient',v_user);
  end if;
  return private.tc_company_mail_server('get_inbox',p_data);
 when 'disable_inbox' then
  update private.company_mail_inboxes set enabled=false where organization_id=v_org;
  return private.tc_company_mail_server('get_inbox',p_data);
 when 'exists' then
  return to_jsonb(exists(select 1 from private.invoice_documents where organization_id=v_org
   and content_hash=p_data->>'content_hash'));
 when 'record_invoice' then
  source:=p_data->>'import_source';
  if source not in ('email_upload','file_upload','forwarded_email') or source is null then
   raise exception 'Origen inválido';end if;
  if source='forwarded_email' and not exists(
   select 1 from private.company_mail_receipts r join private.company_mail_inboxes b
    on b.organization_id=r.organization_id and b.id=r.inbox_id
   where r.organization_id=v_org and r.delivery_id=p_data->>'delivery_id'
    and r.lease_token=(p_data->>'lease_token')::uuid and r.lease_until>now()
    and r.completed_at is null and b.enabled and b.created_by=v_user) then
   raise exception 'Entrega no disponible' using errcode='42501';end if;
  if (select count(*) from private.invoice_documents where organization_id=v_org
    and import_source<>'gmail' and created_at>now()-interval '1 day')>=200 then
   raise exception 'Límite diario de documentos alcanzado';end if;
  if exists(select 1 from private.invoice_documents where organization_id=v_org and content_hash=p_data->>'content_hash') then
   return jsonb_build_object('duplicate',true);end if;
  doc:=p_data->'document';
  if doc->>'object_path'<>(v_org::text||'/'||(doc->>'id')||'/document.'||(case doc->>'content_type'
   when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'invalid' end))
   or not (doc->>'content_type'=any(array['application/pdf','image/jpeg','image/png','image/webp'])) then
   raise exception 'Documento inválido';end if;
  result:=private.tc_gmail_invoices('record_invoice',p_data||jsonb_build_object(
   'supplier','','invoice_number','','invoice_date',null,'net_cents',null,'tax_cents',null,'total_cents',null,
   'currency','EUR','review_note','Importado desde correo o archivo. Completa o verifica los datos con el original antes de registrar el gasto.'));
  update private.invoice_documents set import_source=source where id=(result->>'id')::uuid and organization_id=v_org;
  if source='forwarded_email' then
   update private.company_mail_receipts set imported=imported+1
    where organization_id=v_org and delivery_id=p_data->>'delivery_id'
     and lease_token=(p_data->>'lease_token')::uuid;
  end if;
  return result||jsonb_build_object('import_source',source,'duplicate',false);
 when 'delivery_begin' then
  select * into receipt from private.company_mail_receipts where organization_id=v_org and delivery_id=p_data->>'delivery_id' for update;
  if not found then
   if (select count(*) from private.company_mail_receipts where organization_id=v_org and created_at>now()-interval '1 day')>=200 then
    raise exception 'Límite diario de entregas alcanzado';end if;
   insert into private.company_mail_receipts(organization_id,inbox_id,delivery_id,body_hash)
    values(v_org,box.id,p_data->>'delivery_id',p_data->>'body_hash') on conflict do nothing;
   select * into receipt from private.company_mail_receipts where organization_id=v_org and delivery_id=p_data->>'delivery_id' for update;
  end if;
  if receipt.body_hash<>p_data->>'body_hash' then raise exception 'Identidad de entrega reutilizada';end if;
  if receipt.completed_at is not null then return jsonb_build_object('state','complete','imported',receipt.imported);end if;
  if receipt.lease_until>now() then return jsonb_build_object('state','busy');end if;
  if receipt.attempts>=10 then raise exception 'Límite de reintentos alcanzado';end if;
  update private.company_mail_receipts set lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',attempts=attempts+1
   where organization_id=v_org and delivery_id=p_data->>'delivery_id' returning * into receipt;
  return jsonb_build_object('state','ready','organization_id',v_org,'user_id',v_user,'lease_token',receipt.lease_token);
 when 'delivery_finish' then
  update private.company_mail_receipts set lease_until=null,lease_token=null,
   completed_at=case when p_data->>'succeeded'='true' then now() else null end
   where organization_id=v_org and delivery_id=p_data->>'delivery_id'
    and lease_token=(p_data->>'lease_token')::uuid and completed_at is null;
  if not found then raise exception 'Entrega no disponible' using errcode='42501';end if;
  return '{}'::jsonb;
 else raise exception 'Operación no disponible';
 end case;
end;
$$;

create function private.tc_company_invoice_ai_apply(p_data jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare org uuid:=(p_data->>'organization_id')::uuid;actor uuid:=(p_data->>'user_id')::uuid;
 inv uuid:=(p_data->>'invoice_id')::uuid;a jsonb;f jsonb:=p_data->'fields';
begin
 a:=public.tc_company_server_access(p_org=>org,p_user=>actor);
 if not coalesce((a->>'active')::boolean,false) or not coalesce((a->>'can_write')::boolean,false)
  or not coalesce((a->'features'->>'gmail')::boolean,false) or not coalesce((a->'features'->>'invoice_ai')::boolean,false)
  or not exists(select 1 from private.tc_ai_calls where invoice_id=inv and organization_id=org and user_id=actor and kind='invoice') then return false;end if;
 update private.invoice_documents set supplier=coalesce(f->>'supplier',''),invoice_number=coalesce(f->>'invoice_number',''),
  invoice_date=(f->>'invoice_date')::date,net_cents=(f->>'net_cents')::bigint,tax_cents=(f->>'tax_cents')::bigint,
  total_cents=(f->>'total_cents')::bigint,currency=f->>'currency',review_note=f->>'review_note'
 where id=inv and organization_id=org and status='needs_review' and finance_entry_id is null;
 return found;
end $$;
revoke all on function private.tc_company_invoice_ai_apply(jsonb) from public,anon,authenticated;
create function public.company_invoice_ai_apply(p_data jsonb) returns boolean
language sql security invoker set search_path='' as $$select private.tc_company_invoice_ai_apply(p_data);$$;
revoke all on function public.company_invoice_ai_apply(jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_company_invoice_ai_apply(jsonb),public.company_invoice_ai_apply(jsonb) to service_role;
end if;end $$;

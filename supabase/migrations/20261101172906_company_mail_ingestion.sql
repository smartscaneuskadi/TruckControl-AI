-- Additive intake for any email provider. Existing Gmail tokens, permissions,
-- financial approval and invoice identities remain unchanged.
alter table private.invoice_documents
 add column import_source text not null default 'gmail'
 check (import_source in ('gmail','email_upload','file_upload','forwarded_email'));

create table private.company_mail_inboxes (
 organization_id uuid primary key references public.organizations(id) on delete restrict,
 id uuid not null unique default gen_random_uuid(),
 recipient text not null unique check (char_length(recipient) between 5 and 320 and recipient ~ '^[A-Za-z0-9._+-]+@[a-z0-9.-]+$'),
 created_by uuid not null references auth.users(id) on delete restrict,
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 unique(organization_id,id)
);
create index company_mail_inboxes_actor_idx on private.company_mail_inboxes(created_by);
create table private.company_mail_receipts (
 organization_id uuid not null,
 inbox_id uuid not null,
 delivery_id text not null check (char_length(delivery_id) between 1 and 160 and delivery_id ~ '^[A-Za-z0-9._:-]+$'),
 body_hash text not null check (body_hash ~ '^[a-f0-9]{64}$'),
 lease_token uuid,
 lease_until timestamptz,
 completed_at timestamptz,
 imported integer not null default 0 check(imported between 0 and 5),
 attempts integer not null default 0 check(attempts between 0 and 10),
 created_at timestamptz not null default now(),
 primary key(organization_id,delivery_id),
 foreign key(organization_id,inbox_id) references private.company_mail_inboxes(organization_id,id) on delete restrict
);
create index company_mail_receipts_inbox_idx on private.company_mail_receipts(organization_id,inbox_id);
create index company_mail_receipts_daily_idx on private.company_mail_receipts(organization_id,created_at);
alter table private.company_mail_inboxes enable row level security;
alter table private.company_mail_receipts enable row level security;
revoke all on private.company_mail_inboxes,private.company_mail_receipts from public,anon,authenticated;

-- Internal invoker: no auth claims or secrets are accepted from browser metadata.
-- Caller is the authenticated Edge server; it supplies the verified user ID.
create function private.tc_company_mail_server(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 v_org uuid; v_user uuid; a jsonb; box private.company_mail_inboxes;
 receipt private.company_mail_receipts; result jsonb; doc jsonb; source text;
begin
 if p_action='delivery_begin' then
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
   'currency','EUR','review_note','Importado desde correo o archivo. Completa los datos y revisa el original antes de registrar el gasto. IA desactivada.'));
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
revoke all on function private.tc_company_mail_server(text,jsonb) from public,anon,authenticated;
create function public.company_mail_server(p_action text,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.tc_company_mail_server(p_action,p_data);$$;
revoke all on function public.company_mail_server(text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant select,insert,update on private.company_mail_inboxes,private.company_mail_receipts to service_role;
 create policy company_mail_inboxes_server on private.company_mail_inboxes for all to service_role using(true) with check(true);
 create policy company_mail_receipts_server on private.company_mail_receipts for all to service_role using(true) with check(true);
 grant execute on function private.tc_company_mail_server(text,jsonb),public.company_mail_server(text,jsonb) to service_role;
end if;end $$;

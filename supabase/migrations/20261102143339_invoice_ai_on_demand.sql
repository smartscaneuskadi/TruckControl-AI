-- No new provider, mutable invoice column, budget or payment policy.
-- Only the authenticated Edge backend can call this; every action binds its actor.
create function private.tc_invoice_ai_server(p_action text,p_data jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare o uuid:=(p_data->>'organization_id')::uuid;u uuid:=(p_data->>'user_id')::uuid;
 a jsonb;ids uuid[];v record;can_analyze boolean;
begin
 a:=public.tc_company_server_access(p_org=>o,p_user=>u);
 if not coalesce((a->>'active')::boolean,false) or not coalesce((a->'features'->>'gmail')::boolean,false) then
  raise exception 'Bandeja no autorizada' using errcode='42501';
 end if;
 can_analyze:=coalesce((a->>'can_write')::boolean,false) and coalesce((a->'features'->>'invoice_ai')::boolean,false);
 if p_action='status' then
  if jsonb_typeof(p_data->'invoice_ids') is distinct from 'array' or jsonb_array_length(p_data->'invoice_ids') not between 1 and 200 then raise exception 'Solicitud no valida' using errcode='22023';end if;
  select array_agg(x::uuid) into ids from jsonb_array_elements_text(p_data->'invoice_ids') e(x);
  return coalesce((select jsonb_agg(jsonb_build_object('invoice_id',s.id,'state',s.state,'can_analyze',can_analyze and s.state='available') order by s.id) from (
   select i.id,case when i.status='approved' then 'approved'
    when exists(select 1 from private.tc_ai_calls c where c.invoice_id=i.id and c.organization_id=o) then 'attempted'
    when d.size_bytes>6291456 then 'too_large' else 'available' end state
   from private.invoice_documents i join private.company_documents d on d.id=i.document_id and d.organization_id=i.organization_id
   where i.organization_id=o and i.id=any(ids)
  ) s),'[]'::jsonb);
 elsif p_action='prepare' then
  if not can_analyze then raise exception 'Lectura IA no autorizada' using errcode='42501';end if;
  select i.id,i.status,i.finance_entry_id,i.content_hash,d.id document_id,d.object_path,d.name,d.content_type,d.size_bytes into v
   from private.invoice_documents i join private.company_documents d on d.id=i.document_id and d.organization_id=i.organization_id
   where i.organization_id=o and i.id=(p_data->>'invoice_id')::uuid;
  if not found then return null;end if;
  if v.status='approved' or v.finance_entry_id is not null then return jsonb_build_object('state','approved');end if;
  if exists(select 1 from private.tc_ai_calls where invoice_id=v.id and organization_id=o) then return jsonb_build_object('state','attempted');end if;
  if v.size_bytes>6291456 then return jsonb_build_object('state','too_large');end if;
  return jsonb_build_object('state','available','invoice_id',v.id,'content_hash',v.content_hash,
   'document',jsonb_build_object('id',v.document_id,'object_path',v.object_path,'name',v.name,'content_type',v.content_type,'size_bytes',v.size_bytes));
 else raise exception 'Operacion no disponible' using errcode='22023';end if;
end;$$;
revoke all on function private.tc_invoice_ai_server(text,jsonb) from public,anon,authenticated;
create function public.company_invoice_ai_server(p_action text,p_data jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$select private.tc_invoice_ai_server(p_action,p_data);$$;
revoke all on function public.company_invoice_ai_server(text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_invoice_ai_server(text,jsonb),public.company_invoice_ai_server(text,jsonb) to service_role;
end if;end $$;

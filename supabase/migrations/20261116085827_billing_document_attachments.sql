-- Candidate76: documentary classifications and links, never accounting emission.
-- Preserve every original, legacy client contracts, tenant gates and SQL75.
alter table public.finance_entries add column document_type text
 check(document_type in ('invoice','ticket','delivery_note'));
grant insert(document_type),update(document_type) on public.finance_entries to authenticated;

-- A link follows its entry's current kind. A writer may not turn a hidden
-- expense into an allowed income (or reverse) to reveal its original files.
-- Keep legitimate reclassification available when both modules are authorized.
create function private.tc_finance_kind_transition_gate()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='authenticated' and new.kind is distinct from old.kind and not(
  private.tc_can_write_company(old.organization_id) and private.tc_can_write_company(new.organization_id)
  and private.tc_feature(old.organization_id,case when old.kind='income' then 'income' else 'expenses' end)
  and private.tc_feature(new.organization_id,case when new.kind='income' then 'income' else 'expenses' end)) then
  raise exception 'No puedes cambiar el tipo de un movimiento sin acceso a ambos módulos' using errcode='42501';
 end if;
 return new;
end;$$;
revoke all on function private.tc_finance_kind_transition_gate() from public,anon,authenticated;
create trigger tc_finance_kind_transition before update of kind on public.finance_entries
 for each row execute function private.tc_finance_kind_transition_gate();

alter table private.tc_document_details drop constraint tc_document_details_category_check;
alter table private.tc_document_details add constraint tc_document_details_category_check
 check(category in ('insurance','inspection','permit','invoice','maintenance','contract','other',
  'technical_card','identity','driving_license','ticket','delivery_note'));
alter table private.tc_document_details add column label text
 check(label is null or (label=btrim(label) and char_length(label) between 1 and 160));
alter table private.tc_document_details add column finance_entry_id uuid;
alter table private.tc_document_details add constraint tc_document_details_finance_entry_fk
 foreign key(organization_id,finance_entry_id) references public.finance_entries(organization_id,id)
 on delete set null(finance_entry_id);
create index tc_document_details_finance_idx on private.tc_document_details(organization_id,finance_entry_id)
 where finance_entry_id is not null;
grant insert(label,finance_entry_id),update(label,finance_entry_id) on private.tc_document_details to authenticated;

-- Internal explicit-user filter for trusted existing service adapters. No client
-- can select an actor. Policy calls instead use the bound-current-user wrapper.
create function private.tc_document_visible_for(p_org uuid,p_document uuid,p_user uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare a jsonb;f jsonb;entry uuid;entry_kind text;
begin
 a:=private.tc_organization_access_for(p_org,p_user);f:=a->'features';
 if not coalesce((a->>'active')::boolean,false) then return false;end if;
 select t.finance_entry_id into entry from private.company_documents d
 left join private.tc_document_details t on t.organization_id=d.organization_id and t.document_id=d.id
 where d.organization_id=p_org and d.id=p_document;
 if not found then return false;end if;
 -- Gmail-only keeps access to its invoice originals, never the general library.
 if not coalesce((f->>'documents')::boolean,false) and not
  (coalesce((f->>'gmail')::boolean,false) and exists(select 1 from private.invoice_documents i
    where i.organization_id=p_org and i.document_id=p_document)) then return false;end if;
 if entry is null then return true;end if;
 select e.kind into entry_kind from public.finance_entries e where e.organization_id=p_org and e.id=entry;
 return found and coalesce((f->>'documents')::boolean,false) and
  coalesce((f->>case when entry_kind='income' then 'income' else 'expenses' end)::boolean,false);
end;$$;
revoke all on function private.tc_document_visible_for(uuid,uuid,uuid) from public,anon,authenticated;

create function private.tc_document_finance_filter(p_org uuid,p_document uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and private.tc_document_visible_for(p_org,p_document,(select auth.uid()));
$$;
revoke all on function private.tc_document_finance_filter(uuid,uuid) from public,anon,authenticated;
grant execute on function private.tc_document_finance_filter(uuid,uuid) to authenticated;
-- This additional filter does not replace any existing subscription/role/Gmail
-- boundary. Storage's existing registered-original EXISTS also observes it.
create policy tc_documents_finance_read on private.company_documents as restrictive for select to authenticated
 using(private.tc_document_finance_filter(organization_id,id));
alter policy tc_document_details_insert on private.tc_document_details with check(
 private.tc_feature(organization_id,'documents') and private.tc_can_write_company(organization_id)
 and exists(select 1 from private.company_documents d where d.organization_id=tc_document_details.organization_id and d.id=tc_document_details.document_id)
 and (finance_entry_id is null or exists(select 1 from public.finance_entries e
  where e.organization_id=tc_document_details.organization_id and e.id=tc_document_details.finance_entry_id
   and private.tc_feature(e.organization_id,case when e.kind='income' then 'income' else 'expenses' end))));
alter policy tc_document_details_update on private.tc_document_details
 using(private.tc_feature(organization_id,'documents') and private.tc_can_write_company(organization_id)
  and private.tc_document_finance_filter(organization_id,document_id))
 with check(private.tc_feature(organization_id,'documents') and private.tc_can_write_company(organization_id)
 and exists(select 1 from private.company_documents d where d.organization_id=tc_document_details.organization_id and d.id=tc_document_details.document_id)
 and (finance_entry_id is null or exists(select 1 from public.finance_entries e
  where e.organization_id=tc_document_details.organization_id and e.id=tc_document_details.finance_entry_id
   and private.tc_feature(e.organization_id,case when e.kind='income' then 'income' else 'expenses' end))));

-- Check optional mixed parent links only when creating/changing a link. Later
-- legitimate truck/driver assignments never rewrite or lock an original file.
create function private.tc_document_finance_integrity()
returns trigger language plpgsql security definer set search_path='' as $$
declare doc private.company_documents;truck uuid;entry_kind text;
begin
 if new.finance_entry_id is null then return new;end if;
 if tg_op='UPDATE' and new.finance_entry_id is not distinct from old.finance_entry_id then return new;end if;
 select * into doc from private.company_documents where organization_id=new.organization_id and id=new.document_id;
 select truck_id,kind into truck,entry_kind from public.finance_entries where organization_id=new.organization_id and id=new.finance_entry_id for share;
 if not found then raise exception 'Movimiento no disponible en esta empresa' using errcode='23503';end if;
 -- Check authorization before any detailed parent mismatch. Trusted background
 -- writes have no human UID and keep their existing guarded service boundary.
 if (select auth.uid()) is not null and not(private.tc_can_write_company(new.organization_id)
  and private.tc_feature(new.organization_id,'documents')
  and private.tc_feature(new.organization_id,case when entry_kind='income' then 'income' else 'expenses' end)) then
  raise exception 'Vínculo financiero no autorizado' using errcode='42501';end if;
 if doc.truck_id is not null and doc.truck_id<>truck then
  raise exception 'El documento y el movimiento pertenecen a camiones distintos' using errcode='23514';end if;
 if doc.driver_id is not null and not exists(select 1 from public.trucks t where t.organization_id=new.organization_id and t.id=truck
  and (t.driver_id=doc.driver_id or t.co_driver_id=doc.driver_id)) then
  raise exception 'El conductor no está asignado al camión del movimiento' using errcode='23514';end if;
 return new;
end;$$;
revoke all on function private.tc_document_finance_integrity() from public,anon,authenticated;
create trigger tc_document_finance_integrity before insert or update of finance_entry_id on private.tc_document_details
 for each row execute function private.tc_document_finance_integrity();

-- Projection is deliberately versioned: Sites47 has strict seven-category
-- tracking schemas. Its readers must never receive unknown optional keys.
create function private.tc_document_tracking_payload(p_row private.tc_document_details,p_legacy boolean)
returns jsonb language sql stable security invoker set search_path='' as $$
 select case when p_row.document_id is null then jsonb_build_object(
  'category','other','status','active','expires_on',null,'remind_days',30,'row_version',0,'updated_at',null)
 else (to_jsonb(p_row)-'organization_id'-'document_id'-'label'-'finance_entry_id') ||
 case when p_legacy then jsonb_build_object('category',case when p_row.category in
  ('insurance','inspection','permit','invoice','maintenance','contract','other') then p_row.category else 'other' end)
 else jsonb_strip_nulls(jsonb_build_object('label',p_row.label,'finance_entry_id',p_row.finance_entry_id)) end end;
$$;
revoke all on function private.tc_document_tracking_payload(private.tc_document_details,boolean) from public,anon,authenticated;
grant execute on function private.tc_document_tracking_payload(private.tc_document_details,boolean) to authenticated;

create function private.tc_write_document_metadata(p_org uuid,p_document uuid,p_data jsonb,p_expected bigint,p_legacy boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v private.tc_document_details;v_date date;v_days integer;v_label text;v_finance uuid;
begin
 if (select auth.uid()) is null or not coalesce(private.tc_feature(p_org,'documents'),false)
  or not coalesce(private.tc_can_write_company(p_org),false) then raise exception 'Archivo no autorizado' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or not(p_data ?& array['category','status','expires_on','remind_days'])
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('category','status','expires_on','remind_days','label','finance_entry_id')
    or (p_legacy and k in ('label','finance_entry_id')))
  or jsonb_typeof(p_data->'category') is distinct from 'string'
  or p_data->>'category' not in ('insurance','inspection','permit','invoice','maintenance','contract','other',
    'technical_card','identity','driving_license','ticket','delivery_note')
  or (p_legacy and p_data->>'category' not in ('insurance','inspection','permit','invoice','maintenance','contract','other'))
  or jsonb_typeof(p_data->'status') is distinct from 'string' or p_data->>'status' not in ('active','archived')
  or jsonb_typeof(p_data->'remind_days') is distinct from 'number' or (p_data->>'remind_days') !~ '^(0|[1-9][0-9]{0,2})$'
  or p_expected is null or p_expected<0 then raise exception 'Metadatos no validos' using errcode='22023';end if;
 v_days:=(p_data->>'remind_days')::integer;
 if v_days>365 then raise exception 'Aviso no valido' using errcode='22023';end if;
 if p_data->>'expires_on' is not null then
  if jsonb_typeof(p_data->'expires_on')<>'string' or (p_data->>'expires_on') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}$' then raise exception 'Fecha no valida' using errcode='22023';end if;
  v_date:=(p_data->>'expires_on')::date;
 end if;
 if p_data ? 'label' then
  if jsonb_typeof(p_data->'label') is distinct from 'string' or char_length(p_data->>'label')>160 then raise exception 'Descripción no valida' using errcode='22023';end if;
  v_label:=nullif(btrim(p_data->>'label'),'');
 end if;
 if p_data ? 'finance_entry_id' then
  if jsonb_typeof(p_data->'finance_entry_id') not in ('string','null') then raise exception 'Movimiento no valido' using errcode='22023';end if;
  v_finance:=(p_data->>'finance_entry_id')::uuid;
 end if;
 if not exists(select 1 from private.company_documents where organization_id=p_org and id=p_document) then raise exception 'Documento no disponible' using errcode='42501';end if;
 insert into private.tc_document_details(organization_id,document_id,category,status,expires_on,remind_days,label,finance_entry_id)
  values(p_org,p_document,p_data->>'category',p_data->>'status',v_date,v_days,v_label,v_finance)
  on conflict(organization_id,document_id) do nothing returning * into v;
 if found then
  if p_expected<>0 then raise exception 'La ficha ha cambiado; actualiza antes de guardar' using errcode='40001';end if;
 else
  select * into v from private.tc_document_details where organization_id=p_org and document_id=p_document for update;
  if not found or v.row_version<>p_expected then raise exception 'La ficha ha cambiado; actualiza antes de guardar' using errcode='40001';end if;
  update private.tc_document_details set category=case when p_legacy and p_data->>'category'='other'
    and v.category not in ('insurance','inspection','permit','invoice','maintenance','contract','other') then v.category else p_data->>'category' end,
   status=p_data->>'status',expires_on=v_date,remind_days=v_days,
   label=case when p_data ? 'label' then v_label else v.label end,
   finance_entry_id=case when p_data ? 'finance_entry_id' then v_finance else v.finance_entry_id end
   where organization_id=p_org and document_id=p_document returning * into v;
 end if;
 return private.tc_document_tracking_payload(v,p_legacy);
end;$$;
revoke all on function private.tc_write_document_metadata(uuid,uuid,jsonb,bigint,boolean) from public,anon,authenticated;
grant execute on function private.tc_write_document_metadata(uuid,uuid,jsonb,bigint,boolean) to authenticated;

create or replace function public.tc_update_document_metadata(p_org uuid,p_document uuid,p_data jsonb,p_expected bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select private.tc_write_document_metadata(p_org,p_document,p_data,p_expected,true);
$$;
create function public.tc_update_document_metadata_v2(p_org uuid,p_document uuid,p_data jsonb,p_expected bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select private.tc_write_document_metadata(p_org,p_document,p_data,p_expected,false);
$$;
revoke all on function public.tc_update_document_metadata_v2(uuid,uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.tc_update_document_metadata_v2(uuid,uuid,jsonb,bigint) to authenticated;

create or replace function public.tc_document_page(p_org uuid,p_after uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if (select auth.uid()) is null or not coalesce(private.tc_feature(p_org,'documents'),false) then raise exception 'Archivo no autorizado' using errcode='42501';end if;
 return coalesce((select jsonb_agg(v.value order by v.id) from (
  select b.id,to_jsonb(b)||jsonb_build_object('tracking',private.tc_document_tracking_payload(t,true)) value
  from private.company_documents b left join private.tc_document_details t on t.organization_id=b.organization_id and t.document_id=b.id
  where b.organization_id=p_org and (p_after is null or b.id>p_after) order by b.id limit 200
 ) v),'[]'::jsonb);
end;$$;
create function public.tc_document_page_v2(p_org uuid,p_after uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if (select auth.uid()) is null or not coalesce(private.tc_feature(p_org,'documents'),false) then raise exception 'Archivo no autorizado' using errcode='42501';end if;
 return coalesce((select jsonb_agg(v.value order by v.id) from (
  select b.id,to_jsonb(b)||jsonb_build_object('tracking',private.tc_document_tracking_payload(t,false)) value
  from private.company_documents b left join private.tc_document_details t on t.organization_id=b.organization_id and t.document_id=b.id
  where b.organization_id=p_org and (p_after is null or b.id>p_after) order by b.id limit 200
 ) v),'[]'::jsonb);
end;$$;
revoke all on function public.tc_document_page_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tc_document_page_v2(uuid,uuid) to authenticated;

create function public.tc_register_document_v2(p_org uuid,p_document jsonb,p_tracking jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 if (select auth.uid()) is null or not coalesce(private.tc_feature(p_org,'documents'),false) or not coalesce(private.tc_can_write_company(p_org),false) then raise exception 'Archivo no autorizado' using errcode='42501';end if;
 v_id:=public.register_company_document(p_org,p_document);
 perform public.tc_update_document_metadata_v2(p_org,v_id,p_tracking,0);
 return v_id;
end;$$;
revoke all on function public.tc_register_document_v2(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.tc_register_document_v2(uuid,jsonb,jsonb) to authenticated;

create or replace function public.tc_backup_page_v2(p_org uuid,p_kind text,p_after uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v jsonb;
begin
 v:=public.tc_backup_page(p_org,p_kind,p_after);
 if p_kind<>'documents' or not private.tc_feature(p_org,'documents') then return v;end if;
 return coalesce((select jsonb_agg(b.value||case when t.document_id is null then '{}'::jsonb
   else jsonb_build_object('tracking',private.tc_document_tracking_payload(t,true)) end order by b.value->>'id')
  from jsonb_array_elements(v) b(value) left join private.tc_document_details t on t.organization_id=p_org and t.document_id=(b.value->>'id')::uuid),'[]'::jsonb);
end;$$;
create function public.tc_backup_page_v3(p_org uuid,p_kind text,p_after uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v jsonb;
begin
 v:=public.tc_backup_page(p_org,p_kind,p_after);
 if p_kind<>'documents' or not private.tc_feature(p_org,'documents') then return v;end if;
 return coalesce((select jsonb_agg(b.value||case when t.document_id is null then '{}'::jsonb
   else jsonb_build_object('tracking',private.tc_document_tracking_payload(t,false)) end order by b.value->>'id')
  from jsonb_array_elements(v) b(value) left join private.tc_document_details t on t.organization_id=p_org and t.document_id=(b.value->>'id')::uuid),'[]'::jsonb);
end;$$;
revoke all on function public.tc_backup_page_v3(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.tc_backup_page_v3(uuid,text,uuid) to authenticated;

-- A saved model answer may contain uncited document text. Revalidate its entire
-- document context before finish/replay/result; never just remove a citation.
create function private.tc_document_context_visible(p_org uuid,p_user uuid,p_context jsonb,p_sources jsonb default '[]')
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from (
  select value->>'id' id from jsonb_array_elements(coalesce(p_context->'documents','[]'))
  union all select value->>'id' from jsonb_array_elements(coalesce(p_context->'catalog','[]')) where value->>'kind'='document'
  union all select value->>'id' from jsonb_array_elements(coalesce(p_sources,'[]')) where value->>'kind'='document'
 ) d where d.id is null or not private.tc_document_visible_for(p_org,d.id::uuid,p_user));
$$;
revoke all on function private.tc_document_context_visible(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;

-- Exact fixed fragments of existing private adapters, not arbitrary dynamic
-- input. Fail closed if a controller has changed unexpectedly. CREATE OR
-- REPLACE keeps its OID, ACL, quotas, existing actor gate and all other logic.
do $adapters$
declare body text;old_text text;new_text text;
begin
 body:=pg_get_functiondef('private.tc_company_specialists(uuid,text,jsonb)'::regprocedure);
 old_text:=$old$'partial',(select count(*)>50 from private.company_documents where organization_id=p_org)$old$;
 new_text:=$new$'partial',(select count(*)>50 from private.company_documents where organization_id=p_org and private.tc_document_visible_for(p_org,id,actor))$new$;
 if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected specialists document count source';end if;
 body:=replace(body,old_text,new_text);
 old_text:=$old$from private.company_documents where organization_id=p_org order by created_at desc,id limit 50$old$;
 new_text:=$new$from private.company_documents where organization_id=p_org and private.tc_document_visible_for(p_org,id,actor) order by created_at desc,id limit 50$new$;
 if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected specialists document list source';end if;
 body:=replace(body,old_text,new_text);
 old_text:=$old$from private.company_documents where organization_id=p_org and id=any(ids) order by id loop$old$;
 new_text:=$new$from private.company_documents where organization_id=p_org and id=any(ids) and private.tc_document_visible_for(p_org,id,actor) order by id loop$new$;
 if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected specialists preparation source';end if;
 execute replace(body,old_text,new_text);

 body:=pg_get_functiondef('private.tc_specialist_result(uuid,uuid,uuid)'::regprocedure);
 old_text:=$old$ base:=private.tc_copilot_result(p_org,p_user,p_id);$old$;
 new_text:=$new$ if not private.tc_document_context_visible(p_org,p_user,t.context,t.sources) then raise exception 'Documentos del turno ya no autorizados' using errcode='42501';end if;
 base:=private.tc_copilot_result(p_org,p_user,p_id);$new$;
 if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected specialist result source';end if;
 execute replace(body,old_text,new_text);

 body:=pg_get_functiondef('private.tc_specialists_server(uuid,uuid,text,jsonb)'::regprocedure);
 old_text:=$old$  for item in select value from jsonb_array_elements(p_data->'context'->'catalog') loop$old$;
 new_text:=$new$  if not private.tc_document_context_visible(p_org,p_user,p_data->'context') then raise exception 'Documentos del turno no autorizados' using errcode='42501';end if;
  for item in select value from jsonb_array_elements(p_data->'context'->'catalog') loop$new$;
 if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected specialist begin source';end if;
 body:=replace(body,old_text,new_text);
 old_text:=$old$where organization_id=p_org and id=(item->>'id')::uuid) then raise exception 'Documento no autorizado'$old$;
 new_text:=$new$where organization_id=p_org and id=(item->>'id')::uuid and private.tc_document_visible_for(p_org,id,p_user)) then raise exception 'Documento no autorizado'$new$;
 if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected specialist source validation';end if;
 body:=replace(body,old_text,new_text);
 old_text:=$old$ if exists(select 1 from private.tc_copilot_turns where organization_id=p_org and user_id=p_user and id=t.id and state<>'pending')$old$;
 new_text:=$new$ if not private.tc_document_context_visible(p_org,p_user,t.context,t.sources) then raise exception 'Documentos del turno ya no autorizados' using errcode='42501';end if;
 if exists(select 1 from private.tc_copilot_turns where organization_id=p_org and user_id=p_user and id=t.id and state<>'pending')$new$;
 if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected specialist finish/replay source';end if;
 execute replace(body,old_text,new_text);

 body:=pg_get_functiondef('private.tc_invoice_ai_server(text,jsonb)'::regprocedure);
 old_text:=$old$where i.organization_id=o and i.id=any(ids)$old$;
 new_text:=$new$where i.organization_id=o and i.id=any(ids) and private.tc_document_visible_for(o,d.id,u)$new$;
 if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected invoice AI status source';end if;
 body:=replace(body,old_text,new_text);
 old_text:=$old$where i.organization_id=o and i.id=(p_data->>'invoice_id')::uuid;$old$;
 new_text:=$new$where i.organization_id=o and i.id=(p_data->>'invoice_id')::uuid and private.tc_document_visible_for(o,d.id,u);$new$;
 if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected invoice AI preparation source';end if;
 execute replace(body,old_text,new_text);
end;$adapters$;

do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function private.tc_document_visible_for(uuid,uuid,uuid) to service_role;
 end if;
end $$;

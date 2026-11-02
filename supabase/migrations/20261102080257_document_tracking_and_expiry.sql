-- Separate metadata preserves every original and all v14 RPC/backup contracts.
create table private.tc_document_details (
 organization_id uuid not null,
 document_id uuid not null,
 category text not null default 'other' check(category in ('insurance','inspection','permit','invoice','maintenance','contract','other')),
 status text not null default 'active' check(status in ('active','archived')),
 expires_on date,
 remind_days integer not null default 30 check(remind_days between 0 and 365),
 row_version bigint not null default 1 check(row_version>=1),
 updated_at timestamptz not null default now(),
 primary key(organization_id,document_id),
 foreign key(organization_id,document_id) references private.company_documents(organization_id,id) on delete restrict
);
create index tc_document_details_expiry_idx on private.tc_document_details(organization_id,expires_on) where status='active' and expires_on is not null;
alter table private.tc_document_details enable row level security;
revoke all on private.tc_document_details from public,anon,authenticated;
grant select on private.tc_document_details to authenticated;
grant insert(organization_id,document_id,category,status,expires_on,remind_days) on private.tc_document_details to authenticated;
grant update(category,status,expires_on,remind_days) on private.tc_document_details to authenticated;
create policy tc_document_details_read on private.tc_document_details for select to authenticated
 using(private.tc_feature(organization_id,'documents') and exists(select 1 from private.company_documents d where d.organization_id=tc_document_details.organization_id and d.id=tc_document_details.document_id));
create policy tc_document_details_insert on private.tc_document_details for insert to authenticated
 with check(private.tc_feature(organization_id,'documents') and private.tc_can_write_company(organization_id) and exists(select 1 from private.company_documents d where d.organization_id=tc_document_details.organization_id and d.id=tc_document_details.document_id));
create policy tc_document_details_update on private.tc_document_details for update to authenticated
 using(private.tc_feature(organization_id,'documents') and private.tc_can_write_company(organization_id))
 with check(private.tc_feature(organization_id,'documents') and private.tc_can_write_company(organization_id) and exists(select 1 from private.company_documents d where d.organization_id=tc_document_details.organization_id and d.id=tc_document_details.document_id));

create function private.tc_document_details_version() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.organization_id,new.document_id) is distinct from (old.organization_id,old.document_id) then raise exception 'Documento inmutable' using errcode='42501'; end if;
 new.row_version:=old.row_version+1;new.updated_at:=clock_timestamp();return new;
end;$$;
revoke all on function private.tc_document_details_version() from public,anon,authenticated;
create trigger tc_document_details_version before update on private.tc_document_details for each row execute function private.tc_document_details_version();

create function public.tc_update_document_metadata(p_org uuid,p_document uuid,p_data jsonb,p_expected bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v private.tc_document_details%rowtype;v_date date;v_days integer;
begin
 if (select auth.uid()) is null or not coalesce(private.tc_feature(p_org,'documents'),false) or not coalesce(private.tc_can_write_company(p_org),false) then
  raise exception 'Archivo no autorizado' using errcode='42501'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or not(p_data ?& array['category','status','expires_on','remind_days'])
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('category','status','expires_on','remind_days'))
  or jsonb_typeof(p_data->'category') is distinct from 'string' or p_data->>'category' not in ('insurance','inspection','permit','invoice','maintenance','contract','other')
  or jsonb_typeof(p_data->'status') is distinct from 'string' or p_data->>'status' not in ('active','archived')
  or jsonb_typeof(p_data->'remind_days') is distinct from 'number' or (p_data->>'remind_days') !~ '^(0|[1-9][0-9]{0,2})$'
  or p_expected is null or p_expected<0 then raise exception 'Metadatos no validos' using errcode='22023';end if;
 v_days:=(p_data->>'remind_days')::integer;
 if v_days>365 then raise exception 'Aviso no valido' using errcode='22023';end if;
 if p_data->>'expires_on' is not null then
  if jsonb_typeof(p_data->'expires_on')<>'string' or (p_data->>'expires_on') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}$' then raise exception 'Fecha no valida' using errcode='22023';end if;
  v_date:=(p_data->>'expires_on')::date;
 end if;
 if not exists(select 1 from private.company_documents where organization_id=p_org and id=p_document) then raise exception 'Documento no disponible' using errcode='42501';end if;
 -- A unique insert serializes first-time edits without UPDATE grants on originals.
 insert into private.tc_document_details(organization_id,document_id,category,status,expires_on,remind_days)
  values(p_org,p_document,p_data->>'category',p_data->>'status',v_date,v_days)
  on conflict(organization_id,document_id) do nothing returning * into v;
 if found then
  if p_expected<>0 then raise exception 'La ficha ha cambiado; actualiza antes de guardar' using errcode='40001';end if;
 else
  select * into v from private.tc_document_details where organization_id=p_org and document_id=p_document for update;
  if not found or v.row_version<>p_expected then raise exception 'La ficha ha cambiado; actualiza antes de guardar' using errcode='40001';end if;
  update private.tc_document_details set category=p_data->>'category',status=p_data->>'status',expires_on=v_date,remind_days=v_days
   where organization_id=p_org and document_id=p_document returning * into v;
 end if;
 return to_jsonb(v)-'organization_id'-'document_id';
end;$$;

create function public.tc_document_page(p_org uuid,p_after uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if (select auth.uid()) is null or not coalesce(private.tc_feature(p_org,'documents'),false) then raise exception 'Archivo no autorizado' using errcode='42501';end if;
 return coalesce((select jsonb_agg(v.value order by v.id) from (
  select b.id,to_jsonb(b)||jsonb_build_object('tracking',coalesce(to_jsonb(t)-'organization_id'-'document_id',jsonb_build_object('category','other','status','active','expires_on',null,'remind_days',30,'row_version',0,'updated_at',null))) value
  from private.company_documents b left join private.tc_document_details t on t.organization_id=b.organization_id and t.document_id=b.id
  where b.organization_id=p_org and (p_after is null or b.id>p_after) order by b.id limit 200
 ) v),'[]'::jsonb);
end;$$;

create function public.tc_register_document(p_org uuid,p_document jsonb,p_tracking jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 if (select auth.uid()) is null or not coalesce(private.tc_feature(p_org,'documents'),false) or not coalesce(private.tc_can_write_company(p_org),false) then raise exception 'Archivo no autorizado' using errcode='42501';end if;
 v_id:=public.register_company_document(p_org,p_document);
 perform public.tc_update_document_metadata(p_org,v_id,p_tracking,0);
 return v_id;
end;$$;

-- New clients request enriched backups; the original RPC is unchanged for v14.
create function public.tc_backup_page_v2(p_org uuid,p_kind text,p_after uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v jsonb;
begin
 v:=public.tc_backup_page(p_org,p_kind,p_after);
 if p_kind<>'documents' or not private.tc_feature(p_org,'documents') then return v;end if;
 return coalesce((select jsonb_agg(b.value||case when t.document_id is null then '{}'::jsonb else jsonb_build_object('tracking',to_jsonb(t)-'organization_id'-'document_id') end order by b.value->>'id')
  from jsonb_array_elements(v) b(value) left join private.tc_document_details t on t.organization_id=p_org and t.document_id=(b.value->>'id')::uuid),'[]'::jsonb);
end;$$;
revoke all on function public.tc_update_document_metadata(uuid,uuid,jsonb,bigint),public.tc_document_page(uuid,uuid),public.tc_register_document(uuid,jsonb,jsonb),public.tc_backup_page_v2(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.tc_update_document_metadata(uuid,uuid,jsonb,bigint),public.tc_document_page(uuid,uuid),public.tc_register_document(uuid,jsonb,jsonb),public.tc_backup_page_v2(uuid,text,uuid) to authenticated;

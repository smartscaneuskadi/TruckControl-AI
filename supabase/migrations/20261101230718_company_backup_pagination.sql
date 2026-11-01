-- Read-only pagination for company recovery packages. Existing table/storage RLS remains authoritative.
create index invoice_documents_backup_cursor_idx on private.invoice_documents(organization_id,id);
create function public.tc_backup_page(p_org uuid,p_kind text,p_after uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if (select auth.uid()) is null or not coalesce(private.tc_account_active(p_org),false)
  or coalesce(private.tc_company_role(p_org),'') not in ('owner','admin') then
  raise exception 'Solo la administración de una empresa activa puede preparar su copia' using errcode='42501';
 end if;
 if p_kind='documents' then
  if not (private.tc_feature(p_org,'documents') or private.tc_feature(p_org,'gmail')) then
   raise exception 'Archivo no autorizado' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from (
   select id,organization_id,name,object_path,content_type,size_bytes,truck_id,driver_id,created_at
   from private.company_documents where organization_id=p_org and (p_after is null or id>p_after)
   order by id limit 200) d),'[]'::jsonb);
 elsif p_kind='invoices' then
  if not private.tc_feature(p_org,'gmail') then
   raise exception 'Facturas de correo no autorizadas' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from (
   select id,organization_id,message_id,attachment_id,content_hash,document_id,supplier,invoice_number,
    invoice_date,net_cents,tax_cents,total_cents,currency,status,review_note,finance_entry_id,created_at,import_source
   from private.invoice_documents where organization_id=p_org and (p_after is null or id>p_after)
   order by id limit 200) i),'[]'::jsonb);
 else
  raise exception 'Colección de copia no válida' using errcode='22023';
 end if;
end;
$$;
revoke all on function public.tc_backup_page(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.tc_backup_page(uuid,text,uuid) to authenticated;

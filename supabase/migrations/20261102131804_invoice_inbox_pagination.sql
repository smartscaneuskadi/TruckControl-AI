-- Preserve the original 200-row RPC for older applications. No invoice is changed.
create index invoices_org_id_page_idx on private.invoice_documents(organization_id,id);

create function public.tc_invoice_page(p_org uuid,p_after uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if (select auth.uid()) is null or not coalesce(private.tc_feature(p_org,'gmail'),false) then
  raise exception 'Bandeja no autorizada' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from (
  select i.* from private.invoice_documents i
  where i.organization_id=p_org and (p_after is null or i.id>p_after)
  order by i.id limit 200
 ) v),'[]'::jsonb);
end;$$;
revoke all on function public.tc_invoice_page(uuid,uuid) from public,anon,authenticated;
grant execute on function public.tc_invoice_page(uuid,uuid) to authenticated;

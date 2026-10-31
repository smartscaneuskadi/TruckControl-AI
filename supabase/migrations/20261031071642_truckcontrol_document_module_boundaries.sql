-- Gmail access authorizes invoice attachments, not the company's entire archive.
-- Keep subscription, role and tenant RLS checks in force for both metadata and files.
alter policy tc_documents_active on private.company_documents
 using (
  private.tc_feature(organization_id,'documents') or (
   private.tc_feature(organization_id,'gmail') and exists (
    select 1 from private.invoice_documents i
    where i.organization_id=company_documents.organization_id
      and i.document_id=company_documents.id
   )
  )
 )
 with check (private.tc_feature(organization_id,'documents'));

do $$ begin
 if to_regclass('storage.objects') is not null then
  execute $policy$alter policy tc_documents_subscription_read on storage.objects
   using (bucket_id<>'truckcontrol-documents' or exists (
    select 1 from private.company_documents d
    where d.object_path=objects.name
   ))$policy$;
 end if;
end $$;

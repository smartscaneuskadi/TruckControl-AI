-- Financial source links are created only by reviewed booking operations.
-- Preserve every existing business column used by the React repository.
revoke insert,update on public.finance_entries from authenticated;
grant insert(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km,created_at,row_version) on public.finance_entries to authenticated;
grant update(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km,created_at,row_version) on public.finance_entries to authenticated;

-- Additive commercial records. Existing accounting values and v32 APIs stay unchanged.
create function private.tc_commercial_access(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());sid text;a jsonb;
begin
 if actor is null or not exists(select 1 from auth.users u where u.id=actor and nullif(to_jsonb(u)->>'email_confirmed_at','') is not null and to_jsonb(u)->>'deleted_at' is null and coalesce(nullif(to_jsonb(u)->>'banned_until','')::timestamptz,'-infinity'::timestamptz)<=now()) then raise exception 'Cuenta no disponible' using errcode='42501';end if;
 sid:=nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id';
 if sid is not null then
  if to_regclass('auth.sessions') is null then raise exception 'Sesion no disponible' using errcode='42501';end if;
  if not exists(select 1 from auth.sessions s where s.id::text=sid and s.user_id=actor) then raise exception 'Sesion revocada' using errcode='42501';end if;
 end if;
 if private.tc_company_role_for(p_org,actor) is null then raise exception 'Empresa no disponible' using errcode='42501';end if;
 a:=private.tc_organization_access_for(p_org,actor);
 if not coalesce((a->>'active')::boolean,false) then raise exception 'Cuenta no activa' using errcode='42501';end if;
 return a;
end;$$;
revoke all on function private.tc_commercial_access(uuid) from public,anon,authenticated;

create table private.company_suppliers(
 organization_id uuid not null references public.organizations(id) on delete restrict,id uuid not null,
 name text not null check(char_length(btrim(name)) between 1 and 160),tax_id text not null check(char_length(btrim(tax_id)) between 1 and 30),
 email text not null default '' check(char_length(email)<=254 and (email='' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 phone text not null default '' check(char_length(phone)<=30),address text not null default '' check(char_length(address)<=240),notes text not null default '' check(char_length(notes)<=500),
 archived boolean not null default false,row_version bigint not null default 1 check(row_version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(organization_id,id)
);
create unique index company_supplier_tax_id on private.company_suppliers(organization_id,upper(btrim(tax_id)));
alter table private.company_suppliers enable row level security;
revoke all on private.company_suppliers from public,anon,authenticated;
create policy suppliers_read_scope on private.company_suppliers for select to authenticated using(private.tc_account_active(organization_id) and private.tc_feature(organization_id,'expenses'));

create function private.tc_company_suppliers(p_org uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb;fields jsonb;wanted jsonb;row private.company_suppliers;target uuid;expected bigint;after_id uuid;result jsonb;
begin
 a:=private.tc_commercial_access(p_org);
 if not coalesce((a->'features'->>'expenses')::boolean,false) then raise exception 'Sin acceso a proveedores' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8192 then raise exception 'Datos no validos' using errcode='23514';end if;
 if p_action='list' then
  if p_data-array['after']<>'{}' then raise exception 'Parametros no validos' using errcode='23514';end if;
  after_id:=nullif(p_data->>'after','')::uuid;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]') into result from(select * from private.company_suppliers where organization_id=p_org and (after_id is null or id>after_id) order by id limit 200)s;
  return jsonb_build_object('schema_version',1,'organization_id',p_org,'rows',result);
 end if;
 if p_action<>'save' or not coalesce((a->>'can_write')::boolean,false) or not private.tc_can_write_company(p_org) then raise exception 'Sin permiso de escritura' using errcode='42501';end if;
 if p_data-array['id','expected_version','fields']<>'{}' then raise exception 'Parametros no validos' using errcode='23514';end if;
 if p_data?'expected_version' and p_data->'expected_version'<>'null'::jsonb and not private.tc_json_integer(p_data,'expected_version',1,9007199254740991) then raise exception 'Version no valida' using errcode='23514';end if;
 target:=(p_data->>'id')::uuid;expected:=nullif(p_data->>'expected_version','')::bigint;fields:=p_data->'fields';
 if target is null or (expected is not null and expected<1) or fields is null or jsonb_typeof(fields)<>'object' or fields-array['name','tax_id','email','phone','address','notes','archived']<>'{}' or not(fields?&array['name','tax_id','email','phone','address','notes','archived']) or jsonb_typeof(fields->'archived')<>'boolean' or exists(select from jsonb_each(fields) f where f.key<>'archived' and jsonb_typeof(f.value)<>'string') then raise exception 'Ficha no valida' using errcode='23514';end if;
 wanted:=jsonb_build_object('name',btrim(fields->>'name'),'tax_id',upper(btrim(fields->>'tax_id')),'email',btrim(fields->>'email'),'phone',btrim(fields->>'phone'),'address',btrim(fields->>'address'),'notes',btrim(fields->>'notes'),'archived',(fields->>'archived')::boolean);
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':suppliers',0));
 select * into row from private.company_suppliers where organization_id=p_org and id=target for update;
 if found then
  if (to_jsonb(row)-array['id','organization_id','row_version','created_at','updated_at'])=wanted and ((expected is null and row.row_version=1) or row.row_version=expected+1) then return jsonb_build_object('schema_version',1,'organization_id',p_org,'row',to_jsonb(row));end if;
  if expected is null or row.row_version<>expected then raise exception 'La ficha ha cambiado' using errcode='40001';end if;
  update private.company_suppliers set name=wanted->>'name',tax_id=wanted->>'tax_id',email=wanted->>'email',phone=wanted->>'phone',address=wanted->>'address',notes=wanted->>'notes',archived=(wanted->>'archived')::boolean,row_version=row_version+1,updated_at=now() where organization_id=p_org and id=target returning * into row;
 else
  if expected is not null then raise exception 'La ficha ya no existe' using errcode='40001';end if;
  if (select count(*) from private.company_suppliers where organization_id=p_org)>=10000 then raise exception 'Limite de proveedores alcanzado' using errcode='23514';end if;
  insert into private.company_suppliers(organization_id,id,name,tax_id,email,phone,address,notes,archived) values(p_org,target,wanted->>'name',wanted->>'tax_id',wanted->>'email',wanted->>'phone',wanted->>'address',wanted->>'notes',(wanted->>'archived')::boolean) returning * into row;
 end if;
 insert into private.tc_admin_audit(actor_id,action,target_id,details) values((select auth.uid()),'company_supplier_save',target::text,jsonb_build_object('organization_id',p_org,'version',row.row_version,'archived',row.archived));
 return jsonb_build_object('schema_version',1,'organization_id',p_org,'row',to_jsonb(row));
end;$$;
revoke all on function private.tc_company_suppliers(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.tc_company_suppliers(uuid,text,jsonb) to authenticated;
create function public.tc_company_suppliers(p_org uuid,p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.tc_company_suppliers(p_org,p_action,p_data)$$;
revoke all on function public.tc_company_suppliers(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tc_company_suppliers(uuid,text,jsonb) to authenticated;

create table private.trip_finance_links(
 organization_id uuid not null,entry_id uuid not null,trip_id uuid not null,created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
 primary key(organization_id,entry_id),foreign key(organization_id,entry_id) references public.finance_entries(organization_id,id) on delete restrict,foreign key(organization_id,trip_id) references private.fleet_records(organization_id,id) on delete restrict
);
create index trip_finance_by_trip on private.trip_finance_links(organization_id,trip_id);
create function private.tc_trip_finance_link_valid() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not exists(select from private.fleet_records t join public.finance_entries e on e.organization_id=t.organization_id and e.truck_id=t.truck_id where t.organization_id=new.organization_id and t.id=new.trip_id and t.kind='trips' and e.id=new.entry_id) then raise exception 'Vinculo no valido' using errcode='23514';end if;return new;
end;$$;
revoke all on function private.tc_trip_finance_link_valid() from public,anon,authenticated;
create trigger trip_finance_link_valid before insert or update on private.trip_finance_links for each row execute function private.tc_trip_finance_link_valid();
create table private.trip_finance_reviews(organization_id uuid not null,trip_id uuid not null,fingerprint text not null,reviewed_by uuid not null references auth.users(id) on delete restrict,reviewed_at timestamptz not null default now(),primary key(organization_id,trip_id),foreign key(organization_id,trip_id) references private.fleet_records(organization_id,id) on delete restrict);
alter table private.trip_finance_links enable row level security;alter table private.trip_finance_reviews enable row level security;
revoke all on private.trip_finance_links,private.trip_finance_reviews from public,anon,authenticated;
create policy trip_finance_links_scope on private.trip_finance_links for select to authenticated using(private.tc_account_active(organization_id) and private.tc_feature(organization_id,'trips') and private.tc_feature(organization_id,'profitability') and (private.tc_feature(organization_id,'income') or private.tc_feature(organization_id,'expenses')));
create policy trip_finance_reviews_scope on private.trip_finance_reviews for select to authenticated using(private.tc_account_active(organization_id) and private.tc_feature(organization_id,'trips') and private.tc_feature(organization_id,'profitability'));

create function private.tc_trip_finance_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_schema='public' then
  if new.truck_id is distinct from old.truck_id and exists(select from private.trip_finance_links l join private.fleet_records t on t.organization_id=l.organization_id and t.id=l.trip_id where l.organization_id=old.organization_id and l.entry_id=old.id and t.truck_id is distinct from new.truck_id) then raise exception 'Desvincula el movimiento antes de cambiar el camion' using errcode='23514';end if;
 elsif old.kind='trips' and exists(select from private.trip_finance_links l join public.finance_entries e on e.organization_id=l.organization_id and e.id=l.entry_id where l.organization_id=old.organization_id and l.trip_id=old.id and e.truck_id is distinct from new.truck_id) then raise exception 'Desvincula los movimientos antes de cambiar el camion' using errcode='23514';end if;
 return new;
end;$$;
revoke all on function private.tc_trip_finance_guard() from public,anon,authenticated;
create trigger zz_tc_trip_link_integrity before update on private.fleet_records for each row execute function private.tc_trip_finance_guard();
create trigger tc_entry_trip_integrity before update of truck_id on public.finance_entries for each row execute function private.tc_trip_finance_guard();

create function private.tc_trip_finance_snapshot(p_org uuid,p_trip uuid,p_income boolean,p_expenses boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t private.fleet_records;rows jsonb;ic bigint;ec bigint;ins bigint;exps bigint;fp text;reviewed boolean;partial boolean;
begin
 select * into t from private.fleet_records where organization_id=p_org and id=p_trip and kind='trips';if not found then raise exception 'Viaje no disponible' using errcode='42501';end if;
 with linked as(select e.* from public.finance_entries e where e.organization_id=p_org and ((e.kind='income' and p_income) or(e.kind='expense' and p_expenses)) and (e.id=t.finance_entry_id or exists(select from private.trip_finance_links l where l.organization_id=p_org and l.trip_id=p_trip and l.entry_id=e.id)))
 select count(*) filter(where kind='income'),count(*) filter(where kind='expense'),coalesce(sum(amount_cents) filter(where kind='income'),0),coalesce(sum(amount_cents) filter(where kind='expense'),0),md5(t.row_version::text||coalesce(jsonb_agg(jsonb_build_object('id',id,'version',row_version,'kind',kind,'amount',amount_cents) order by id)::text,'[]')),count(*)>2000 into ic,ec,ins,exps,fp,partial from linked;
 reviewed:=p_income and p_expenses and exists(select from private.trip_finance_reviews r where r.organization_id=p_org and r.trip_id=p_trip and r.fingerprint=fp);
 select coalesce(jsonb_agg(x order by x.date,x.id),'[]') into rows from(select e.id,e.kind,e.concept,e.date,e.amount_cents,e.payment_status,e.row_version,coalesce(e.id=t.finance_entry_id,false) auto_booked from public.finance_entries e where e.organization_id=p_org and((e.kind='income' and p_income) or(e.kind='expense' and p_expenses)) and(e.id=t.finance_entry_id or exists(select from private.trip_finance_links l where l.organization_id=p_org and l.trip_id=p_trip and l.entry_id=e.id)) order by e.date,e.id limit 2000)x;
 return jsonb_build_object('schema_version',1,'organization_id',p_org,'trip_id',p_trip,'quoted_net_cents',(t.payload->>'amountCents')::bigint,'income_cents',case when p_income then ins end,'expense_cents',case when p_expenses then exps end,'income_count',case when p_income then ic end,'expense_count',case when p_expenses then ec end,'recorded_margin_cents',case when p_income and p_expenses then ins-exps end,'reviewed_margin_cents',case when reviewed then ins-exps end,'reviewed',reviewed,'fingerprint',case when p_income and p_expenses then fp end,'can_review',p_income and p_expenses and t.payload->>'status' in('completed','cancelled'),'rows',rows,'rows_partial',partial,'basis','Only linked EUR accrual entries; trip quotes and unallocated truck costs are not accounting entries or net profit. Review becomes stale after underlying records change.');
end;$$;
revoke all on function private.tc_trip_finance_snapshot(uuid,uuid,boolean,boolean) from public,anon,authenticated;

create function private.tc_trip_finance(p_org uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb;t private.fleet_records;entry_row public.finance_entries;linked private.trip_finance_links;trip uuid;entry uuid;inc boolean;exp boolean;snapshot jsonb;after_id uuid;
begin
 a:=private.tc_commercial_access(p_org);inc:=coalesce((a->'features'->>'income')::boolean,false);exp:=coalesce((a->'features'->>'expenses')::boolean,false);
 if not coalesce((a->'features'->>'trips')::boolean,false) or not coalesce((a->'features'->>'profitability')::boolean,false) or not(inc or exp) then raise exception 'Sin acceso a rentabilidad del viaje' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>2048 then raise exception 'Parametros no validos' using errcode='23514';end if;
 trip:=(p_data->>'trip_id')::uuid;if trip is null then raise exception 'Selecciona un viaje' using errcode='23514';end if;
 select * into t from private.fleet_records where organization_id=p_org and id=trip and kind='trips';if not found then raise exception 'Viaje no disponible' using errcode='42501';end if;
 if p_action='candidates' then
  if p_data-array['trip_id','after']<>'{}' then raise exception 'Parametros no validos' using errcode='23514';end if;
  after_id:=nullif(p_data->>'after','')::uuid;
  select coalesce(jsonb_agg(x order by x.id),'[]') into snapshot from(select e.id,e.kind,e.concept,e.date,e.amount_cents,e.payment_status,e.row_version,false auto_booked from public.finance_entries e where e.organization_id=p_org and e.truck_id=t.truck_id and ((e.kind='income' and inc) or (e.kind='expense' and exp)) and (after_id is null or e.id>after_id) and not exists(select from private.trip_finance_links l where l.organization_id=p_org and l.entry_id=e.id) and not exists(select from private.fleet_records r where r.organization_id=p_org and r.kind='trips' and r.finance_entry_id=e.id) order by e.id limit 200)x;
  return jsonb_build_object('schema_version',1,'organization_id',p_org,'trip_id',trip,'rows',snapshot);
 end if;
 if p_action='summary' then if p_data-array['trip_id']<>'{}' then raise exception 'Parametros no validos' using errcode='23514';end if;return private.tc_trip_finance_snapshot(p_org,trip,inc,exp);end if;
 if not coalesce((a->>'can_write')::boolean,false) or not private.tc_can_write_company(p_org) then raise exception 'Sin permiso de escritura' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||trip::text,0));
 select * into t from private.fleet_records where organization_id=p_org and id=trip and kind='trips' for update;
 if not found then raise exception 'Viaje no disponible' using errcode='42501';end if;
 if p_action='review' then
  if p_data-array['trip_id','expected_fingerprint']<>'{}' or not inc or not exp or t.payload->>'status' not in('completed','cancelled') then raise exception 'Revision no disponible' using errcode='42501';end if;
  snapshot:=private.tc_trip_finance_snapshot(p_org,trip,inc,exp);if p_data->>'expected_fingerprint' is distinct from snapshot->>'fingerprint' then raise exception 'Los movimientos han cambiado' using errcode='40001';end if;
  insert into private.trip_finance_reviews(organization_id,trip_id,fingerprint,reviewed_by) values(p_org,trip,snapshot->>'fingerprint',(select auth.uid())) on conflict(organization_id,trip_id) do update set fingerprint=excluded.fingerprint,reviewed_by=excluded.reviewed_by,reviewed_at=now();
 elsif p_action in('link','unlink') then
  if p_data-array['trip_id','entry_id','expected_entry_version']<>'{}' then raise exception 'Parametros no validos' using errcode='23514';end if;
  if not private.tc_json_integer(p_data,'expected_entry_version',1,9007199254740991) then raise exception 'Version no valida' using errcode='23514';end if;
  entry:=(p_data->>'entry_id')::uuid;
  select * into entry_row from public.finance_entries where organization_id=p_org and id=entry for update;
  if not found or(entry_row.kind='income' and not inc) or(entry_row.kind='expense' and not exp) then raise exception 'Movimiento no disponible' using errcode='42501';end if;
  if entry_row.row_version is distinct from (p_data->>'expected_entry_version')::bigint then raise exception 'El movimiento ha cambiado' using errcode='40001';end if;
  if entry_row.truck_id<>t.truck_id then raise exception 'El movimiento pertenece a otro camion' using errcode='23514';end if;
  if exists(select from private.fleet_records r where r.organization_id=p_org and r.finance_entry_id=entry and r.kind='trips' and r.id<>trip) then raise exception 'Movimiento vinculado a otro viaje' using errcode='23514';end if;
  if entry=t.finance_entry_id then if p_action='unlink' then raise exception 'El ingreso contabilizado conserva su origen' using errcode='23514';end if;return private.tc_trip_finance_snapshot(p_org,trip,inc,exp);end if;
  select * into linked from private.trip_finance_links where organization_id=p_org and entry_id=entry for update;
  if p_action='link' then
   if found then if linked.trip_id<>trip then raise exception 'Movimiento vinculado a otro viaje' using errcode='23505';end if;return private.tc_trip_finance_snapshot(p_org,trip,inc,exp);end if;
   insert into private.trip_finance_links(organization_id,entry_id,trip_id,created_by) values(p_org,entry,trip,(select auth.uid()));
  else
   if not found then return private.tc_trip_finance_snapshot(p_org,trip,inc,exp);end if;
   if linked.trip_id<>trip then raise exception 'Vinculo no disponible' using errcode='42501';end if;
   delete from private.trip_finance_links where organization_id=p_org and entry_id=entry and trip_id=trip;
  end if;
 else raise exception 'Accion no disponible' using errcode='23514';end if;
 insert into private.tc_admin_audit(actor_id,action,target_id,details) values((select auth.uid()),'trip_finance_'||p_action,trip::text,jsonb_build_object('organization_id',p_org,'entry_id',entry));
 return private.tc_trip_finance_snapshot(p_org,trip,inc,exp);
end;$$;
revoke all on function private.tc_trip_finance(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.tc_trip_finance(uuid,text,jsonb) to authenticated;
create function public.tc_trip_finance(p_org uuid,p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.tc_trip_finance(p_org,p_action,p_data)$$;
revoke all on function public.tc_trip_finance(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tc_trip_finance(uuid,text,jsonb) to authenticated;

-- Versioned export is ordinary authenticated access; no restoration over production.
create function private.tc_commercial_backup_page(p_org uuid,p_kind text,p_after uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a jsonb;rows jsonb;
begin
 a:=private.tc_commercial_access(p_org);
 if not coalesce((a->>'can_manage')::boolean,false) then raise exception 'Solo administracion de empresa' using errcode='42501';end if;
 if p_kind='suppliers' then
  if not coalesce((a->'features'->>'expenses')::boolean,false) then raise exception 'Sin acceso a proveedores' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into rows from(select * from private.company_suppliers where organization_id=p_org and (p_after is null or id>p_after) order by id limit 200)x;
 elsif p_kind in('trip_links','trip_reviews') then
  if not coalesce((a->'features'->>'trips')::boolean,false) or not coalesce((a->'features'->>'profitability')::boolean,false) or not coalesce((a->'features'->>'income')::boolean,false) or not coalesce((a->'features'->>'expenses')::boolean,false) then raise exception 'Sin acceso economico completo' using errcode='42501';end if;
  if p_kind='trip_links' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.entry_id),'[]') into rows from(select * from private.trip_finance_links where organization_id=p_org and (p_after is null or entry_id>p_after) order by entry_id limit 200)x;
  else
   select coalesce(jsonb_agg(to_jsonb(x) order by x.trip_id),'[]') into rows from(select * from private.trip_finance_reviews where organization_id=p_org and (p_after is null or trip_id>p_after) order by trip_id limit 200)x;
  end if;
 else raise exception 'Archivo no disponible' using errcode='23514';end if;
 return jsonb_build_object('schema_version',1,'organization_id',p_org,'kind',p_kind,'rows',rows);
end;$$;
revoke all on function private.tc_commercial_backup_page(uuid,text,uuid) from public,anon,authenticated;
grant execute on function private.tc_commercial_backup_page(uuid,text,uuid) to authenticated;
create function public.tc_commercial_backup_page(p_org uuid,p_kind text,p_after uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.tc_commercial_backup_page(p_org,p_kind,p_after)$$;
revoke all on function public.tc_commercial_backup_page(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.tc_commercial_backup_page(uuid,text,uuid) to authenticated;

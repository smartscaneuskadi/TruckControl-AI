-- Conversational proposals are private, bounded and never execute on a model response.
-- Reuses the existing document AI permission, consent, quota and global budget.
update private.tc_modules set label='Asistente IA: documentos y tareas' where id='document_ai';

create function private.tc_copilot_access(p_org uuid,p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a jsonb;begin
 if p_user is null or not exists(select 1 from auth.users u where u.id=p_user
  and nullif(to_jsonb(u)->>'email_confirmed_at','') is not null and to_jsonb(u)->>'deleted_at' is null
  and coalesce(nullif(to_jsonb(u)->>'banned_until','')::timestamptz,'-infinity'::timestamptz)<=now()) then
  raise exception 'Se requiere una cuenta verificada' using errcode='42501';end if;
 a:=private.tc_organization_access_for(p_org,p_user);
 if not coalesce((a->>'active')::boolean,false) or not coalesce((a->'features'->>'assistant')::boolean,false) then
  raise exception 'Sin acceso al asistente de esta empresa' using errcode='42501';end if;
 return a;
end;$$;
revoke all on function private.tc_copilot_access(uuid,uuid) from public,anon,authenticated;

create function private.tc_copilot_module(k text) returns text
language sql immutable security invoker set search_path='' as $$
 select case k when 'truck' then 'trucks' when 'driver' then 'drivers' when 'expense' then 'expenses' else k end;
$$;
revoke all on function private.tc_copilot_module(text) from public,anon,authenticated;

create function private.tc_copilot_keys(k text) returns text[]
language sql immutable security invoker set search_path='' as $$
 select case k
 when 'truck' then array['plate','brand','model','year','odometerKm','status','driverId','inspectionDueOn','route']
 when 'driver' then array['name','email','phone','license','licenseExpiresOn','status']
 when 'income' then array['truckId','concept','date','amountCents','category','paymentStatus','distanceKm']
 when 'expense' then array['truckId','concept','date','amountCents','category','paymentStatus','distanceKm']
 when 'trailers' then array['plate','type','status','capacityKg','inspectionDueOn','insuranceDueOn','notes']
 when 'customers' then array['name','taxId','email','phone','address','notes']
 when 'trips' then array['reference','customerId','truckId','driverId','trailerId','origin','destination','startOn','endOn','status','distanceKm','amountCents','notes']
 when 'maintenance' then array['truckId','type','description','scheduledOn','completedOn','status','odometerKm','nextDueKm','nextDueOn','amountCents','supplier','notes']
 when 'fuel' then array['truckId','driverId','date','odometerKm','millilitres','amountCents','station','fullTank','notes']
 when 'deadlines' then array['title','category','truckId','driverId','trailerId','dueOn','remindDays','status','notes']
 when 'alerts' then array['title','dueOn','truckId','priority','status','sourceKey','notes'] else null end;
$$;
revoke all on function private.tc_copilot_keys(text) from public,anon,authenticated;

create function private.tc_copilot_payload_valid(k text,p jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare valid boolean;field_key text;field_value jsonb;field_type text;begin
 if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>8192
  or private.tc_copilot_keys(k) is null or p-private.tc_copilot_keys(k)<>'{}'::jsonb then return false;end if;
 if exists(select 1 from jsonb_each(p) x where jsonb_typeof(x.value)='string' and char_length(x.value#>>'{}')>500) then return false;end if;
 for field_key,field_value in select key,value from jsonb_each(p) loop
  field_type:=jsonb_typeof(field_value);
  if field_key in ('year','odometerKm','amountCents','distanceKm','capacityKg','millilitres','remindDays','nextDueKm') then
   if field_type<>'number' and not (field_key='nextDueKm' and field_type='null') then return false;end if;
   if field_type='number' and not private.tc_json_integer(p,field_key,0,10000000000) then return false;end if;
  elsif field_key='fullTank' then if field_type<>'boolean' then return false;end if;
  elsif field_key in ('truckId','driverId','trailerId','customerId') then
   if field_type<>'null' and (field_type<>'string' or field_value#>>'{}' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then return false;end if;
  elsif field_type<>'string' and not (field_key in ('endOn','completedOn','nextDueOn') and field_type='null') then return false;end if;
 end loop;
 if k in ('trips','maintenance','fuel') and p->>'truckId' is null then return false;end if;
 if k not in ('truck','driver','income','expense') then return coalesce(private.tc_record_valid(k,p),false);end if;
 if exists(select 1 from unnest(private.tc_copilot_keys(k)) t where not p?t) then return false;end if;
 if k='truck' then
  valid:=jsonb_typeof(p->'plate')='string' and p->>'plate' ~ '^[A-Za-z0-9 -]{3,16}$'
   and jsonb_typeof(p->'brand')='string' and char_length(btrim(p->>'brand')) between 1 and 50
   and jsonb_typeof(p->'model')='string' and char_length(btrim(p->>'model')) between 1 and 60
   and private.tc_json_integer(p,'year',1980,2100) and private.tc_json_integer(p,'odometerKm',0,10000000)
   and p->>'status' in ('on_route','available','maintenance') and private.tc_json_date(p,'inspectionDueOn',true)
   and jsonb_typeof(p->'route')='string' and char_length(p->>'route')<=120
   and (p->'driverId'='null'::jsonb or (jsonb_typeof(p->'driverId')='string' and p->>'driverId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'));
 elsif k='driver' then
  valid:=jsonb_typeof(p->'name')='string' and char_length(btrim(p->>'name')) between 2 and 80
   and jsonb_typeof(p->'email')='string' and char_length(p->>'email')<=254 and (p->>'email'='' or p->>'email' ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
   and jsonb_typeof(p->'phone')='string' and char_length(p->>'phone')<=24
   and jsonb_typeof(p->'license')='string' and char_length(btrim(p->>'license')) between 1 and 30
   and private.tc_json_date(p,'licenseExpiresOn',true) and p->>'status' in ('active','leave');
 else
  valid:=jsonb_typeof(p->'truckId')='string' and p->>'truckId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   and jsonb_typeof(p->'concept')='string' and char_length(btrim(p->>'concept')) between 2 and 160
   and private.tc_json_date(p,'date',true) and private.tc_json_integer(p,'amountCents',1,10000000000)
   and p->>'paymentStatus' in ('paid','pending') and private.tc_json_integer(p,'distanceKm',0,1000000)
   and ((k='income' and p->>'category' in ('transport','other')) or (k='expense' and p->>'category' in ('fuel','maintenance','payroll','tolls','insurance','other') and p->>'distanceKm'='0'));
 end if;
 return coalesce(valid,false);
exception when others then return false;end;$$;
revoke all on function private.tc_copilot_payload_valid(text,jsonb) from public,anon,authenticated;

-- Internal lookup: callers must establish tenant membership and module access first.
create function private.tc_copilot_record(p_org uuid,k text,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;begin
 if k='truck' then
  select jsonb_build_object('id',t.id,'version',t.row_version,'fields',jsonb_build_object('plate',t.plate,'brand',t.brand,'model',t.model,'year',t.year,'odometerKm',t.odometer_km,'status',t.status,'driverId',t.driver_id,'inspectionDueOn',t.inspection_due_on,'route',t.route)) into result from public.trucks t where t.organization_id=p_org and t.id=p_id;
 elsif k='driver' then
  select jsonb_build_object('id',d.id,'version',d.row_version,'fields',jsonb_build_object('name',d.name,'email',d.email,'phone',d.phone,'license',d.license,'licenseExpiresOn',d.license_expires_on,'status',d.status)) into result from public.drivers d where d.organization_id=p_org and d.id=p_id;
 elsif k in ('income','expense') then
  select jsonb_build_object('id',e.id,'version',e.row_version,'fields',jsonb_build_object('truckId',e.truck_id,'concept',e.concept,'date',e.date,'amountCents',e.amount_cents,'category',e.category,'paymentStatus',e.payment_status,'distanceKm',e.distance_km)) into result from public.finance_entries e where e.organization_id=p_org and e.id=p_id and e.kind=k;
 else
  select jsonb_build_object('id',r.id,'version',r.row_version,'fields',r.payload) into result from private.fleet_records r where r.organization_id=p_org and r.id=p_id and r.kind=k;
 end if;return result;
end;$$;
revoke all on function private.tc_copilot_record(uuid,text,uuid) from public,anon,authenticated;

create table private.tc_copilot_turns (
 organization_id uuid not null references public.organizations(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,id uuid not null,
 state text not null default 'pending' check(state in ('pending','complete','failed')),
 capabilities jsonb not null,can_write boolean not null,
 reply text check(char_length(reply)<=6000),created_at timestamptz not null default now(),
 primary key(organization_id,user_id,id)
);
create table private.tc_copilot_actions (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,user_id uuid not null,turn_id uuid not null,
 slot integer not null check(slot between 1 and 3),entity text not null check(private.tc_copilot_keys(entity) is not null),
 mode text not null check(mode in ('create','update')),record_id uuid not null,
 payload jsonb not null check(private.tc_copilot_payload_valid(entity,payload)),
 previous jsonb,expected_version bigint,
 state text not null default 'pending' check(state in ('pending','applied','cancelled')),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 minutes',applied_at timestamptz,
 foreign key(organization_id,user_id,turn_id) references private.tc_copilot_turns(organization_id,user_id,id) on delete restrict,
 unique(organization_id,user_id,turn_id,slot),check((mode='create' and expected_version is null and previous is null) or (mode='update' and expected_version>0 and previous is not null))
);
create index tc_copilot_actions_owner_idx on private.tc_copilot_actions(organization_id,user_id,created_at desc);
create index tc_copilot_turns_user_idx on private.tc_copilot_turns(user_id,created_at desc);
alter table private.tc_copilot_turns enable row level security;
alter table private.tc_copilot_actions enable row level security;
revoke all on private.tc_copilot_turns,private.tc_copilot_actions from public,anon,authenticated;
create policy copilot_turns_owned_read on private.tc_copilot_turns for select to authenticated using(user_id=(select auth.uid()) and private.tc_account_active(organization_id) and private.tc_feature(organization_id,'assistant') and private.tc_feature(organization_id,'document_ai'));
create policy copilot_actions_owned_read on private.tc_copilot_actions for select to authenticated using(user_id=(select auth.uid()) and private.tc_account_active(organization_id) and private.tc_feature(organization_id,'assistant') and private.tc_feature(organization_id,'document_ai'));
-- Only the explicitly checked RPCs expose a user's own turns/proposals. No raw client DML.

create function private.tc_copilot_action_json(a private.tc_copilot_actions) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',a.id,'organization_id',a.organization_id,'entity',a.entity,'mode',a.mode,'record_id',a.record_id,'fields',a.payload,'previous',a.previous,'expected_version',a.expected_version,'state',a.state,'created_at',a.created_at,'expires_at',a.expires_at,'applied_at',a.applied_at);
$$;
revoke all on function private.tc_copilot_action_json(private.tc_copilot_actions) from public,anon,authenticated;

create function private.tc_copilot_result(p_org uuid,p_user uuid,p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;permission_snapshot jsonb;t private.tc_copilot_turns;begin
 permission_snapshot:=private.tc_copilot_access(p_org,p_user);
 select * into t from private.tc_copilot_turns where organization_id=p_org and user_id=p_user and id=p_id;
 if not found then return null;end if;
 if t.capabilities is distinct from permission_snapshot->'features' or t.can_write is distinct from coalesce((permission_snapshot->>'can_write')::boolean,false) then raise exception 'Los permisos de la consulta han cambiado' using errcode='42501';end if;
 select jsonb_build_object('request_id',t.id,'organization_id',t.organization_id,'state',t.state,'reply',t.reply,
  'actions',(select coalesce(jsonb_agg(private.tc_copilot_action_json(a) order by a.slot),'[]'::jsonb) from private.tc_copilot_actions a where a.organization_id=t.organization_id and a.user_id=t.user_id and a.turn_id=t.id))
 into result;return result;
end;
$$;
revoke all on function private.tc_copilot_result(uuid,uuid,uuid) from public,anon,authenticated;

create function private.tc_copilot_match(p jsonb,q text) returns integer
language sql immutable security invoker set search_path='' as $$
 select count(*)::integer from (select distinct token from regexp_split_to_table(lower(left(coalesce(q,''),2000)),'[^[:alnum:]]+') token where char_length(token)>=3 limit 12) x where lower(p::text) like '%'||x.token||'%';
$$;
revoke all on function private.tc_copilot_match(jsonb,text) from public,anon,authenticated;

-- Definer is required for the private proposal ledger. Every data path checks the
-- verified actor, current company access and the exact module before scoped reads/DML.
create function private.tc_company_copilot(p_org uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());access jsonb;f jsonb;k text;items jsonb;all_items jsonb:='{}';n bigint;allowed boolean;
 a private.tc_copilot_actions;current_row jsonb;v jsonb;result jsonb;sid text;query_text text;today_date date:=timezone('Europe/Madrid',now())::date;
begin
 access:=private.tc_copilot_access(p_org,actor);f:=access->'features';
 sid:=nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id';
 if sid is not null then
  if to_regclass('auth.sessions') is null then raise exception 'Sesión no disponible' using errcode='42501';end if;
  if not exists(select 1 from auth.sessions s where s.id::text=sid and s.user_id=actor) then raise exception 'Sesión revocada' using errcode='42501';end if;
 end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>4096 then raise exception 'Solicitud no válida' using errcode='23514';end if;
 if p_action='status' then
  if p_data<>'{}'::jsonb then raise exception 'Consulta no válida' using errcode='23514';end if;
  return jsonb_build_object('schema_version',1,'organization_id',p_org,'allowed',coalesce((f->>'document_ai')::boolean,false),'can_write',coalesce((access->>'can_write')::boolean,false));
 end if;
 if not coalesce((f->>'document_ai')::boolean,false) then raise exception 'Activa el permiso y consentimiento de IA' using errcode='42501';end if;
 if not exists(select 1 from private.tc_provider_settings where id=true and ai_enabled) then raise exception 'El servicio IA está desactivado' using errcode='42501';end if;
 if p_action='context' then
  if p_data-array['query']<>'{}'::jsonb or jsonb_typeof(p_data->'query') is distinct from 'string' or char_length(p_data->>'query')>2000 then raise exception 'Consulta no válida' using errcode='23514';end if;
  query_text:=p_data->>'query';
  foreach k in array array['truck','driver','income','expense','trailers','customers','trips','maintenance','fuel','deadlines','alerts'] loop
   allowed:=coalesce((f->>private.tc_copilot_module(k))::boolean,false);items:='[]';n:=0;
   if allowed then
    if k='truck' then
     select count(*) into n from public.trucks where organization_id=p_org;
     select coalesce(jsonb_agg(private.tc_copilot_record(p_org,k,id) order by score desc,id),'[]') into items from (select id,private.tc_copilot_match(to_jsonb(t),query_text) score from public.trucks t where organization_id=p_org order by score desc,id limit 50) x;
    elsif k='driver' then
     select count(*) into n from public.drivers where organization_id=p_org;
     select coalesce(jsonb_agg(private.tc_copilot_record(p_org,k,id) order by score desc,id),'[]') into items from (select id,private.tc_copilot_match(to_jsonb(d),query_text) score from public.drivers d where organization_id=p_org order by score desc,id limit 100) x;
    elsif k in ('income','expense') then
     select count(*) into n from public.finance_entries where organization_id=p_org and kind=k;
     select coalesce(jsonb_agg(private.tc_copilot_record(p_org,k,id) order by score desc,date desc,id),'[]') into items from (select id,date,private.tc_copilot_match(to_jsonb(e),query_text) score from (select * from public.finance_entries where organization_id=p_org and kind=k order by date desc,id limit 1000) e order by score desc,date desc,id limit 20) x;
    else
     select count(*) into n from private.fleet_records where organization_id=p_org and kind=k;
     select coalesce(jsonb_agg(private.tc_copilot_record(p_org,k,id) order by score desc,updated_at desc,id),'[]') into items from (select id,updated_at,private.tc_copilot_match(r.payload,query_text) score from (select * from private.fleet_records where organization_id=p_org and kind=k order by updated_at desc,id limit 1000) r order by score desc,updated_at desc,id limit 20) x;
    end if;
   end if;
   all_items:=all_items||jsonb_build_object(k,jsonb_build_object('allowed',allowed,'total',n,'partial',n>jsonb_array_length(items),'items',items));
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('month',period_key,'incomeCents',case when coalesce((f->>'income')::boolean,false) then income else null end,'expenseCents',case when coalesce((f->>'expenses')::boolean,false) then expense else null end,'profitCents',case when coalesce((f->>'income')::boolean,false) and coalesce((f->>'expenses')::boolean,false) then income-expense else null end,'distanceKm',case when coalesce((f->>'income')::boolean,false) then distance else null end) order by period_key),'[]') into items
   from (select to_char(date,'YYYY-MM') as period_key,sum(case when kind='income' then amount_cents else 0 end) income,sum(case when kind='expense' then amount_cents else 0 end) expense,sum(case when kind='income' then distance_km else 0 end) distance from public.finance_entries
    where organization_id=p_org and date>=date_trunc('month',today_date)-interval '11 months' and date<date_trunc('month',today_date)+interval '1 month'
    and ((kind='income' and coalesce((f->>'income')::boolean,false)) or (kind='expense' and coalesce((f->>'expenses')::boolean,false))) group by to_char(date,'YYYY-MM')) x;
  return jsonb_build_object('schema_version',1,'organization_id',p_org,'organization_name',(select name from public.organizations where id=p_org),'today',timezone('Europe/Madrid',now())::date,'can_write',coalesce((access->>'can_write')::boolean,false),'entities',all_items,'monthly_eur',items,'financial_basis','Accrual entries in integer EUR cents. Monthly sums are complete for the explicitly listed period and authorized kinds; item lists can be partial.');
 elsif p_action='list' then
  if p_data<>'{}'::jsonb then raise exception 'Consulta no válida' using errcode='23514';end if;
  select coalesce(jsonb_agg(private.tc_copilot_action_json(x) order by x.created_at desc,x.id),'[]') into result from (select * from private.tc_copilot_actions where organization_id=p_org and user_id=actor and state='pending' and expires_at>now() and coalesce((f->>private.tc_copilot_module(entity))::boolean,false) order by created_at desc,id limit 30) x;
  return jsonb_build_object('schema_version',1,'organization_id',p_org,'actions',result);
 elsif p_action='result' then
  if p_data-array['request_id']<>'{}'::jsonb then raise exception 'Consulta no válida' using errcode='23514';end if;
  return private.tc_copilot_result(p_org,actor,(p_data->>'request_id')::uuid);
 elsif p_action not in ('execute','cancel','task') or p_action is null then raise exception 'Acción no válida' using errcode='23514';end if;
 if p_data-array['id']<>'{}'::jsonb then raise exception 'Acción no válida' using errcode='23514';end if;
 select * into a from private.tc_copilot_actions where id=(p_data->>'id')::uuid and organization_id=p_org and user_id=actor for update;
 if not found then raise exception 'Propuesta no disponible' using errcode='42501';end if;
 access:=private.tc_copilot_access(p_org,actor);f:=access->'features';
 if not coalesce((f->>'document_ai')::boolean,false) then raise exception 'Permiso IA retirado' using errcode='42501';end if;
 if not coalesce((f->>private.tc_copilot_module(a.entity))::boolean,false) then raise exception 'Permiso retirado para esta tarea' using errcode='42501';end if;
 if p_action='task' then return private.tc_copilot_action_json(a);end if;
 if not coalesce((access->>'can_write')::boolean,false) then raise exception 'Permiso de escritura retirado' using errcode='42501';end if;
 if p_action='cancel' then
  if a.state='applied' then raise exception 'La tarea ya está guardada' using errcode='40001';end if;
  update private.tc_copilot_actions set state='cancelled' where id=a.id returning * into a;
  return private.tc_copilot_action_json(a);
 end if;
 if a.state='applied' then return private.tc_copilot_action_json(a);end if;
 if a.state<>'pending' or a.expires_at<=now() then raise exception 'Propuesta cancelada o caducada' using errcode='40001';end if;
 -- Re-read current permissions after lock acquisition, rather than authorizing a stale snapshot.
 access:=private.tc_copilot_access(p_org,actor);
 if not coalesce((access->>'can_write')::boolean,false) or not coalesce((access->'features'->>'document_ai')::boolean,false) or not coalesce((access->'features'->>private.tc_copilot_module(a.entity))::boolean,false) then raise exception 'Permiso retirado' using errcode='42501';end if;
 if a.entity='truck' then perform id from public.trucks where organization_id=p_org and id=a.record_id for update;
 elsif a.entity='driver' then perform id from public.drivers where organization_id=p_org and id=a.record_id for update;
 elsif a.entity in ('income','expense') then perform id from public.finance_entries where organization_id=p_org and id=a.record_id and kind=a.entity for update;
 else perform id from private.fleet_records where organization_id=p_org and id=a.record_id and kind=a.entity for update;end if;
 current_row:=private.tc_copilot_record(p_org,a.entity,a.record_id);
 if (a.mode='create' and current_row is not null) or (a.mode='update' and (current_row is null or (current_row->>'version')::bigint is distinct from a.expected_version)) then raise exception 'El registro ha cambiado; pide una propuesta nueva' using errcode='40001';end if;
 v:=a.payload;
 if a.entity in ('income','expense') and a.mode='update' and (
  exists(select 1 from public.finance_entries e where e.organization_id=p_org and e.id=a.record_id and e.source_record_id is not null)
  or exists(select 1 from private.invoice_documents d where d.organization_id=p_org and d.finance_entry_id=a.record_id)) then
  raise exception 'Revisa la operación o factura original para conservar su vínculo contable' using errcode='23514';end if;
 if a.entity='truck' then
  if a.mode='create' then insert into public.trucks(id,organization_id,plate,brand,model,year,odometer_km,status,driver_id,inspection_due_on,route) values(a.record_id,p_org,upper(btrim(v->>'plate')),v->>'brand',v->>'model',(v->>'year')::integer,(v->>'odometerKm')::integer,v->>'status',(v->>'driverId')::uuid,(v->>'inspectionDueOn')::date,v->>'route');
  else update public.trucks set plate=upper(btrim(v->>'plate')),brand=v->>'brand',model=v->>'model',year=(v->>'year')::integer,odometer_km=(v->>'odometerKm')::integer,status=v->>'status',driver_id=(v->>'driverId')::uuid,inspection_due_on=(v->>'inspectionDueOn')::date,route=v->>'route' where organization_id=p_org and id=a.record_id;end if;
 elsif a.entity='driver' then
  if a.mode='create' then insert into public.drivers(id,organization_id,name,email,phone,license,license_expires_on,status) values(a.record_id,p_org,v->>'name',v->>'email',v->>'phone',v->>'license',(v->>'licenseExpiresOn')::date,v->>'status');
  else update public.drivers set name=v->>'name',email=v->>'email',phone=v->>'phone',license=v->>'license',license_expires_on=(v->>'licenseExpiresOn')::date,status=v->>'status' where organization_id=p_org and id=a.record_id;end if;
 elsif a.entity in ('income','expense') then
  -- Source-linked entries have been explicitly excluded above; never rewrite a reviewed source.
  if a.mode='create' then insert into public.finance_entries(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km) values(a.record_id,p_org,(v->>'truckId')::uuid,a.entity,v->>'concept',(v->>'date')::date,(v->>'amountCents')::bigint,v->>'category',v->>'paymentStatus',(v->>'distanceKm')::integer);
  else update public.finance_entries set truck_id=(v->>'truckId')::uuid,concept=v->>'concept',date=(v->>'date')::date,amount_cents=(v->>'amountCents')::bigint,category=v->>'category',payment_status=v->>'paymentStatus',distance_km=(v->>'distanceKm')::integer where organization_id=p_org and id=a.record_id and kind=a.entity;end if;
 else
  perform private.tc_save_record(p_org,a.record_id,a.entity,v,a.expected_version);
 end if;
 update private.tc_copilot_actions set state='applied',applied_at=now() where id=a.id returning * into a;
 insert into private.tc_admin_audit(actor_id,action,target_id,details) values(actor,'copilot_task_apply',a.record_id::text,jsonb_build_object('organization_id',p_org,'proposal_id',a.id,'entity',a.entity,'mode',a.mode,'human_confirmed',true));
 return private.tc_copilot_action_json(a);
end;$$;
revoke all on function private.tc_company_copilot(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.tc_company_copilot(uuid,text,jsonb) to authenticated;
create function public.tc_company_copilot(p_org uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select private.tc_company_copilot(p_org,p_action,p_data);$$;
revoke all on function public.tc_company_copilot(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tc_company_copilot(uuid,text,jsonb) to authenticated;

-- Only the authenticated Edge backend can begin/finish a model turn. A request ID
-- is never billed twice: a repeat returns its stored result or pending status.
create function private.tc_copilot_server(p_org uuid,p_user uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare access jsonb;t private.tc_copilot_turns;item jsonb;k text;mode text;rid uuid;expected bigint;base jsonb;fields jsonb;slot integer:=0;inserted integer;
begin
 access:=private.tc_copilot_access(p_org,p_user);
 if not coalesce((access->'features'->>'document_ai')::boolean,false) then raise exception 'IA no autorizada' using errcode='42501';end if;
 if not exists(select 1 from private.tc_provider_settings where id=true and ai_enabled) then raise exception 'El servicio IA está desactivado' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>32768 or p_data-array['request_id','reply','items']<>'{}'::jsonb then raise exception 'Turno no válido' using errcode='23514';end if;
 if p_action='begin' then
  if p_data-array['request_id']<>'{}'::jsonb then raise exception 'Turno no válido' using errcode='23514';end if;
  perform pg_advisory_xact_lock(hashtextextended('truckcontrol.copilot.turn:'||p_user::text,0));
  if not exists(select 1 from private.tc_copilot_turns where organization_id=p_org and user_id=p_user and id=(p_data->>'request_id')::uuid)
   and (select count(*) from private.tc_copilot_turns where user_id=p_user and created_at>now()-interval '1 minute')>=10 then raise exception 'Demasiadas consultas' using errcode='54000';end if;
  insert into private.tc_copilot_turns(organization_id,user_id,id,capabilities,can_write) values(p_org,p_user,(p_data->>'request_id')::uuid,access->'features',coalesce((access->>'can_write')::boolean,false)) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=1 then return jsonb_build_object('started',true);end if;
  return private.tc_copilot_result(p_org,p_user,(p_data->>'request_id')::uuid);
 end if;
 select * into t from private.tc_copilot_turns where organization_id=p_org and user_id=p_user and id=(p_data->>'request_id')::uuid for update;
 if not found then raise exception 'Turno no disponible' using errcode='42501';end if;
 access:=private.tc_copilot_access(p_org,p_user);
 if not coalesce((access->'features'->>'document_ai')::boolean,false) then raise exception 'Permiso IA retirado' using errcode='42501';end if;
 if t.capabilities is distinct from access->'features' or t.can_write is distinct from coalesce((access->>'can_write')::boolean,false) then raise exception 'Los permisos han cambiado durante la consulta' using errcode='42501';end if;
 if t.state<>'pending' then return private.tc_copilot_result(p_org,p_user,t.id);end if;
 if p_action='fail' then
  update private.tc_copilot_turns set state='failed' where organization_id=p_org and user_id=p_user and id=t.id;
  return private.tc_copilot_result(p_org,p_user,t.id);
 elsif p_action<>'finish' or p_action is null then raise exception 'Acción no válida' using errcode='23514';end if;
 if t.created_at<now()-interval '5 minutes' or jsonb_typeof(p_data->'reply') is distinct from 'string' or char_length(p_data->>'reply') not between 1 and 6000
  or jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items')>3 then raise exception 'Respuesta no válida' using errcode='23514';end if;
 for item in select value from jsonb_array_elements(p_data->'items') loop
  slot:=slot+1;k:=item->>'entity';mode:=item->>'mode';
  if jsonb_typeof(item)<>'object' or item-array['entity','mode','record_id','expected_version','fields']<>'{}'::jsonb
   or private.tc_copilot_keys(k) is null or mode not in ('create','update') or mode is null
   or not coalesce((access->>'can_write')::boolean,false) or not coalesce((access->'features'->>private.tc_copilot_module(k))::boolean,false)
   or jsonb_typeof(item->'fields') is distinct from 'object' or item->'fields'='{}'::jsonb or (item->'fields')-private.tc_copilot_keys(k)<>'{}'::jsonb then raise exception 'Tarea no autorizada o no válida' using errcode='42501';end if;
  if mode='create' then
   if item->'record_id' is distinct from 'null'::jsonb or item->'expected_version' is distinct from 'null'::jsonb then raise exception 'Identificador no válido' using errcode='23514';end if;
   rid:=gen_random_uuid();expected:=null;base:=null;fields:=item->'fields';
  else
   rid:=(item->>'record_id')::uuid;expected:=(item->>'expected_version')::bigint;
   base:=private.tc_copilot_record(p_org,k,rid);
   if base is null or expected is null or (base->>'version')::bigint<>expected then raise exception 'El registro ha cambiado o no pertenece a esta empresa' using errcode='40001';end if;
   base:=base->'fields';fields:=base||(item->'fields');
  end if;
  if not private.tc_copilot_payload_valid(k,fields) then raise exception 'Faltan datos o contienen valores no válidos' using errcode='23514';end if;
  if (fields->>'truckId' is not null and not exists(select 1 from public.trucks where organization_id=p_org and id=(fields->>'truckId')::uuid))
   or (fields->>'driverId' is not null and not exists(select 1 from public.drivers where organization_id=p_org and id=(fields->>'driverId')::uuid))
   or (fields->>'trailerId' is not null and not exists(select 1 from private.fleet_records where organization_id=p_org and id=(fields->>'trailerId')::uuid and kind='trailers'))
   or (fields->>'customerId' is not null and not exists(select 1 from private.fleet_records where organization_id=p_org and id=(fields->>'customerId')::uuid and kind='customers'))
   or (k='alerts' and coalesce(fields->>'sourceKey','')<>'' and (mode='create' or fields->'sourceKey' is distinct from base->'sourceKey')) then raise exception 'Vínculo no autorizado' using errcode='42501';end if;
  insert into private.tc_copilot_actions(organization_id,user_id,turn_id,slot,entity,mode,record_id,payload,previous,expected_version) values(p_org,p_user,t.id,slot,k,mode,rid,fields,base,expected);
 end loop;
 update private.tc_copilot_turns set state='complete',reply=p_data->>'reply' where organization_id=p_org and user_id=p_user and id=t.id;
 return private.tc_copilot_result(p_org,p_user,t.id);
end;$$;
revoke all on function private.tc_copilot_server(uuid,uuid,text,jsonb) from public,anon,authenticated;
create function public.company_copilot_server(p_org uuid,p_user uuid,p_action text,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.tc_copilot_server(p_org,p_user,p_action,p_data);$$;
revoke all on function public.company_copilot_server(uuid,uuid,text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_copilot_server(uuid,uuid,text,jsonb),public.company_copilot_server(uuid,uuid,text,jsonb) to service_role;
end if;end $$;

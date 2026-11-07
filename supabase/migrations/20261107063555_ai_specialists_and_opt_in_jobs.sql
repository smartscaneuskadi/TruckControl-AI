-- Additive specialist protocol. The v31 controller, tables and handlers remain valid.
create function private.tc_specialist_entities(p text) returns text[] language sql immutable security invoker set search_path='' as $$
 select case p when 'general' then array['truck','driver','income','expense','trailers','customers','trips','maintenance','fuel','deadlines','alerts']
 when 'documents' then array['truck','driver','deadlines','alerts'] when 'finance' then array['truck','income','expense','trips','customers','alerts']
 when 'fuel' then array['truck','fuel','alerts'] when 'maintenance' then array['truck','maintenance','deadlines','alerts']
 when 'drivers' then array['truck','driver','trips','deadlines','alerts'] when 'trips' then array['truck','driver','trailers','customers','trips','alerts']
 when 'management' then array['truck','driver','income','expense','trailers','customers','trips','maintenance','fuel','deadlines','alerts'] end;
$$;
revoke all on function private.tc_specialist_entities(text) from public,anon,authenticated;
create function private.tc_specialist_allowed(p_org uuid,p_user uuid,p text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a jsonb;f jsonb;begin
 a:=private.tc_copilot_access(p_org,p_user);f:=a->'features';
 if private.tc_specialist_entities(p) is null or not coalesce((f->>'document_ai')::boolean,false) or not exists(select 1 from private.tc_provider_settings where id=true and ai_enabled) then return false;end if;
 return case p when 'general' then true when 'documents' then coalesce((f->>'documents')::boolean,false)
 when 'finance' then coalesce((f->>'income')::boolean,false) or coalesce((f->>'expenses')::boolean,false)
 when 'fuel' then coalesce((f->>'fuel')::boolean,false) when 'maintenance' then coalesce((f->>'maintenance')::boolean,false)
 when 'drivers' then coalesce((f->>'drivers')::boolean,false) when 'trips' then coalesce((f->>'trips')::boolean,false)
 when 'management' then coalesce((f->>'dashboard')::boolean,false) or coalesce((f->>'profitability')::boolean,false) else false end;
end;$$;
revoke all on function private.tc_specialist_allowed(uuid,uuid,text) from public,anon,authenticated;

-- Aggregates are computed in SQL, not guessed by a model or extrapolated from a sample.
create function private.tc_specialist_statistics(p_org uuid,p_user uuid,p text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb;f jsonb;outcome jsonb:='{}';rows jsonb;d date:=timezone('Europe/Madrid',now())::date;begin
 if not private.tc_specialist_allowed(p_org,p_user,p) then raise exception 'Perfil no autorizado' using errcode='42501';end if;
 a:=private.tc_copilot_access(p_org,p_user);f:=a->'features';
 if p in ('general','finance','management') and (coalesce((f->>'income')::boolean,false) or coalesce((f->>'expenses')::boolean,false)) then
  select coalesce(jsonb_agg(x),'[]') into rows from (
   select truck_id,count(*) records,
    case when coalesce((f->>'income')::boolean,false) then coalesce(sum(amount_cents) filter(where kind='income'),0) end as "incomeCents",
    case when coalesce((f->>'expenses')::boolean,false) then coalesce(sum(amount_cents) filter(where kind='expense'),0) end as "expenseCents",
    case when coalesce((f->>'income')::boolean,false) and coalesce((f->>'expenses')::boolean,false) then coalesce(sum(case when kind='income' then amount_cents else -amount_cents end),0) end as "profitCents",
    case when coalesce((f->>'income')::boolean,false) then coalesce(sum(distance_km) filter(where kind='income'),0) end as "registeredIncomeKm"
   from public.finance_entries where organization_id=p_org and date>=date_trunc('month',d)-interval '11 months' and date<date_trunc('month',d)+interval '1 month'
    and ((kind='income' and coalesce((f->>'income')::boolean,false)) or (kind='expense' and coalesce((f->>'expenses')::boolean,false)))
   group by truck_id order by truck_id limit 50) x;
  select coalesce(jsonb_agg(value||jsonb_build_object(
   'incomeEurosPerKm',case when (value->>'registeredIncomeKm')::numeric>0 then round((value->>'incomeCents')::numeric/(value->>'registeredIncomeKm')::numeric/100,4) end,
   'expenseEurosPerKm',case when (value->>'registeredIncomeKm')::numeric>0 then round((value->>'expenseCents')::numeric/(value->>'registeredIncomeKm')::numeric/100,4) end,
   'profitEurosPerKm',case when (value->>'registeredIncomeKm')::numeric>0 then round((value->>'profitCents')::numeric/(value->>'registeredIncomeKm')::numeric/100,4) end)),'[]') into rows from jsonb_array_elements(rows);
  outcome:=outcome||jsonb_build_object('finance_by_truck',rows,'finance_truck_groups_partial',(select count(distinct truck_id)>50 from public.finance_entries where organization_id=p_org and date>=date_trunc('month',d)-interval '11 months' and date<date_trunc('month',d)+interval '1 month' and ((kind='income' and coalesce((f->>'income')::boolean,false)) or (kind='expense' and coalesce((f->>'expenses')::boolean,false)))),'finance_basis','Complete authorized accrual entries in EUR cents for the last12 calendar months; distance comes from income entries, not odometers. At most50 trucks; do not allocate truck costs to individual trips.');
 end if;
 if p in ('general','fuel','management') and coalesce((f->>'fuel')::boolean,false) then
  -- Full-to-full intervals include partial fills; the first full fill is excluded.
  with records as (
   select id,payload,truck_id,(payload->>'date')::date recorded_on,(payload->>'odometerKm')::bigint km,(payload->>'millilitres')::bigint ml,
    (payload->>'amountCents')::bigint cents,(payload->>'fullTank')::boolean full_tank,
    row_number() over(partition by truck_id order by (payload->>'date')::date,(payload->>'odometerKm')::bigint,id) seq,
    sum((payload->>'millilitres')::bigint) over(partition by truck_id order by (payload->>'date')::date,(payload->>'odometerKm')::bigint,id rows unbounded preceding) cumulative_ml
   from private.fleet_records where organization_id=p_org and kind='fuel' and (payload->>'date')::date>=date_trunc('month',d)-interval '11 months' and (payload->>'date')::date<=d),
  fulls as (select *,lag(seq) over(partition by truck_id order by seq) prev_seq,lag(km) over(partition by truck_id order by seq) prev_km,lag(cumulative_ml) over(partition by truck_id order by seq) prev_ml from records where full_tank),
  intervals as (select truck_id,km-prev_km km,cumulative_ml-prev_ml ml from fulls where prev_seq is not null and km>prev_km),
  consumption as (select truck_id,count(*) intervals,sum(km) km,sum(ml) ml from intervals group by truck_id)
  select coalesce(jsonb_agg(x),'[]') into rows from (select r.truck_id,count(*) records,sum(r.ml) "registeredMillilitres",sum(r.cents) "registeredNetCents",coalesce(c.intervals,0) "fullTankIntervals",c.km "measuredKm",c.ml "intervalMillilitres",case when c.km>0 then round(c.ml::numeric/c.km/10,3) end "litresPer100Km" from records r left join consumption c on c.truck_id=r.truck_id group by r.truck_id,c.intervals,c.km,c.ml order by r.truck_id limit 50) x;
  outcome:=outcome||jsonb_build_object('fuel_by_truck',rows,'fuel_truck_groups_partial',(select count(distinct truck_id)>50 from private.fleet_records where organization_id=p_org and kind='fuel' and (payload->>'date')::date>=date_trunc('month',d)-interval '11 months' and (payload->>'date')::date<=d),'fuel_basis','Recorded last12 months up to today; full-to-full intervals only. Missing intervals mean unknown consumption, not zero. Costs are operational net records, not additional accounting expenses.');
 end if;
 if p in ('general','maintenance','management') and coalesce((f->>'maintenance')::boolean,false) then
  select jsonb_build_object('records',count(*),'open',count(*) filter(where payload->>'status'<>'completed'),'overdue',count(*) filter(where payload->>'status'<>'completed' and (payload->>'scheduledOn')::date<d),'completedRecordedNetCents',coalesce(sum((payload->>'amountCents')::bigint) filter(where payload->>'status'='completed'),0),'basis','Operational maintenance records, not additional accounting entries or a mechanical diagnosis') into rows from private.fleet_records where organization_id=p_org and kind='maintenance';
  outcome:=outcome||jsonb_build_object('maintenance',rows);
 end if;
 if p in ('general','drivers','management') and coalesce((f->>'drivers')::boolean,false) then
  select jsonb_build_object('records',count(*),'active',count(*) filter(where status='active'),'expiredLicenses',count(*) filter(where license_expires_on<d),'basis','Registered licenses and status only; no tachograph, working hours or driving-performance telemetry') into rows from public.drivers where organization_id=p_org;
  outcome:=outcome||jsonb_build_object('drivers',rows);
 end if;
 if p in ('general','trips','finance','management') and coalesce((f->>'trips')::boolean,false) then
  select jsonb_build_object('records',count(*),'inTransit',count(*) filter(where payload->>'status'='in_transit'),'completed',count(*) filter(where payload->>'status'='completed'),'completedQuotedNetCents',coalesce(sum((payload->>'amountCents')::bigint) filter(where payload->>'status'='completed'),0),'completedRegisteredKm',coalesce(sum((payload->>'distanceKm')::bigint) filter(where payload->>'status'='completed'),0),'profitPerTrip',null,'basis','Recorded last12 calendar months; quotes are not booked or collected income. No automatic allocation of truck costs to trips.') into rows from private.fleet_records where organization_id=p_org and kind='trips' and (payload->>'startOn')::date>=date_trunc('month',d)-interval '11 months' and (payload->>'startOn')::date<date_trunc('month',d)+interval '1 month';
  outcome:=outcome||jsonb_build_object('trips',rows);
 end if;
 if 'deadlines'=any(private.tc_specialist_entities(p)) and coalesce((f->>'deadlines')::boolean,false) then
  select jsonb_build_object('open',count(*) filter(where payload->>'status'='active'),'overdue',count(*) filter(where payload->>'status'='active' and (payload->>'dueOn')::date<d),'dueIn30Days',count(*) filter(where payload->>'status'='active' and (payload->>'dueOn')::date between d and d+30)) into rows from private.fleet_records where organization_id=p_org and kind='deadlines';
  outcome:=outcome||jsonb_build_object('deadlines',rows);
 end if;
 return jsonb_build_object('as_of',now(),'period_start',(date_trunc('month',d)-interval '11 months')::date,'today',d,'values',outcome,'max_truck_groups',50);
end;$$;
revoke all on function private.tc_specialist_statistics(uuid,uuid,text) from public,anon,authenticated;

create table private.tc_specialist_verifications(profile text primary key check(private.tc_specialist_entities(profile) is not null),verified_at timestamptz,verification_turn uuid,receipt jsonb not null default '{}');
insert into private.tc_specialist_verifications(profile) select unnest(array['general','documents','finance','fuel','maintenance','drivers','trips','management']);
create table private.tc_specialist_turns (
 organization_id uuid not null,user_id uuid not null,id uuid not null,profile text not null references private.tc_specialist_verifications(profile),
 context jsonb not null check(jsonb_typeof(context)='object' and octet_length(context::text)<=350000),
 sources jsonb not null default '[]' check(jsonb_typeof(sources)='array' and jsonb_array_length(sources)<=12),
 uncertainties jsonb not null default '[]' check(jsonb_typeof(uncertainties)='array' and jsonb_array_length(uncertainties)<=6),created_at timestamptz not null default now(),
 primary key(organization_id,user_id,id),foreign key(organization_id,user_id,id) references private.tc_copilot_turns(organization_id,user_id,id) on delete restrict);
alter table private.tc_specialist_verifications enable row level security;
alter table private.tc_specialist_turns enable row level security;
revoke all on private.tc_specialist_verifications,private.tc_specialist_turns from public,anon,authenticated;
create policy specialist_turns_owner on private.tc_specialist_turns for select to authenticated using(user_id=(select auth.uid()) and private.tc_account_active(organization_id) and private.tc_feature(organization_id,'document_ai'));

create function private.tc_specialist_result(p_org uuid,p_user uuid,p_id uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare t private.tc_specialist_turns;base jsonb;begin
 select * into t from private.tc_specialist_turns where organization_id=p_org and user_id=p_user and id=p_id;
 if not found then return null;end if;
 if not private.tc_specialist_allowed(p_org,p_user,t.profile) then raise exception 'Perfil no autorizado' using errcode='42501';end if;
 base:=private.tc_copilot_result(p_org,p_user,p_id);
 return base||jsonb_build_object('profile',t.profile,'sources',t.sources,'uncertainties',t.uncertainties);
end;$$;
revoke all on function private.tc_specialist_result(uuid,uuid,uuid) from public,anon,authenticated;

create function private.tc_company_specialists(p_org uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());base jsonb;f jsonb;p text;k text;item jsonb;entities jsonb:='{}';catalog jsonb:='[]';docs jsonb:='[]';n integer:=0;doc record;ids uuid[];sid text;begin
 -- Reuse v31's email, ban, session, license, tenant and consent checks.
 base:=private.tc_company_copilot(p_org,'status','{}');
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8192 then raise exception 'Solicitud no válida' using errcode='23514';end if;
 f:=private.tc_copilot_access(p_org,actor)->'features';
 if p_action='status' then
  if p_data<>'{}' then raise exception 'Solicitud no válida' using errcode='23514';end if;
  return jsonb_build_object('schema_version',2,'organization_id',p_org,'profiles',(select jsonb_agg(jsonb_build_object('id',v.profile,'allowed',private.tc_specialist_allowed(p_org,actor,v.profile),'connection_verified',v.verified_at is not null,'verified_at',v.verified_at) order by v.profile) from private.tc_specialist_verifications v));
 elsif p_action='result' then
  if p_data-array['request_id']<>'{}' then raise exception 'Solicitud no válida' using errcode='23514';end if;
  return private.tc_specialist_result(p_org,actor,(p_data->>'request_id')::uuid);
 elsif p_action='documents' then
  if p_data<>'{}' or not private.tc_specialist_allowed(p_org,actor,'documents') then raise exception 'Documentos no autorizados' using errcode='42501';end if;
  return jsonb_build_object('organization_id',p_org,'partial',(select count(*)>50 from private.company_documents where organization_id=p_org),'documents',(select coalesce(jsonb_agg(x),'[]') from (select id,name,content_type,size_bytes from private.company_documents where organization_id=p_org order by created_at desc,id limit 50) x));
 elsif p_action in ('jobs_status','jobs_save','jobs_run') then
  return private.tc_specialist_jobs_user(p_org,actor,p_action,p_data);
 elsif p_action<>'prepare' or p_action is null then raise exception 'Acción no válida' using errcode='23514';end if;
 p:=p_data->>'profile';
 if not private.tc_specialist_allowed(p_org,actor,p) then raise exception 'Perfil no autorizado' using errcode='42501';end if;
 if p_data-array['profile','query','document_ids']<>'{}' or jsonb_typeof(p_data->'query') is distinct from 'string' or char_length(p_data->>'query') not between 1 and 2000
  or jsonb_typeof(p_data->'document_ids') is distinct from 'array' or jsonb_array_length(p_data->'document_ids')>3 then raise exception 'Solicitud no válida' using errcode='23514';end if;
 select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(p_data->'document_ids');
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or (cardinality(ids)>0 and p<>'documents') then raise exception 'Documentos no válidos' using errcode='23514';end if;
 base:=private.tc_company_copilot(p_org,'context',jsonb_build_object('query',p_data->>'query'));
 foreach k in array private.tc_specialist_entities(p) loop
  item:=base->'entities'->k;entities:=entities||jsonb_build_object(k,item);
  for item in select value from jsonb_array_elements(item->'items') loop
   n:=n+1;catalog:=catalog||jsonb_build_array(jsonb_build_object('reference','R'||n,'kind',k,'id',item->>'id','version',item->'version','title',left(coalesce(item->'fields'->>'plate',item->'fields'->>'name',item->'fields'->>'concept',item->'fields'->>'reference',item->'fields'->>'description',item->'fields'->>'title',k),120)));
  end loop;
 end loop;
 n:=0;
 for doc in select id,name,content_type,size_bytes from private.company_documents where organization_id=p_org and id=any(ids) order by id loop
  n:=n+1;item:=jsonb_build_object('reference','D'||n,'kind','document','id',doc.id,'version',null,'title',doc.name,'content_type',doc.content_type,'size_bytes',doc.size_bytes);docs:=docs||jsonb_build_array(item);catalog:=catalog||jsonb_build_array(item);
 end loop;
 if n<>cardinality(ids) then raise exception 'Documento no disponible' using errcode='42501';end if;
 if p not in ('general','finance','management') then base:=jsonb_set(base,'{monthly_eur}','[]');end if;
 for item in select value from jsonb_array_elements(base->'monthly_eur') loop
  catalog:=catalog||jsonb_build_array(jsonb_build_object('reference','M'||(item->>'month'),'kind','month','id',item->>'month','version',null,'title','Contabilidad EUR '||(item->>'month')));
 end loop;
 item:=private.tc_specialist_statistics(p_org,actor,p);
 for k in select jsonb_object_keys(item->'values') loop catalog:=catalog||jsonb_build_array(jsonb_build_object('reference','A:'||k,'kind','aggregate','id',k,'version',null,'title','Cálculo servidor: '||k));end loop;
 return (base-'entities')||jsonb_build_object('schema_version',2,'profile',p,'prepared_at',now(),'entities',entities,'documents',docs,'catalog',catalog,'statistics',item);
end;$$;
revoke all on function private.tc_company_specialists(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.tc_company_specialists(uuid,text,jsonb) to authenticated;
create function public.tc_company_specialists(p_org uuid,p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.tc_company_specialists(p_org,p_action,p_data);$$;
revoke all on function public.tc_company_specialists(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tc_company_specialists(uuid,text,jsonb) to authenticated;

create function private.tc_specialists_server(p_org uuid,p_user uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.tc_specialist_turns;started jsonb;item jsonb;ref text;source_list jsonb:='[]';p text;access jsonb;actual jsonb;begin
 access:=private.tc_copilot_access(p_org,p_user);
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>400000 then raise exception 'Turno no válido' using errcode='23514';end if;
 if p_action='begin' then
  if p_data-array['request_id','profile','context']<>'{}' or jsonb_typeof(p_data->'context') is distinct from 'object' then raise exception 'Turno no válido' using errcode='23514';end if;
  p:=p_data->>'profile';
  if not private.tc_specialist_allowed(p_org,p_user,p) or p_data->'context'->>'organization_id' is distinct from p_org::text or p_data->'context'->>'profile' is distinct from p then raise exception 'Perfil o contexto no autorizado' using errcode='42501';end if;
  if jsonb_typeof(p_data->'context'->'catalog') is distinct from 'array' or jsonb_array_length(p_data->'context'->'catalog')>400 then raise exception 'Fuentes no válidas' using errcode='23514';end if;
  if (select count(*) from jsonb_array_elements(p_data->'context'->'catalog'))<>(select count(distinct value->>'reference') from jsonb_array_elements(p_data->'context'->'catalog')) then raise exception 'Referencias no únicas' using errcode='23514';end if;
  for item in select value from jsonb_array_elements(p_data->'context'->'catalog') loop
   if private.tc_copilot_keys(item->>'kind') is not null then
    if not (item->>'kind'=any(private.tc_specialist_entities(p))) or not coalesce((access->'features'->>private.tc_copilot_module(item->>'kind'))::boolean,false) then raise exception 'Fuente no autorizada' using errcode='42501';end if;
    actual:=private.tc_copilot_record(p_org,item->>'kind',(item->>'id')::uuid);
    if actual is null or actual->'version' is distinct from item->'version' then raise exception 'Fuente modificada' using errcode='40001';end if;
   elsif item->>'kind'='document' then
    if p<>'documents' or not exists(select 1 from private.company_documents where organization_id=p_org and id=(item->>'id')::uuid) then raise exception 'Documento no autorizado' using errcode='42501';end if;
   elsif item->>'kind' not in ('month','aggregate') or item->>'kind' is null then raise exception 'Fuente no válida' using errcode='23514';end if;
  end loop;
  started:=private.tc_copilot_server(p_org,p_user,'begin',jsonb_build_object('request_id',p_data->'request_id'));
  if coalesce((started->>'started')::boolean,false) then
   insert into private.tc_specialist_turns(organization_id,user_id,id,profile,context) values(p_org,p_user,(p_data->>'request_id')::uuid,p,p_data->'context');return started;
  end if;
  select * into t from private.tc_specialist_turns where organization_id=p_org and user_id=p_user and id=(p_data->>'request_id')::uuid;
  if not found or t.profile<>p then raise exception 'Identificador de consulta ya utilizado' using errcode='23514';end if;
  return private.tc_specialist_result(p_org,p_user,t.id);
 end if;
 select * into t from private.tc_specialist_turns where organization_id=p_org and user_id=p_user and id=(p_data->>'request_id')::uuid for update;
 if not found or not private.tc_specialist_allowed(p_org,p_user,t.profile) then raise exception 'Turno no autorizado' using errcode='42501';end if;
 if exists(select 1 from private.tc_copilot_turns where organization_id=p_org and user_id=p_user and id=t.id and state<>'pending') then return private.tc_specialist_result(p_org,p_user,t.id);end if;
 if p_action='fail' then
  if p_data-array['request_id']<>'{}' then raise exception 'Turno no válido' using errcode='23514';end if;
  perform private.tc_copilot_server(p_org,p_user,'fail',p_data);return private.tc_specialist_result(p_org,p_user,t.id);
 end if;
 if p_action<>'finish' or p_action is null or p_data-array['request_id','reply','items','citations','uncertainties']<>'{}'
  or jsonb_typeof(p_data->'citations') is distinct from 'array' or jsonb_array_length(p_data->'citations')>12
  or jsonb_typeof(p_data->'uncertainties') is distinct from 'array' or jsonb_array_length(p_data->'uncertainties')>6
  or jsonb_typeof(p_data->'items') is distinct from 'array' then raise exception 'Respuesta no válida' using errcode='23514';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'uncertainties') v where jsonb_typeof(v)<>'string' or char_length(v#>>'{}') not between 1 and 240) then raise exception 'Limitaciones no válidas' using errcode='23514';end if;
 if (select count(*) from jsonb_array_elements(p_data->'citations'))<>(select count(distinct value) from jsonb_array_elements(p_data->'citations')) then raise exception 'Referencias duplicadas' using errcode='23514';end if;
 for ref in select jsonb_array_elements_text(p_data->'citations') loop
  select value into item from jsonb_array_elements(t.context->'catalog') where value->>'reference'=ref;
  if item is null then raise exception 'Referencia ajena al turno' using errcode='42501';end if;
  source_list:=source_list||jsonb_build_array(item);
 end loop;
 for item in select value from jsonb_array_elements(p_data->'items') loop
  if not (item->>'entity'=any(private.tc_specialist_entities(t.profile))) then raise exception 'Tarea fuera de perfil' using errcode='42501';end if;
 end loop;
 -- Existing transaction enforces immutable proposals, roles, links, versions and quota.
 perform private.tc_copilot_server(p_org,p_user,'finish',p_data-array['citations','uncertainties']);
 update private.tc_specialist_turns set sources=source_list,uncertainties=p_data->'uncertainties' where organization_id=p_org and user_id=p_user and id=t.id;
 return private.tc_specialist_result(p_org,p_user,t.id);
end;$$;
revoke all on function private.tc_specialists_server(uuid,uuid,text,jsonb) from public,anon,authenticated;
create function public.company_specialists_server(p_org uuid,p_user uuid,p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.tc_specialists_server(p_org,p_user,p_action,p_data);$$;
revoke all on function public.company_specialists_server(uuid,uuid,text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_specialists_server(uuid,uuid,text,jsonb),public.company_specialists_server(uuid,uuid,text,jsonb) to service_role;
end if;end $$;

-- Personal opt-in digests are database rules, not recurring paid model requests.
create table private.tc_specialist_preferences (
 organization_id uuid not null references public.organizations(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,profile text not null references private.tc_specialist_verifications(profile),
 enabled boolean not null default false,cadence text not null default 'daily' check(cadence in ('daily','weekly')),
 next_run_at timestamptz not null default now(),row_version bigint not null default 1 check(row_version>0),updated_at timestamptz not null default now(),
 primary key(organization_id,user_id,profile));
create index specialist_preferences_due_idx on private.tc_specialist_preferences(next_run_at) where enabled;
create table private.tc_specialist_jobs (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,user_id uuid not null,profile text not null,
 scheduled_for date not null,state text not null default 'pending' check(state in ('pending','complete','failed','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 3),run_after timestamptz not null default now(),
 summary jsonb,capabilities jsonb,created_at timestamptz not null default now(),completed_at timestamptz,error_code text,
 foreign key(organization_id,user_id,profile) references private.tc_specialist_preferences(organization_id,user_id,profile) on delete restrict,
 unique(organization_id,user_id,profile,scheduled_for));
create index specialist_jobs_pending_idx on private.tc_specialist_jobs(run_after) where state='pending';
alter table private.tc_specialist_preferences enable row level security;
alter table private.tc_specialist_jobs enable row level security;
revoke all on private.tc_specialist_preferences,private.tc_specialist_jobs from public,anon,authenticated;
create policy specialist_preferences_owner on private.tc_specialist_preferences for select to authenticated using(user_id=(select auth.uid()) and private.tc_account_active(organization_id) and private.tc_feature(organization_id,'document_ai'));
create policy specialist_jobs_owner on private.tc_specialist_jobs for select to authenticated using(user_id=(select auth.uid()) and private.tc_account_active(organization_id) and private.tc_feature(organization_id,'document_ai'));

create function private.tc_specialist_enqueue(p_org uuid default null,p_user uuid default null,p_profile text default null) returns integer language plpgsql security definer set search_path='' as $$
declare pref private.tc_specialist_preferences;total integer:=0;begin
 for pref in select * from private.tc_specialist_preferences where enabled and next_run_at<=now()
  and (p_org is null or organization_id=p_org) and (p_user is null or user_id=p_user) and (p_profile is null or profile=p_profile)
  order by next_run_at,organization_id,user_id,profile limit 50 for update skip locked loop
  begin
   if not private.tc_specialist_allowed(pref.organization_id,pref.user_id,pref.profile) then raise exception 'Consentimiento o acceso retirado' using errcode='42501';end if;
   insert into private.tc_specialist_jobs(organization_id,user_id,profile,scheduled_for) values(pref.organization_id,pref.user_id,pref.profile,timezone('Europe/Madrid',now())::date) on conflict do nothing;
   update private.tc_specialist_preferences set next_run_at=now()+case when cadence='weekly' then interval '7 days' else interval '1 day' end,row_version=row_version+1,updated_at=now() where organization_id=pref.organization_id and user_id=pref.user_id and profile=pref.profile;
   total:=total+1;
  exception when sqlstate '42501' then
   update private.tc_specialist_preferences set enabled=false,row_version=row_version+1,updated_at=now() where organization_id=pref.organization_id and user_id=pref.user_id and profile=pref.profile;
   update private.tc_specialist_jobs set state='cancelled',error_code='permission_changed',completed_at=now() where organization_id=pref.organization_id and user_id=pref.user_id and profile=pref.profile and state='pending';
  end;
 end loop;
 return total;
end;$$;
revoke all on function private.tc_specialist_enqueue(uuid,uuid,text) from public,anon,authenticated;

create function private.tc_specialist_process(p_org uuid default null,p_user uuid default null,p_profile text default null) returns integer language plpgsql security definer set search_path='' as $$
declare job private.tc_specialist_jobs;a jsonb;stats jsonb;n integer;total integer:=0;begin
 for job in select * from private.tc_specialist_jobs where state='pending' and attempts<3 and run_after<=now()
  and (p_org is null or organization_id=p_org) and (p_user is null or user_id=p_user) and (p_profile is null or profile=p_profile)
  order by run_after,id limit 50 for update skip locked loop
  n:=job.attempts+1;
  begin
   if not exists(select 1 from private.tc_specialist_preferences where organization_id=job.organization_id and user_id=job.user_id and profile=job.profile and enabled)
    or not private.tc_specialist_allowed(job.organization_id,job.user_id,job.profile) then raise exception 'Acceso retirado' using errcode='42501';end if;
   a:=private.tc_copilot_access(job.organization_id,job.user_id);
   stats:=private.tc_specialist_statistics(job.organization_id,job.user_id,job.profile);
   update private.tc_specialist_jobs set state='complete',attempts=n,summary=jsonb_build_object('kind','database_rules','paid_model_calls',0,'statistics',stats,'notice','Revisión de registros por reglas del servidor; no es un análisis del modelo IA ni modifica fichas.'),capabilities=a->'features',completed_at=now(),error_code=null where id=job.id;
   insert into private.tc_admin_audit(actor_id,action,target_id,details) values(job.user_id,'specialist_digest_complete',job.id::text,jsonb_build_object('organization_id',job.organization_id,'profile',job.profile,'paid_model_calls',0));
  exception when others then
   update private.tc_specialist_jobs set state=case when sqlstate='42501' then 'cancelled' when n>=3 then 'failed' else 'pending' end,attempts=n,error_code=case when sqlstate='42501' then 'permission_changed' else 'temporary_failure' end,
    run_after=now()+make_interval(mins=>n*n),completed_at=case when sqlstate='42501' or n>=3 then now() else null end where id=job.id;
   if sqlstate='42501' then update private.tc_specialist_preferences set enabled=false,row_version=row_version+1,updated_at=now() where organization_id=job.organization_id and user_id=job.user_id and profile=job.profile;end if;
  end;
  total:=total+1;
 end loop;
 return total;
end;$$;
revoke all on function private.tc_specialist_process(uuid,uuid,text) from public,anon,authenticated;

create function private.tc_specialist_tick() returns jsonb language plpgsql security definer set search_path='' as $$
declare queued integer;processed integer;begin
 -- One scheduler job, bounded batches and row locks; no HTTP, provider key or model call.
 queued:=private.tc_specialist_enqueue();processed:=private.tc_specialist_process();
 return jsonb_build_object('queued',queued,'processed',processed,'paid_model_calls',0);
end;$$;
revoke all on function private.tc_specialist_tick() from public,anon,authenticated;

create function private.tc_specialist_jobs_user(p_org uuid,p_user uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p text:=p_data->>'profile';pref private.tc_specialist_preferences;a jsonb;rows jsonb;expected bigint;begin
 if p_user is distinct from (select auth.uid()) or not private.tc_specialist_allowed(p_org,p_user,p) then raise exception 'Avisos no autorizados' using errcode='42501';end if;
 a:=private.tc_copilot_access(p_org,p_user);
 perform pg_advisory_xact_lock(hashtextextended('truckcontrol.specialist.preference:'||p_org::text||':'||p_user::text||':'||p,0));
 select * into pref from private.tc_specialist_preferences where organization_id=p_org and user_id=p_user and profile=p for update;
 if p_action='jobs_save' then
  if p_data-array['profile','enabled','cadence','expected_version']<>'{}' or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' or p_data->>'cadence' not in ('daily','weekly') or jsonb_typeof(p_data->'expected_version') is distinct from 'number' then raise exception 'Preferencia no válida' using errcode='23514';end if;
  expected:=(p_data->>'expected_version')::bigint;
  if expected<>coalesce(pref.row_version,0) then raise exception 'La preferencia ha cambiado' using errcode='40001';end if;
  insert into private.tc_specialist_preferences(organization_id,user_id,profile,enabled,cadence) values(p_org,p_user,p,(p_data->>'enabled')::boolean,p_data->>'cadence')
   on conflict(organization_id,user_id,profile) do update set enabled=excluded.enabled,cadence=excluded.cadence,next_run_at=now(),row_version=tc_specialist_preferences.row_version+1,updated_at=now();
  if not (p_data->>'enabled')::boolean then update private.tc_specialist_jobs set state='cancelled',error_code='opted_out',completed_at=now() where organization_id=p_org and user_id=p_user and profile=p and state='pending';end if;
  insert into private.tc_admin_audit(actor_id,action,target_id,details) values(p_user,'specialist_digest_preference',p,jsonb_build_object('organization_id',p_org,'enabled',p_data->'enabled','cadence',p_data->'cadence'));
 elsif p_action='jobs_run' then
  if p_data-array['profile']<>'{}' or not coalesce(pref.enabled,false) then raise exception 'Activa primero los avisos opcionales' using errcode='42501';end if;
  perform private.tc_specialist_enqueue(p_org,p_user,p);perform private.tc_specialist_process(p_org,p_user,p);
 elsif p_action<>'jobs_status' or p_action is null or p_data-array['profile']<>'{}' then raise exception 'Consulta no válida' using errcode='23514';end if;
 select * into pref from private.tc_specialist_preferences where organization_id=p_org and user_id=p_user and profile=p;
 select coalesce(jsonb_agg(x),'[]') into rows from (select id,state,attempts,scheduled_for,summary,created_at,completed_at,error_code from private.tc_specialist_jobs where organization_id=p_org and user_id=p_user and profile=p and (capabilities is null or capabilities=a->'features') order by created_at desc,id limit 10) x;
 return jsonb_build_object('organization_id',p_org,'profile',p,'preference',jsonb_build_object('enabled',coalesce(pref.enabled,false),'cadence',coalesce(pref.cadence,'daily'),'version',coalesce(pref.row_version,0),'next_run_at',pref.next_run_at),'jobs',rows,'paid_model_calls',0);
end;$$;
revoke all on function private.tc_specialist_jobs_user(uuid,uuid,text,jsonb) from public,anon,authenticated;

-- Hosted Supabase supports pg_cron. Local PGlite can still verify all queue logic.
do $$ begin if exists(select 1 from pg_available_extensions where name='pg_cron') then
 execute 'create extension if not exists pg_cron with schema pg_catalog';
end if;end $$;
do $$ begin if to_regclass('cron.job') is not null then
 if not exists(select 1 from cron.job where jobname='truckcontrol-specialist-optin-v1') then
  perform cron.schedule('truckcontrol-specialist-optin-v1','* * * * *','select private.tc_specialist_tick()');
 elsif exists(select 1 from cron.job where jobname='truckcontrol-specialist-optin-v1' and command<>'select private.tc_specialist_tick()') then
  raise exception 'Existing scheduler job differs; preserve and inspect it';
 end if;
end if;end $$;

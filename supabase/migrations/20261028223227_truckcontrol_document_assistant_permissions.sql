-- Optional document assistant: off by default, no model or key in the client.
alter table private.tc_modules drop constraint tc_modules_id_check;
alter table private.tc_modules add constraint tc_modules_id_check check(id in
 ('dashboard','trucks','drivers','income','expenses','profitability','documents','gmail','assistant','invoice_ai','document_ai',
 'trailers','customers','trips','maintenance','fuel','deadlines','alerts','team'));
insert into private.tc_modules(id,label,enabled) values('document_ai','Consulta IA de documentos',false);
update private.tc_plans set modules=modules||'{"document_ai":true}'::jsonb;
create or replace function private.tc_company_features(p_org uuid,p_user uuid,p_plan text,p_active boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(m.id,p_active and m.enabled and
  coalesce((u.module_overrides->>m.id)::boolean,(p.modules->>m.id)::boolean,false) and
  coalesce((r.module_overrides->>m.id)::boolean,true) and
  (m.id not in ('invoice_ai','document_ai') or (u.ai_allowed and u.ai_opt_in))),'{}'::jsonb)
 from private.tc_modules m cross join private.tc_plans p
 left join private.tc_customers u on u.user_id=p_user
 left join private.tc_memberships r on r.organization_id=p_org and r.user_id=p_user and r.status='active'
 where p.id=p_plan;
$$;
revoke all on function private.tc_company_features(uuid,uuid,text,boolean) from public,anon,authenticated;


create or replace function private.tc_user_access(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.tc_customers; p private.tc_plans; s private.tc_settings; active boolean; f jsonb; is_admin boolean; requires_phone boolean;
begin
  -- Internal-only helper: all externally callable wrappers bind auth.uid().
  if p_user_id is null then return '{}'::jsonb;end if;
  select * into s from private.tc_settings where id=true;
  select exists(select 1 from private.tc_admins where user_id=p_user_id) into is_admin;
  select * into c from private.tc_customers where user_id=p_user_id;
  requires_phone := not is_admin and c.user_id is not null and s.sms_ready and not exists(
    select 1 from auth.users u where u.id=p_user_id and u.phone_confirmed_at is not null
    and ('+'||regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'))=c.phone);
  active := is_admin or (c.user_id is not null and c.status<>'suspended' and not coalesce(requires_phone,false) and
    ((c.status='trial' and now()<c.trial_ends_at) or (c.status='active' and now()<c.paid_until)));
  select * into p from private.tc_plans where id=case when now()<c.trial_ends_at then 'full' when c.status='active' then c.paid_plan else 'full' end;
  select jsonb_object_agg(m.id,coalesce(active,false) and m.enabled and
    (is_admin or coalesce((c.module_overrides->>m.id)::boolean,(p.modules->>m.id)::boolean,false)) and
    (m.id not in ('invoice_ai','document_ai') or (not is_admin and c.ai_allowed and c.ai_opt_in))) into f from private.tc_modules m;
  return jsonb_build_object('is_admin',is_admin,'active',coalesce(active,false),'features',coalesce(f,'{}'),
    'profile',case when c.user_id is null then null else to_jsonb(c)-'stripe_subscription_id' end,
    'plan',case when now()<c.trial_ends_at then 'full' when c.status='active' then c.paid_plan else 'full' end,
    'max_trucks',coalesce(p.max_trucks,50),'requires_phone_verification',coalesce(requires_phone,false),
    'sms_ready',s.sms_ready,'prices_are_examples',s.prices_are_examples,'payments_enabled',s.payments_enabled);
end;
$$;
revoke all on function private.tc_user_access(uuid) from public,anon,authenticated;

create table private.tc_document_ai_usage(
 organization_id uuid not null references public.organizations(id) on delete restrict,
 month date not null,calls integer not null check(calls between 1 and 100),primary key(organization_id,month)
);
alter table private.tc_document_ai_usage enable row level security;
revoke all on private.tc_document_ai_usage from public,anon,authenticated;
create function private.tc_consume_document_ai(p_org uuid,p_user uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare a jsonb;used integer;
begin
 a:=private.tc_organization_access_for(p_org,p_user);
 if not coalesce((a->>'active')::boolean,false) or not coalesce((a->'features'->>'assistant')::boolean,false)
  or not coalesce((a->'features'->>'document_ai')::boolean,false) then return false;end if;
 insert into private.tc_document_ai_usage(organization_id,month,calls) values(p_org,date_trunc('month',now())::date,1)
 on conflict(organization_id,month) do update set calls=tc_document_ai_usage.calls+1 where tc_document_ai_usage.calls<100 returning calls into used;
 return used is not null;
end;
$$;
revoke all on function private.tc_consume_document_ai(uuid,uuid) from public,anon,authenticated;
create function public.tc_consume_document_ai(p_org uuid,p_user uuid) returns boolean
language sql security invoker set search_path='' as $$select private.tc_consume_document_ai(p_org,p_user);$$;
revoke all on function public.tc_consume_document_ai(uuid,uuid) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 create policy tc_document_ai_server on private.tc_document_ai_usage for all to service_role using(true) with check(true);
 grant select,insert,update on private.tc_document_ai_usage to service_role;
 grant execute on function private.tc_consume_document_ai(uuid,uuid),public.tc_consume_document_ai(uuid,uuid) to service_role;
end if;end $$;

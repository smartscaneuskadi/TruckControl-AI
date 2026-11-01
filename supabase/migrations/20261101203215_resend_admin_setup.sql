-- TruckControl administrative bootstrap only. No public RPC, provider activation,
-- email send, Auth change, payment or credential value in source/client code.
-- In isolated test databases without http, transport stays unavailable.
do $$ declare f record; r text; location text;begin
 select n.nspname into location from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='http';
 if location is not null and location<>'extensions' then
  raise exception 'Existing http extension uses another schema; preserve and review it';
 end if;
 if location is null and exists(select 1 from pg_available_extensions where name='http') then
  execute 'create extension http with schema extensions';
 end if;
 -- Revoke only this extension's functions, never crypto/UUID/Vault functions.
 for f in select p.oid::regprocedure as signature from pg_proc p
  join pg_depend d on d.classid='pg_proc'::regclass and d.objid=p.oid
  join pg_extension e on d.refclassid='pg_extension'::regclass and d.refobjid=e.oid
  where e.extname='http' and d.deptype='e' loop
  execute format('revoke all on function %s from public',f.signature);
  foreach r in array array['anon','authenticated','service_role'] loop
   if exists(select 1 from pg_roles where rolname=r) then
    execute format('revoke all on function %s from %I',f.signature,r);
   end if;
  end loop;
 end loop;
end $$;

create function private.tc_resend_admin_http(p_method text,p_path text,p_body jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare api_key text; status integer; body text; payload jsonb;begin
 if p_method is null or p_path is null or not (
  (p_method='GET' and (p_path in ('/domains?limit=100','/webhooks?limit=100')
   or p_path ~ '^/(domains|webhooks)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
  or (p_method='POST' and (p_path in ('/domains','/webhooks')
   or p_path ~ '^/domains/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/verify$')))
  or octet_length(coalesce(p_body::text,''))>8192 then
  raise exception 'Administrative endpoint is not allowed';end if;
 if to_regclass('vault.decrypted_secrets') is null then raise exception 'Resend backend credential is not configured';end if;
 select btrim(decrypted_secret) into api_key from vault.decrypted_secrets where name='truckcontrol_resend_api_key';
 if api_key is null or api_key !~ '^re_[A-Za-z0-9_-]{20,}$' or char_length(api_key)>256 then
  raise exception 'Resend backend credential is not configured';end if;
 if not exists(select 1 from pg_extension where extname='http') then
  raise exception 'Administrative HTTPS transport is unavailable';end if;
 begin
  perform extensions.http_set_curlopt('CURLOPT_SSL_VERIFYPEER','1');
  perform extensions.http_set_curlopt('CURLOPT_SSL_VERIFYHOST','2');
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','5000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','10000');
  -- These rare administrative calls must not exceed Resend's account API rate.
  perform pg_catalog.pg_sleep(0.6);
  select r.status,r.content into status,body from extensions.http((
   p_method::extensions.http_method,'https://api.resend.com'||p_path,
   array[('Authorization','Bearer '||api_key)::extensions.http_header,
         ('Accept','application/json')::extensions.http_header],
   case when p_body is null then null else 'application/json' end,p_body::text
  )::extensions.http_request) r;
 exception when others then return jsonb_build_object('ok',false,'state','unknown','error','provider_transport_unconfirmed');end;
 if status not between 200 and 299 then
  return jsonb_build_object('ok',false,'status',status,'state',case when status>=500 or status between 300 and 399 then 'unknown' else 'failed' end);
 end if;
 if octet_length(coalesce(body,''))>1048576 then return jsonb_build_object('ok',false,'state','unknown','error','provider_response_invalid');end if;
 begin payload:=body::jsonb;exception when others then
  return jsonb_build_object('ok',false,'state','unknown','error','provider_response_invalid');end;
 return jsonb_build_object('ok',true,'status',status,'data',payload);
end $$;
revoke all on function private.tc_resend_admin_http(text,text,jsonb) from public;

create function private.tc_resend_admin_setup(p_action text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 domain_name constant text:='facturas.truckcontrolai.com';
 callback_url constant text:='https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/company-mail-resend';
 response jsonb; domains jsonb; hooks jsonb; target jsonb; data jsonb;
 domain_id uuid; webhook_id uuid; matching integer; secret_id uuid;
 signing_secret text; stored_secret text;
begin
 if p_action is null or p_action not in ('inspect','prepare_domain','verify_domain','prepare_webhook') then
  raise exception 'Administrative operation is not allowed';end if;
 -- One operator at a time. Always inspect before creating; never blind-retry a POST.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('truckcontrol-resend-setup',0));
 if p_action in ('inspect','prepare_domain','verify_domain') then
  response:=private.tc_resend_admin_http('GET','/domains?limit=100');
  if response->>'ok'<>'true' then return response-'data';end if;
  domains:=response->'data';
  if jsonb_typeof(domains->'data') is distinct from 'array' or jsonb_array_length(domains->'data')>100
   or jsonb_typeof(domains->'has_more') is distinct from 'boolean' then
   return jsonb_build_object('ok',false,'error','provider_inventory_invalid');end if;
  if domains->>'has_more'='true' then return jsonb_build_object('ok',false,'error','paged_inventory_requires_review');end if;
  select count(*),jsonb_agg(d)->0 into matching,target from jsonb_array_elements(domains->'data') d where d->>'name'=domain_name;
  if matching>1 then return jsonb_build_object('ok',false,'error','ambiguous_domain');end if;
  if matching=1 then domain_id:=(target->>'id')::uuid;end if;
 end if;
 if p_action in ('inspect','prepare_webhook') then
  response:=private.tc_resend_admin_http('GET','/webhooks?limit=100');
  if response->>'ok'<>'true' then return response-'data';end if;
  hooks:=response->'data';
  if jsonb_typeof(hooks->'data') is distinct from 'array' or jsonb_array_length(hooks->'data')>100
   or jsonb_typeof(hooks->'has_more') is distinct from 'boolean' then
   return jsonb_build_object('ok',false,'error','provider_inventory_invalid');end if;
  if hooks->>'has_more'='true' then return jsonb_build_object('ok',false,'error','paged_inventory_requires_review');end if;
  select count(*),jsonb_agg(h)->0 into matching,target from jsonb_array_elements(hooks->'data') h where h->>'endpoint'=callback_url;
  if matching>1 then return jsonb_build_object('ok',false,'error','ambiguous_webhook');end if;
  if matching=1 then webhook_id:=(target->>'id')::uuid;end if;
 end if;
 if p_action='inspect' then
  return jsonb_build_object('ok',true,'domain',domain_name,'domain_id',domain_id,'webhook_id',webhook_id,
   'domain_count',jsonb_array_length(domains->'data'),'webhook_count',jsonb_array_length(hooks->'data'),
   'free_plan_verified',false,'provider_policies_changed',false);
 elsif p_action='prepare_domain' then
  if exists(select 1 from private.tc_provider_settings where id and receiving_domain is not null and receiving_domain<>domain_name) then
   return jsonb_build_object('ok',false,'error','existing_receiver_domain_requires_review');end if;
  if domain_id is null then
   if jsonb_array_length(domains->'data')>=3 then return jsonb_build_object('ok',false,'error','free_domain_capacity_unavailable');end if;
   response:=private.tc_resend_admin_http('POST','/domains',jsonb_build_object(
    'name',domain_name,'region','eu-west-1','tls','enforced','open_tracking',false,'click_tracking',false,
    'capabilities',jsonb_build_object('sending','enabled','receiving','enabled')));
   if response->>'ok'<>'true' then return response-'data';end if;
   data:=response->'data';
  else
   response:=private.tc_resend_admin_http('GET','/domains/'||domain_id::text);
   if response->>'ok'<>'true' then return response-'data';end if;
   data:=response->'data';
  end if;
  if data->>'name' is distinct from domain_name or (domain_id is not null and data->>'id' is distinct from domain_id::text)
   or jsonb_typeof(data->'records') is distinct from 'array' or jsonb_array_length(data->'records')>30 then
   return jsonb_build_object('ok',false,'error','provider_domain_invalid');end if;
  domain_id:=(data->>'id')::uuid;
  -- DNS records are public configuration. Other provider fields never leave DB.
  return jsonb_build_object('ok',true,'id',domain_id,'name',domain_name,'status',data->'status',
   'region',data->'region','capabilities',jsonb_build_object('sending',data->'capabilities'->'sending','receiving',data->'capabilities'->'receiving'),
   'records',(select jsonb_agg(jsonb_build_object('record',r->'record','name',r->'name','type',r->'type',
    'value',r->'value','ttl',r->'ttl','status',r->'status','priority',r->'priority')) from jsonb_array_elements(data->'records') r));
 elsif p_action='verify_domain' then
  if domain_id is null then return jsonb_build_object('ok',false,'error','domain_not_prepared');end if;
  response:=private.tc_resend_admin_http('POST','/domains/'||domain_id::text||'/verify','{}');
  return jsonb_build_object('ok',response->'ok','status',response->'status','state',response->'state','domain_id',domain_id);
 elsif p_action='prepare_webhook' then
  if webhook_id is null then
   if jsonb_array_length(hooks->'data')>=1 then return jsonb_build_object('ok',false,'error','free_webhook_capacity_unavailable');end if;
   response:=private.tc_resend_admin_http('POST','/webhooks',jsonb_build_object('endpoint',callback_url,'events',jsonb_build_array('email.received')));
   if response->>'ok'<>'true' then return response-'data';end if;
   data:=response->'data';webhook_id:=(data->>'id')::uuid;
  end if;
  response:=private.tc_resend_admin_http('GET','/webhooks/'||webhook_id::text);
  if response->>'ok'<>'true' then return response-'data';end if;
  data:=response->'data';
  if data->>'id' is distinct from webhook_id::text or data->>'endpoint' is distinct from callback_url
   or data->'events' is distinct from '["email.received"]'::jsonb or data->>'status' is distinct from 'enabled' then
   return jsonb_build_object('ok',false,'error','existing_webhook_requires_review');end if;
  signing_secret:=data->>'signing_secret';
  if signing_secret is null or signing_secret !~ '^whsec_[A-Za-z0-9+/=]{40,}$' then
   return jsonb_build_object('ok',false,'error','webhook_secret_unavailable');end if;
  select id,decrypted_secret into secret_id,stored_secret from vault.decrypted_secrets where name='truckcontrol_resend_webhook_secret';
  if stored_secret ~ '^whsec_[A-Za-z0-9+/=]{40,}$' and stored_secret<>signing_secret then
   return jsonb_build_object('ok',false,'error','stored_webhook_secret_requires_review');end if;
  if secret_id is null then
   perform vault.create_secret(signing_secret,'truckcontrol_resend_webhook_secret','TruckControl receiving webhook; configured by server');
  elsif stored_secret is distinct from signing_secret then
   perform vault.update_secret(secret_id,signing_secret);
  end if;
  return jsonb_build_object('ok',true,'webhook_id',webhook_id,'signing_secret_configured',true,'receiver_enabled',false);
 end if;
exception when others then
 -- A provider error may contain secrets. Never surface SQLERRM or HTTP bodies.
 return jsonb_build_object('ok',false,'error','administrative_setup_unconfirmed','retry_write_automatically',false);
end $$;
revoke all on function private.tc_resend_admin_setup(text) from public;
do $$ declare r text;begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on function private.tc_resend_admin_http(text,text,jsonb),private.tc_resend_admin_setup(text) from %I',r);
  end if;
 end loop;
end $$;

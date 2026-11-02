-- Managed Vault grants mutations through its official definer functions.
-- Retain our advisory lock; never require direct UPDATE/table-lock privileges on Vault.
-- Global operator only. Write-only credentials; no provider call or new spending.
create or replace function private.tc_provider_control(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); cid text; csecret text; old_cid text;old_secret text;
 id_slot uuid;secret_slot uuid;archive_suffix text; vault_ready boolean;id_ok boolean;secret_ok boolean;connections integer;
begin
 if actor is null or not private.tc_is_admin() or not exists(
  select 1 from auth.users u where u.id=actor and to_jsonb(u)->>'email_confirmed_at' is not null
   and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity'::timestamptz)<=now()) then
  raise exception 'Solo la administración global verificada puede configurar servicios' using errcode='42501';
 end if;
 if p_action not in ('status','set_google') or p_action is null then raise exception 'Acción no válida' using errcode='22023';end if;
 vault_ready:=to_regclass('vault.secrets') is not null and to_regclass('vault.decrypted_secrets') is not null;
 if vault_ready then
  execute 'select (select decrypted_secret from vault.decrypted_secrets where name=$1),(select decrypted_secret from vault.decrypted_secrets where name=$2)'
   into old_cid,old_secret using 'truckcontrol_google_client_id','truckcontrol_google_client_secret';
 end if;
 id_ok:=coalesce(old_cid ~ '^468881730124-[A-Za-z0-9_-]+[.]apps[.]googleusercontent[.]com$',false);
 secret_ok:=coalesce(old_secret ~ '^GOCSPX[-_][A-Za-z0-9_-]{16,240}$',false);
 select count(*) into connections from private.gmail_connections;
 if p_action='set_google' then
  if not vault_ready then raise exception 'El almacén seguro no está disponible' using errcode='55000';end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>4096
   or p_data-array['client_id','client_secret','replace_existing']<>'{}'::jsonb
   or jsonb_typeof(p_data->'client_id') is distinct from 'string' or jsonb_typeof(p_data->'client_secret') is distinct from 'string' then
   raise exception 'Configuración no válida' using errcode='23514';end if;
  cid:=btrim(p_data->>'client_id');csecret:=btrim(p_data->>'client_secret');
  if char_length(cid)>255 or cid !~ '^468881730124-[A-Za-z0-9_-]+[.]apps[.]googleusercontent[.]com$'
   or csecret !~ '^GOCSPX[-_][A-Za-z0-9_-]{16,240}$' then
   raise exception 'Usa un cliente web del proyecto TruckControl y un secreto completo, sin enmascarar' using errcode='23514';end if;
  perform pg_advisory_xact_lock(hashtextextended('truckcontrol-google-provider',0));
  execute 'select id from vault.secrets where name=$1' into id_slot using 'truckcontrol_google_client_id';
  execute 'select id from vault.secrets where name=$1' into secret_slot using 'truckcontrol_google_client_secret';
  -- Reload after the lock, so retries and concurrent operators cannot lose a configuration.
  execute 'select (select decrypted_secret from vault.decrypted_secrets where name=$1),(select decrypted_secret from vault.decrypted_secrets where name=$2)'
   into old_cid,old_secret using 'truckcontrol_google_client_id','truckcontrol_google_client_secret';
  if old_cid is distinct from cid or old_secret is distinct from csecret then
   if exists(select 1 from private.gmail_connections)
    or exists(select 1 from private.gmail_oauth_states where expires_at>now())
    or exists(select 1 from private.gmail_oauth_pending where expires_at>now()) then
    raise exception 'Hay buzones vinculados o autorizaciones en curso: la sustitución requiere mantenimiento' using errcode='42501';end if;
   if coalesce(old_cid ~ '^468881730124-[A-Za-z0-9_-]+[.]apps[.]googleusercontent[.]com$',false)
    and coalesce(old_secret ~ '^GOCSPX[-_][A-Za-z0-9_-]{16,240}$',false)
    and p_data->'replace_existing' is distinct from 'true'::jsonb then
    raise exception 'Confirma la sustitución de la configuración existente' using errcode='23514';end if;
   begin
    archive_suffix:=to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'_'||gen_random_uuid()::text;
    if old_cid is not null and old_cid not in ('','pending') then
     execute 'select vault.create_secret($1,$2,$3)' using old_cid,'truckcontrol_google_client_id_previous_'||archive_suffix,'Previous encrypted Google configuration; operator recovery only';end if;
    if old_secret is not null and old_secret not in ('','pending') then
     execute 'select vault.create_secret($1,$2,$3)' using old_secret,'truckcontrol_google_client_secret_previous_'||archive_suffix,'Previous encrypted Google configuration; operator recovery only';end if;
    execute 'select id from vault.secrets where name=$1' into id_slot using 'truckcontrol_google_client_id';
    execute 'select id from vault.secrets where name=$1' into secret_slot using 'truckcontrol_google_client_secret';
    if id_slot is null then execute 'select vault.create_secret($1,$2,$3)' using cid,'truckcontrol_google_client_id','TruckControl Google OAuth client';
    else execute 'select vault.update_secret($1,$2)' using id_slot,cid;end if;
    if secret_slot is null then execute 'select vault.create_secret($1,$2,$3)' using csecret,'truckcontrol_google_client_secret','TruckControl Google OAuth client secret';
    else execute 'select vault.update_secret($1,$2)' using secret_slot,csecret;end if;
   exception when others then raise exception 'No se ha podido guardar la configuración en el almacén seguro' using errcode='P0001';end;
   insert into private.tc_admin_audit(actor_id,action,target_id,details) values(actor,'provider_google_set','google',jsonb_build_object('credential_values_included',false,'previous_configuration_preserved',true));
  end if;
  old_cid:=cid;id_ok:=true;secret_ok:=true;
 end if;
 return jsonb_build_object(
  'google',jsonb_build_object('client_id',case when id_ok then old_cid else null end,'id_valid',id_ok,'secret_valid',secret_ok,'configured',id_ok and secret_ok,'vault_available',vault_ready,'connections',connections),
  'auth_mail',(select jsonb_build_object('enabled',enabled,'legal_ready',legal_ready) from private.tc_auth_mail_settings where id),
  'ai',(select jsonb_build_object('enabled',ai_enabled,'monthly_budget_cents',ai_monthly_budget_cents) from private.tc_provider_settings where id),
  'receiving',(select jsonb_build_object('enabled',receiving_enabled,'domain',receiving_domain) from private.tc_provider_settings where id),
  'payments_enabled',(select payments_enabled from private.tc_settings where id),
  'sms_enabled',(select sms_ready from private.tc_settings where id));
end;
$$;

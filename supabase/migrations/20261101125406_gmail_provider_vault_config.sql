-- Vault is already installed in the independent hosted TruckControl project.
-- Generate the AES key inside PostgreSQL only when no existing tokens can be affected.
-- Test/shadow databases without Vault keep the integration closed.
do $$
declare exists_key boolean; secret_name text;
begin
  if to_regclass('vault.secrets') is not null
    and (to_regprocedure('vault.create_secret(text,text,text)') is not null
      or to_regprocedure('vault.create_secret(text,text,text,uuid)') is not null) then
    execute 'select exists(select 1 from vault.secrets where name=$1)'
      into exists_key using 'truckcontrol_gmail_token_encryption_key';
    if not exists_key and not exists(select 1 from private.gmail_tokens) then
      execute 'select vault.create_secret(encode(extensions.gen_random_bytes(32),''base64''),$1,$2)'
        using 'truckcontrol_gmail_token_encryption_key',
          'TruckControl Gmail AES-256-GCM key. Never rotate while tokens exist.';
    end if;
    foreach secret_name in array array['truckcontrol_google_client_id','truckcontrol_google_client_secret'] loop
      execute 'select exists(select 1 from vault.secrets where name=$1)'
        into exists_key using secret_name;
      if not exists_key then
        execute 'select vault.create_secret($1,$2,$3)'
          using 'pending',secret_name,
            'Pending Google OAuth configuration. Gmail stays disabled until a valid value is supplied.';
      end if;
    end loop;
  end if;
end $$;

-- Definer is deliberately private: service_role may read these three named secrets,
-- without gaining SELECT over every other secret in Vault.
create function private.tc_gmail_runtime_config() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return jsonb_build_object('client_id',null,'client_secret',null,'encryption_key',null);
  end if;
  select jsonb_build_object(
    'client_id',max(decrypted_secret) filter (where name='truckcontrol_google_client_id'),
    'client_secret',max(decrypted_secret) filter (where name='truckcontrol_google_client_secret'),
    'encryption_key',max(decrypted_secret) filter (where name='truckcontrol_gmail_token_encryption_key'))
  into result from vault.decrypted_secrets
  where name in ('truckcontrol_google_client_id','truckcontrol_google_client_secret','truckcontrol_gmail_token_encryption_key');
  return result;
end $$;
revoke all on function private.tc_gmail_runtime_config() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function private.tc_gmail_runtime_config() to service_role;
end if; end $$;

create function public.gmail_runtime_config() returns jsonb
language sql stable security invoker set search_path='' as $$
  select private.tc_gmail_runtime_config();
$$;
revoke all on function public.gmail_runtime_config() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.gmail_runtime_config() to service_role;
end if; end $$;

-- A reauthorization state blocks importing; it must still allow the server to
-- revoke Google's grant when an administrator disconnects the company mailbox.
create or replace function private.tc_gmail_credentials(p_data jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('email',c.email,'user_id',c.connected_by,
    'google_subject',c.google_subject,'refresh_token_cipher',t.refresh_token_cipher,
    'page_token',c.sync_page_token)
  from private.gmail_connections c join private.gmail_tokens t using(organization_id)
  where c.organization_id=(p_data->>'organization_id')::uuid
    and (c.status='connected' or p_data->>'purpose'='disconnect');
$$;
revoke all on function private.tc_gmail_credentials(jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function private.tc_gmail_credentials(jsonb) to service_role;
end if; end $$;

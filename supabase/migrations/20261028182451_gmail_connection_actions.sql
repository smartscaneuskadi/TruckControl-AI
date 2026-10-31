-- Keep connection writes, credential retrieval and disconnection independently auditable.
-- Each function remains SECURITY INVOKER and executable only by service_role.
create or replace function private.tc_gmail_connect(p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_org uuid := nullif(p_data->>'organization_id','')::uuid; v_state private.gmail_oauth_states; v_result jsonb; v_doc jsonb;
begin

    if not exists(select 1 from public.organizations where id=v_org and owner_id=(p_data->>'user_id')::uuid) then
      raise exception 'Empresa no disponible' using errcode='42501';
    end if;
    -- Unique google_subject prevents silently sharing one mailbox across companies.
    insert into private.gmail_connections(organization_id,connected_by,google_subject,email)
      values(v_org,(p_data->>'user_id')::uuid,p_data->>'google_subject',p_data->>'email')
      on conflict(organization_id) do update set connected_by=excluded.connected_by,google_subject=excluded.google_subject,
        email=excluded.email,status='connected',connected_at=now(),sync_page_token=null;
    insert into private.gmail_tokens values(v_org,p_data->>'refresh_token_cipher')
      on conflict(organization_id) do update set refresh_token_cipher=excluded.refresh_token_cipher;
    return '{}'::jsonb;
end;
$$;
revoke all on function private.tc_gmail_connect(jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_gmail_connect(jsonb) to service_role;
end if;end $$;

create or replace function private.tc_gmail_credentials(p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_org uuid := nullif(p_data->>'organization_id','')::uuid; v_state private.gmail_oauth_states; v_result jsonb; v_doc jsonb;
begin

    select jsonb_build_object('email',c.email,'user_id',c.connected_by,'google_subject',c.google_subject,'refresh_token_cipher',t.refresh_token_cipher,'page_token',c.sync_page_token)
      into v_result from private.gmail_connections c join private.gmail_tokens t using(organization_id)
      where c.organization_id=v_org and c.status='connected';
    return v_result;
end;
$$;
revoke all on function private.tc_gmail_credentials(jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_gmail_credentials(jsonb) to service_role;
end if;end $$;

create or replace function private.tc_gmail_disconnect(p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_org uuid := nullif(p_data->>'organization_id','')::uuid; v_state private.gmail_oauth_states; v_result jsonb; v_doc jsonb;
begin

    delete from private.gmail_oauth_states where organization_id=v_org;
    delete from private.gmail_oauth_pending where organization_id=v_org;
    delete from private.gmail_connections where organization_id=v_org;
    return '{}'::jsonb;
end;
$$;
revoke all on function private.tc_gmail_disconnect(jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_gmail_disconnect(jsonb) to service_role;
end if;end $$;

create or replace function private.tc_gmail_connection(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if p_action='connect' then return private.tc_gmail_connect(p_data);end if;
 if p_action='credentials' then return private.tc_gmail_credentials(p_data);end if;
 if p_action='disconnect' then return private.tc_gmail_disconnect(p_data);end if;
 raise exception 'Unsupported internal operation';
end;
$$;
revoke all on function private.tc_gmail_connection(text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_gmail_connection(text,jsonb) to service_role;
end if;end $$;

create or replace function private.tc_gmail_sync(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_org uuid := nullif(p_data->>'organization_id','')::uuid; v_state private.gmail_oauth_states; v_result jsonb; v_doc jsonb;
begin
 case p_action
  when 'lock_sync' then
    update private.gmail_connections set sync_lease_until=now()+interval '5 minutes'
      where organization_id=v_org and (sync_lease_until is null or sync_lease_until<now()) and status='connected';
    return to_jsonb(found);
  when 'finish_sync' then
    update private.gmail_connections set last_sync_at=case when p_data->>'succeeded'='true' then now() else last_sync_at end,sync_lease_until=null,
      sync_page_token=case when p_data->>'succeeded'='true' then nullif(p_data->>'page_token','') else sync_page_token end,
      status=case when p_data->>'reauthorize'='true' then 'reauthorize' else status end where organization_id=v_org;
    return '{}'::jsonb;
  when 'exists' then
    return to_jsonb(exists(select 1 from private.invoice_documents where organization_id=v_org and
      (content_hash=p_data->>'content_hash' or (message_id=p_data->>'message_id' and attachment_id=p_data->>'attachment_id'))));
 else raise exception 'Unsupported internal operation';
 end case;
end;
$$;
revoke all on function private.tc_gmail_sync(text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_gmail_sync(text,jsonb) to service_role;
end if;end $$;


-- Enforce company roles consistently at database and server boundaries.
create function private.tc_company_manager_for(p_org uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.tc_company_role_for(p_org,p_user) in ('owner','admin') and coalesce((private.tc_organization_access_for(p_org,p_user)->>'active')::boolean,false);
$$;
revoke all on function private.tc_company_manager_for(uuid,uuid) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_company_manager_for(uuid,uuid) to service_role;
end if;end $$;

create or replace function private.tc_gmail_state(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_org uuid := nullif(p_data->>'organization_id','')::uuid; v_state private.gmail_oauth_states; v_result jsonb; v_doc jsonb;
begin
 case p_action
  when 'state_create' then
    delete from private.gmail_oauth_states where expires_at < now();
    if not private.tc_company_manager_for(v_org,(p_data->>'user_id')::uuid) then
      raise exception 'Empresa no disponible' using errcode='42501';
    end if;
    insert into private.gmail_oauth_states(state_hash,organization_id,user_id)
      values(p_data->>'state_hash',v_org,(p_data->>'user_id')::uuid);
    return '{}'::jsonb;
  when 'state_consume' then
    delete from private.gmail_oauth_states where state_hash=p_data->>'state_hash' returning * into v_state;
    if not found or v_state.expires_at < now() then return null; end if;
    if not private.tc_company_manager_for(v_state.organization_id,v_state.user_id) then return null; end if;
    return to_jsonb(v_state);
  when 'pending_create' then
    delete from private.gmail_oauth_pending where expires_at < now();
    insert into private.gmail_oauth_pending(ticket_hash,organization_id,user_id,google_subject,email,refresh_token_cipher)
      values(p_data->>'ticket_hash',v_org,(p_data->>'user_id')::uuid,p_data->>'google_subject',p_data->>'email',p_data->>'refresh_token_cipher');
    return '{}'::jsonb;
  when 'pending_consume' then
    delete from private.gmail_oauth_pending where ticket_hash=p_data->>'ticket_hash' and organization_id=v_org
      and user_id=(p_data->>'user_id')::uuid and expires_at>now()
      and private.tc_company_manager_for(v_org,(p_data->>'user_id')::uuid)
      returning to_jsonb(private.gmail_oauth_pending.*) into v_result;
    return v_result;
 else raise exception 'Unsupported internal operation';
 end case;
end;
$$;
revoke all on function private.tc_gmail_state(text,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.tc_gmail_state(text,jsonb) to service_role;
end if;end $$;


create or replace function private.tc_gmail_connect(p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_org uuid := nullif(p_data->>'organization_id','')::uuid; v_state private.gmail_oauth_states; v_result jsonb; v_doc jsonb;
begin

    if not private.tc_company_manager_for(v_org,(p_data->>'user_id')::uuid) then
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


create or replace function private.tc_write_gate() returns trigger language plpgsql security invoker set search_path='' as $$
declare org uuid; module text;
begin
  org := case when tg_op='DELETE' then old.organization_id else new.organization_id end;
  if tg_table_name='trucks' then module := 'trucks';
  elsif tg_table_name='drivers' then module := 'drivers';
  elsif tg_op='DELETE' then module := case when old.kind='income' then 'income' else 'expenses' end;
  else module := case when new.kind='income' then 'income' else 'expenses' end;
  end if;
  -- Service operations are authorized by server endpoints before writing.
  if current_user='authenticated' and private.tc_company_role(org) is not null
    and not private.tc_feature(org,module) then
    raise exception 'El módulo no está disponible para esta cuenta' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end;
$$;
revoke all on function private.tc_write_gate() from public,anon,authenticated;

create or replace function private.bump_row_version() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.organization_id<>old.organization_id or new.id<>old.id then raise exception 'No se puede trasladar una ficha entre empresas' using errcode='42501';end if;
 new.row_version:=old.row_version+1;return new;
end;
$$;

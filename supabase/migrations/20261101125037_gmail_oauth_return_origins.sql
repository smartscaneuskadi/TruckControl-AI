-- Preserve one-use, company/user-bound OAuth while returning to the same owned origin.
-- Existing states remain valid and default to the canonical domain in the handler.
alter table private.gmail_oauth_states
  add column return_origin text
  check (return_origin in ('https://truckcontrolai.com','https://www.truckcontrolai.com','https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site'));

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
    insert into private.gmail_oauth_states(state_hash,organization_id,user_id,return_origin)
      values(p_data->>'state_hash',v_org,(p_data->>'user_id')::uuid,coalesce(p_data->>'return_origin','https://truckcontrolai.com'));
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

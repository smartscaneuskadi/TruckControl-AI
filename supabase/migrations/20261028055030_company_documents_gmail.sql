-- TruckControl only. No shared database, auth, storage or secrets with FIXPilot.
-- Keep sensitive integration tables outside the exposed public schema.
alter table public.trucks add column row_version bigint not null default 1;
alter table public.drivers add column row_version bigint not null default 1;
alter table public.finance_entries add column row_version bigint not null default 1;
alter table public.finance_entries add constraint finance_entries_org_id_unique unique (organization_id, id);

create function private.bump_row_version() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.row_version := old.row_version + 1;
  return new;
end;
$$;
revoke all on function private.bump_row_version() from public;
create trigger trucks_version before update on public.trucks for each row execute function private.bump_row_version();
create trigger drivers_version before update on public.drivers for each row execute function private.bump_row_version();
create trigger entries_version before update on public.finance_entries for each row execute function private.bump_row_version();

create table private.company_documents (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 160),
  object_path text not null unique,
  content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  truck_id uuid,
  driver_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  check (object_path like organization_id::text || '/' || id::text || '/%'),
  foreign key (organization_id, truck_id) references public.trucks(organization_id, id) on delete restrict,
  foreign key (organization_id, driver_id) references public.drivers(organization_id, id) on delete restrict
);
create index documents_org_created_idx on private.company_documents(organization_id,created_at desc);

create table private.gmail_connections (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  connected_by uuid not null references auth.users(id) on delete restrict,
  google_subject text not null unique check (char_length(google_subject) between 1 and 255),
  email text not null check (char_length(email) between 3 and 254),
  status text not null default 'connected' check (status in ('connected','reauthorize')),
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  sync_lease_until timestamptz,
  sync_page_token text check (char_length(sync_page_token) <= 4000)
);
create table private.gmail_tokens (
  organization_id uuid primary key references private.gmail_connections(organization_id) on delete cascade,
  -- AES-256-GCM envelope; encryption key exists only in this project's Edge secrets.
  refresh_token_cipher text not null check (char_length(refresh_token_cipher) between 40 and 16000)
);
create table private.gmail_oauth_states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index gmail_states_expiry_idx on private.gmail_oauth_states(expires_at);
create table private.gmail_oauth_pending (
  ticket_hash text primary key check (ticket_hash ~ '^[a-f0-9]{64}$'),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  google_subject text not null,
  email text not null,
  refresh_token_cipher text not null,
  expires_at timestamptz not null default now()+interval '5 minutes'
);
create index gmail_pending_expiry_idx on private.gmail_oauth_pending(expires_at);
create table private.invoice_ai_usage (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  month date not null,
  attempts integer not null default 0 check (attempts between 0 and 100),
  primary key(organization_id,month)
);

create table private.invoice_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  message_id text not null check (char_length(message_id) between 1 and 200),
  attachment_id text not null check (char_length(attachment_id) between 1 and 600),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  document_id uuid not null,
  supplier text not null default '' check (char_length(supplier) <= 160),
  invoice_number text not null default '' check (char_length(invoice_number) <= 100),
  invoice_date date,
  net_cents bigint check (net_cents between 1 and 10000000000),
  tax_cents bigint check (tax_cents between 0 and 10000000000),
  total_cents bigint check (total_cents between 1 and 20000000000),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'needs_review' check (status in ('needs_review','approved')),
  review_note text not null default '' check (char_length(review_note) <= 400),
  finance_entry_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, content_hash),
  unique (organization_id, message_id, attachment_id),
  unique (organization_id, finance_entry_id),
  foreign key (organization_id,document_id) references private.company_documents(organization_id,id) on delete restrict,
  foreign key (organization_id,finance_entry_id) references public.finance_entries(organization_id,id) on delete restrict,
  check ((status = 'approved') = (finance_entry_id is not null))
);
create index invoices_org_created_idx on private.invoice_documents(organization_id,created_at desc);
create index invoices_document_idx on private.invoice_documents(organization_id,document_id);
create index gmail_connected_by_idx on private.gmail_connections(connected_by);

alter table private.company_documents enable row level security;
alter table private.gmail_connections enable row level security;
alter table private.gmail_tokens enable row level security;
alter table private.gmail_oauth_states enable row level security;
alter table private.gmail_oauth_pending enable row level security;
alter table private.invoice_ai_usage enable row level security;
alter table private.invoice_documents enable row level security;
create policy documents_owner on private.company_documents for all to authenticated
  using (organization_id in (select id from public.organizations where owner_id = (select auth.uid())))
  with check (organization_id in (select id from public.organizations where owner_id = (select auth.uid())));
create policy gmail_owner_read on private.gmail_connections for select to authenticated
  using (organization_id in (select id from public.organizations where owner_id = (select auth.uid())));
create policy invoices_owner on private.invoice_documents for all to authenticated
  using (organization_id in (select id from public.organizations where owner_id = (select auth.uid())))
  with check (organization_id in (select id from public.organizations where owner_id = (select auth.uid())));
-- No authenticated/anon grants or policies on encrypted tokens and OAuth state.
revoke all on all tables in schema private from public,anon,authenticated;
grant usage on schema private to authenticated;
grant select,insert on private.company_documents to authenticated;
grant select on private.gmail_connections to authenticated;
grant select,update on private.invoice_documents to authenticated;

create function public.list_company_documents(p_organization_id uuid)
returns setof private.company_documents language sql stable security invoker set search_path = '' as $$
  select * from private.company_documents where organization_id=p_organization_id order by created_at desc limit 500;
$$;
-- Registered downloads use ID lookup, independent of the recent-documents list.
create function public.get_company_document(p_organization_id uuid,p_document_id uuid)
returns setof private.company_documents language sql stable security invoker set search_path = '' as $$
  select * from private.company_documents where organization_id=p_organization_id and id=p_document_id;
$$;
create function public.register_company_document(p_organization_id uuid,p_document jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid := (p_document->>'id')::uuid;
begin
  insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes,truck_id,driver_id)
  values(v_id,p_organization_id,p_document->>'name',p_document->>'object_path',p_document->>'content_type',
    (p_document->>'size_bytes')::integer,nullif(p_document->>'truck_id','')::uuid,nullif(p_document->>'driver_id','')::uuid);
  return v_id;
end;
$$;
create function public.get_company_gmail(p_organization_id uuid)
returns table(email text,status text,connected_at timestamptz,last_sync_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select email,status,connected_at,last_sync_at from private.gmail_connections where organization_id=p_organization_id;
$$;
create function public.list_company_invoices(p_organization_id uuid)
returns setof private.invoice_documents language sql stable security invoker set search_path = '' as $$
  select * from private.invoice_documents where organization_id=p_organization_id order by created_at desc limit 200;
$$;
-- Atomic, idempotent approval. No expense is booked solely from AI output.
create function public.approve_company_invoice(p_organization_id uuid,p_invoice_id uuid,p_entry jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_invoice private.invoice_documents; v_entry uuid; v_net bigint; v_tax bigint; v_total bigint;
begin
  select * into v_invoice from private.invoice_documents
    where organization_id=p_organization_id and id=p_invoice_id for update;
  if not found then raise exception 'Factura no disponible para esta empresa' using errcode='42501'; end if;
  if v_invoice.status='approved' then return v_invoice.finance_entry_id; end if;
  v_net := (p_entry->>'net_cents')::bigint;
  v_tax := (p_entry->>'tax_cents')::bigint;
  v_total := (p_entry->>'total_cents')::bigint;
  if v_invoice.currency <> 'EUR' or v_net is null or v_tax is null or v_total is null
     or v_net <= 0 or v_tax < 0 or v_total <> v_net+v_tax then
    raise exception 'Revisa la moneda, la base, el IVA y el total de la factura';
  end if;
  v_entry := gen_random_uuid();
  insert into public.finance_entries(id,organization_id,truck_id,kind,concept,date,amount_cents,category,payment_status,distance_km)
  values(v_entry,p_organization_id,(p_entry->>'truck_id')::uuid,'expense',p_entry->>'concept',
    (p_entry->>'date')::date,v_net,p_entry->>'category','pending',0);
  update private.invoice_documents set status='approved',finance_entry_id=v_entry,
    net_cents=v_net,tax_cents=v_tax,total_cents=v_total,invoice_date=(p_entry->>'date')::date
    where organization_id=p_organization_id and id=p_invoice_id;
  return v_entry;
end;
$$;

-- Internal integration operations. SECURITY INVOKER, service_role only.
-- The Edge function must authenticate the user and verify organization ownership
-- before calling this endpoint. Callback state is consumed atomically once.
create function public.gmail_server(p_action text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_org uuid := nullif(p_data->>'organization_id','')::uuid; v_state private.gmail_oauth_states; v_result jsonb; v_doc jsonb;
begin
  case p_action
  when 'state_create' then
    delete from private.gmail_oauth_states where expires_at < now();
    if not exists(select 1 from public.organizations where id=v_org and owner_id=(p_data->>'user_id')::uuid) then
      raise exception 'Empresa no disponible' using errcode='42501';
    end if;
    insert into private.gmail_oauth_states(state_hash,organization_id,user_id)
      values(p_data->>'state_hash',v_org,(p_data->>'user_id')::uuid);
    return '{}'::jsonb;
  when 'state_consume' then
    delete from private.gmail_oauth_states where state_hash=p_data->>'state_hash' returning * into v_state;
    if not found or v_state.expires_at < now() then return null; end if;
    if not exists(select 1 from public.organizations where id=v_state.organization_id and owner_id=v_state.user_id) then return null; end if;
    return to_jsonb(v_state);
  when 'pending_create' then
    delete from private.gmail_oauth_pending where expires_at < now();
    insert into private.gmail_oauth_pending(ticket_hash,organization_id,user_id,google_subject,email,refresh_token_cipher)
      values(p_data->>'ticket_hash',v_org,(p_data->>'user_id')::uuid,p_data->>'google_subject',p_data->>'email',p_data->>'refresh_token_cipher');
    return '{}'::jsonb;
  when 'pending_consume' then
    delete from private.gmail_oauth_pending where ticket_hash=p_data->>'ticket_hash' and organization_id=v_org
      and user_id=(p_data->>'user_id')::uuid and expires_at>now()
      and exists(select 1 from public.organizations where id=v_org and owner_id=(p_data->>'user_id')::uuid)
      returning to_jsonb(private.gmail_oauth_pending.*) into v_result;
    return v_result;
  when 'connect' then
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
  when 'credentials' then
    select jsonb_build_object('email',c.email,'user_id',c.connected_by,'google_subject',c.google_subject,'refresh_token_cipher',t.refresh_token_cipher,'page_token',c.sync_page_token)
      into v_result from private.gmail_connections c join private.gmail_tokens t using(organization_id)
      where c.organization_id=v_org and c.status='connected';
    return v_result;
  when 'disconnect' then
    delete from private.gmail_oauth_states where organization_id=v_org;
    delete from private.gmail_oauth_pending where organization_id=v_org;
    delete from private.gmail_connections where organization_id=v_org;
    return '{}'::jsonb;
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
  when 'reserve_ai' then
    insert into private.invoice_ai_usage(organization_id,month,attempts) values(v_org,date_trunc('month',now())::date,1)
      on conflict(organization_id,month) do update set attempts=private.invoice_ai_usage.attempts+1
      where private.invoice_ai_usage.attempts<100 returning to_jsonb(attempts) into v_result;
    return to_jsonb(v_result is not null);
  when 'record_invoice' then
    v_doc := p_data->'document';
    insert into private.company_documents(id,organization_id,name,object_path,content_type,size_bytes)
      values((v_doc->>'id')::uuid,v_org,v_doc->>'name',v_doc->>'object_path',v_doc->>'content_type',(v_doc->>'size_bytes')::integer);
    insert into private.invoice_documents(organization_id,message_id,attachment_id,content_hash,document_id,
      supplier,invoice_number,invoice_date,net_cents,tax_cents,total_cents,currency,review_note)
      values(v_org,p_data->>'message_id',p_data->>'attachment_id',p_data->>'content_hash',(v_doc->>'id')::uuid,
      coalesce(p_data->>'supplier',''),coalesce(p_data->>'invoice_number',''),nullif(p_data->>'invoice_date','')::date,
      (p_data->>'net_cents')::bigint,(p_data->>'tax_cents')::bigint,(p_data->>'total_cents')::bigint,
      coalesce(p_data->>'currency','EUR'),coalesce(p_data->>'review_note','')) returning to_jsonb(private.invoice_documents.*) into v_result;
    return v_result;
  else raise exception 'Unsupported internal operation';
  end case;
end;
$$;

revoke all on function public.list_company_documents(uuid),public.get_company_document(uuid,uuid),public.register_company_document(uuid,jsonb),
  public.get_company_gmail(uuid),public.list_company_invoices(uuid),public.approve_company_invoice(uuid,uuid,jsonb),
  public.gmail_server(text,jsonb) from public,anon,authenticated;
grant execute on function public.list_company_documents(uuid),public.get_company_document(uuid,uuid),public.register_company_document(uuid,jsonb),
  public.get_company_gmail(uuid),public.list_company_invoices(uuid),public.approve_company_invoice(uuid,uuid,jsonb) to authenticated;

do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant usage on schema private to service_role;
    grant select,insert,update,delete on public.organizations,public.trucks,public.drivers,public.finance_entries to service_role;
    grant select,insert,update,delete on all tables in schema private to service_role;
    grant execute on function public.gmail_server(text,jsonb) to service_role;
  end if;
end $$;

-- Storage exists in Supabase; lightweight PostgreSQL tests may omit it.
-- No public URLs, no replacement of existing documents, no bucket shared with FIXPilot.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
      values('truckcontrol-documents','truckcontrol-documents',false,10485760,
        array['application/pdf','image/jpeg','image/png','image/webp']);
    execute $policy$create policy truckcontrol_documents_select on storage.objects for select to authenticated
      using (bucket_id='truckcontrol-documents' and split_part(name,'/',1) in
        (select id::text from public.organizations where owner_id=(select auth.uid())))$policy$;
    execute $policy$create policy truckcontrol_documents_insert on storage.objects for insert to authenticated
      with check (bucket_id='truckcontrol-documents' and split_part(name,'/',1) in
        (select id::text from public.organizations where owner_id=(select auth.uid())))$policy$;
  end if;
end $$;

-- REVIEW PROPOSAL ONLY. NOT A MIGRATION. DO NOT APPLY TO PRODUCTION.
-- Depends on the reviewed PR60 schema. Create a CLI-named additive migration
-- only after isolated tests, storage/Edge acceptance and official approval.
-- No TicketBAI certification, fiscal issuance, email or payment enablement.
-- The storage bucket is exclusively for subscription fiscal PDFs, not fleet docs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('tc-subscription-fiscal','tc-subscription-fiscal',false,10485760,array['application/pdf'])
  on conflict(id) do nothing;
do $bucket$
begin
  if not exists(select 1 from storage.buckets where id='tc-subscription-fiscal'
    and public=false and file_size_limit between 8 and 10485760
    and allowed_mime_types=array['application/pdf']) then
    raise exception 'manual_document_private_bucket_required';
  end if;
end;$bucket$;
-- A restrictive guard denies this bucket even if an older fleet policy is broad.
-- Other buckets are unaffected. NO client table privilege or permissive policy.
create policy tc_subscription_fiscal_backend_only on storage.objects as restrictive
  for all to anon,authenticated
  using(bucket_id<>'tc-subscription-fiscal')
  with check(bucket_id<>'tc-subscription-fiscal');
revoke all on private.tc_manual_subscription_invoice_documents from service_role;
create table private.tc_manual_subscription_document_runtime(
  id boolean primary key default true check(id),
  uploads_enabled boolean not null default false
);
insert into private.tc_manual_subscription_document_runtime(id,uploads_enabled) values(true,false);
create table private.tc_manual_subscription_document_reservations(
  operation_id uuid primary key,
  document_id uuid not null unique default gen_random_uuid(),
  task_id uuid not null references private.tc_manual_subscription_invoice_tasks(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  -- No FK to auth.sessions: logout/revocation must remain possible.
  session_id uuid not null,
  expected_version bigint not null check(expected_version between 1 and 9007199254740990),
  object_key text not null unique check(char_length(object_key)<=250),
  nonce uuid not null default gen_random_uuid(),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes integer not null check(size_bytes between 8 and 10485760),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 minutes'
);
create index tc_manual_document_reservation_actor_idx
  on private.tc_manual_subscription_document_reservations(actor_id,created_at);
create table private.tc_manual_subscription_document_access(
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  document_id uuid not null references private.tc_manual_subscription_invoice_documents(id) on delete restrict,
  task_id uuid not null references private.tc_manual_subscription_invoice_tasks(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  session_id uuid not null,
  created_at timestamptz not null default now()
);
create index tc_manual_document_access_actor_idx
  on private.tc_manual_subscription_document_access(actor_id,created_at);
alter table private.tc_manual_subscription_document_runtime enable row level security;
alter table private.tc_manual_subscription_document_reservations enable row level security;
alter table private.tc_manual_subscription_document_access enable row level security;
revoke all on private.tc_manual_subscription_document_runtime,
  private.tc_manual_subscription_document_reservations,
  private.tc_manual_subscription_document_access from public,anon,authenticated,service_role;
create policy tc_manual_document_runtime_denied on private.tc_manual_subscription_document_runtime
  as restrictive for all to public using(false) with check(false);
create policy tc_manual_document_reservations_denied on private.tc_manual_subscription_document_reservations
  as restrictive for all to public using(false) with check(false);
create policy tc_manual_document_access_denied on private.tc_manual_subscription_document_access
  as restrictive for all to public using(false) with check(false);
create trigger tc_manual_document_reservations_immutable
 before update or delete or truncate on private.tc_manual_subscription_document_reservations
 for each statement execute function private.tc_manual_subscription_intake_reject_mutation();
create trigger tc_manual_document_access_immutable
 before update or delete or truncate on private.tc_manual_subscription_document_access
 for each statement execute function private.tc_manual_subscription_intake_reject_mutation();

-- Privileged backend adapter only. Each request ALSO verifies the caller JWT
-- via Auth getUser and the existing admin RPC before entering this function.
-- Recheck live membership/user/session here, not caller-supplied role metadata.
create function private.tc_manual_subscription_document_server(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $document$
declare
 actor uuid; sid uuid; task_id uuid; operation uuid; expected bigint;
 task private.tc_manual_subscription_invoice_tasks; snapshot jsonb;
 reservation private.tc_manual_subscription_document_reservations;
 document private.tc_manual_subscription_invoice_documents;
 object_id uuid; object_key text; wanted_hash text; wanted_size integer;
begin
 if p_action is null or p_action not in('reserve','complete','download')
   or p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>8192 then
   raise exception 'manual_document_invalid' using errcode='22023';
 end if;
 actor:=(p_data->>'actor_id')::uuid; sid:=(p_data->>'session_id')::uuid;
 task_id:=(p_data->>'task_id')::uuid; operation:=(p_data->>'operation_id')::uuid;
 expected:=(p_data->>'expected_version')::bigint;
 if actor is null or sid is null or operation is null or task_id is null
   or expected is null or expected not between 1 and 9007199254740990
   or not exists(select 1 from private.tc_admins a join auth.users u on u.id=a.user_id
     where a.user_id=actor and u.email_confirmed_at is not null and u.deleted_at is null
       and coalesce(u.banned_until,'-infinity'::timestamptz)<=now())
   or not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=actor) then
   raise exception 'manual_document_operator_required' using errcode='42501';
 end if;
 select * into task from private.tc_manual_subscription_invoice_tasks where id=task_id for update;
 if not found then raise exception 'manual_document_task_denied' using errcode='42501'; end if;
 snapshot:=private.tc_manual_subscription_invoice_dto(task_id);
 if (snapshot->>'row_version')::bigint<>expected then
   raise exception 'manual_document_version_conflict' using errcode='40001';
 end if;
 if p_action='download' then
   if p_data-array['actor_id','session_id','task_id','operation_id','expected_version','document_id']<>'{}' then
     raise exception 'manual_document_invalid' using errcode='22023';
   end if;
   select * into document from private.tc_manual_subscription_invoice_documents
     where id=(p_data->>'document_id')::uuid and tc_manual_subscription_invoice_documents.task_id=task.id;
   if not found then raise exception 'manual_document_denied' using errcode='42501'; end if;
   perform pg_advisory_xact_lock(hashtextextended(actor::text,61009));
   if (select count(*) from private.tc_manual_subscription_document_access a
       where a.actor_id=actor and a.created_at>now()-interval '1 hour')>=100 then
     raise exception 'manual_document_rate_limit' using errcode='54000';
   end if;
   -- Log every authorized attempt, including repeated operation IDs. Reusing an
   -- operation must not bypass the read limiter or claim mail delivery.
   insert into private.tc_manual_subscription_document_access(operation_id,document_id,task_id,actor_id,session_id)
     values(operation,document.id,task.id,actor,sid);
 else
   if not coalesce((select uploads_enabled from private.tc_manual_subscription_document_runtime where id),false)
     or snapshot->>'status'<>'awaiting_issue' or (snapshot->>'buyer_validated')::boolean is distinct from true then
     raise exception 'manual_document_upload_unavailable' using errcode='42501';
   end if;
   wanted_hash:=p_data->>'sha256'; wanted_size:=(p_data->>'size_bytes')::integer;
   if wanted_hash is null or wanted_hash !~ '^[0-9a-f]{64}$'
     or wanted_size is null or wanted_size not between 8 and 10485760 then
     raise exception 'manual_document_invalid' using errcode='22023';
   end if;
   if p_action='reserve' then
     if p_data-array['actor_id','session_id','task_id','operation_id','expected_version','sha256','size_bytes']<>'{}' then
       raise exception 'manual_document_invalid' using errcode='22023';
     end if;
     -- Serialize reservation quota for a single actor across different tasks.
     perform pg_advisory_xact_lock(hashtextextended(actor::text,61008));
     select * into reservation from private.tc_manual_subscription_document_reservations where operation_id=operation;
     if found then
       if reservation.actor_id<>actor or reservation.session_id<>sid or reservation.task_id<>task.id
         or reservation.expected_version<>expected or reservation.sha256<>wanted_hash
         or reservation.size_bytes<>wanted_size or reservation.expires_at<now() then
         raise exception 'manual_document_conflicting_replay' using errcode='23514';
       end if;
     else
       if (select count(*) from private.tc_manual_subscription_document_reservations r
         where r.actor_id=actor and r.created_at>now()-interval '1 hour')>=20 then
         raise exception 'manual_document_rate_limit' using errcode='54000';
       end if;
       object_id:=gen_random_uuid();
       object_key:='subscription-invoices/'||task.buyer_company_id||'/'||task.id||'/'||object_id||'.pdf';
       insert into private.tc_manual_subscription_document_reservations(
         operation_id,document_id,task_id,actor_id,session_id,expected_version,object_key,sha256,size_bytes
       ) values(operation,object_id,task.id,actor,sid,expected,object_key,wanted_hash,wanted_size)
       returning * into reservation;
     end if;
     return jsonb_build_object('operation_id',reservation.operation_id,'nonce',reservation.nonce,
       'document_id',reservation.document_id,'task_id',reservation.task_id,'object_key',reservation.object_key,
       'sha256',reservation.sha256,'size_bytes',reservation.size_bytes);
   end if;
   if p_data-array['actor_id','session_id','task_id','operation_id','expected_version','sha256','size_bytes','nonce','document_id']<>'{}' then
     raise exception 'manual_document_invalid' using errcode='22023';
   end if;
   select * into reservation from private.tc_manual_subscription_document_reservations where operation_id=operation;
   if not found or reservation.actor_id<>actor or reservation.session_id<>sid or reservation.task_id<>task.id
     or reservation.expected_version<>expected or reservation.sha256<>wanted_hash or reservation.size_bytes<>wanted_size
     or reservation.document_id is distinct from (p_data->>'document_id')::uuid
     or reservation.nonce is distinct from (p_data->>'nonce')::uuid or reservation.expires_at<now() then
     raise exception 'manual_document_reservation_required' using errcode='23514';
   end if;
   -- This metadata check supplements (does not replace) readback+SHA256 in Edge.
   -- Only the service-role backend can complete; browsers never submit proof.
   if not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id
     where b.id='tc-subscription-fiscal' and b.public=false
       and o.name=reservation.object_key and o.metadata->>'mimetype'='application/pdf'
       and (o.metadata->>'size')::bigint=reservation.size_bytes) then
     raise exception 'manual_document_private_object_missing' using errcode='23514';
   end if;
   insert into private.tc_manual_subscription_invoice_documents(id,task_id,object_key,sha256,size_bytes)
     values(reservation.document_id,task.id,reservation.object_key,wanted_hash,wanted_size)
     on conflict(id) do nothing;
   select * into document from private.tc_manual_subscription_invoice_documents where id=reservation.document_id;
   if document.task_id<>task.id or document.object_key<>reservation.object_key
     or document.sha256<>wanted_hash or document.size_bytes<>wanted_size then
     raise exception 'manual_document_conflicting_evidence' using errcode='23514';
   end if;
 end if;
 return jsonb_build_object('document_id',document.id,'task_id',document.task_id,
   'object_key',document.object_key,'sha256',document.sha256,'size_bytes',document.size_bytes);
end;$document$;
revoke all on function private.tc_manual_subscription_document_server(text,jsonb) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.tc_manual_subscription_document_server(text,jsonb) to service_role;
create function public.tc_manual_subscription_document_server(p_action text,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $wrapper$
 select private.tc_manual_subscription_document_server(p_action,p_data);
$wrapper$;
revoke all on function public.tc_manual_subscription_document_server(text,jsonb) from public,anon,authenticated;
grant execute on function public.tc_manual_subscription_document_server(text,jsonb) to service_role;

-- Acceptance BEFORE activation:
-- * isolated PGlite/Postgres schema, role/tenant/revoked-session/CAS/replay tests;
-- * private storage upload/readback on synthetic PDF, no overwrite, unknown-write
--   recovery with same reservation, zero PII cache and authorized proxy download;
-- * deploy reviewed Edge source and verify its exact dependencies;
-- * only after recorded native acceptance: consciously change the existing admin
--   capability projection and this private flag. They remain false in this file.
-- * human validates genuine GDTaller/TicketBAI content separately; a PDF header
--   and hash prove transport/integrity only, never issuance or fiscal validity.
-- No deletion compensation: uncertain objects stay private pending investigation.

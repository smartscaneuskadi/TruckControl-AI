-- Isolated CI model of the managed Auth/Storage boundary, never production.
-- No GoTrue server, Storage API, Vault, provider credential or network extension.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(
 id uuid primary key,email text,phone text,email_confirmed_at timestamptz,
 phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,
 raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb not null default '{}'
);
create table auth.sessions(
 id uuid primary key,user_id uuid not null references auth.users(id),
 not_after timestamptz
);
create function auth.uid() returns uuid language sql stable as $uid$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$uid$;
grant usage on schema public,auth to anon,authenticated,service_role;
create schema extensions;
create extension pgcrypto with schema extensions;

-- Only catalog metadata is modeled: no object-service credentials or real PDFs.
create schema storage;
create table storage.buckets(
 id text primary key,name text not null,public boolean not null default false,
 file_size_limit bigint,allowed_mime_types text[]
);
create table storage.objects(
 id uuid primary key default gen_random_uuid(),
 bucket_id text not null references storage.buckets(id),name text not null,
 owner uuid,metadata jsonb not null default '{}',unique(bucket_id,name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
grant select on storage.buckets to anon,authenticated,service_role;

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
let db: PGlite;
const admin = "fc100000-0000-4000-8000-000000000001",
  customer = "fc100000-0000-4000-8000-000000000002",
  org = "fc200000-0000-4000-8000-000000000001";
const cid = "468881730124-synthetic.apps.googleusercontent.com",
  secret = "GOCSPX-synthetic-provider-test-000000",
  replacement = "GOCSPX-synthetic-provider-test-111111";
async function as<T>(
  actor: string | null,
  fn: () => Promise<T>,
  role = "authenticated",
) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor ?? "",
  ]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function call(actor: string, action = "status", data: unknown = {}) {
  return as(
    actor,
    async () =>
      (
        await db.query<{ data: Record<string, unknown> }>(
          "select public.tc_provider_control($1,$2::jsonb) as data",
          [action, JSON.stringify(data)],
        )
      ).rows[0].data,
  );
}
const payload = (value = secret) => ({ client_id: cid, client_secret: value });
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;
 create schema extensions;create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat('ab',n),'hex')$$;
 create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text,description text,created_at timestamptz default now(),updated_at timestamptz default now());
 create view vault.decrypted_secrets as select *,secret as decrypted_secret from vault.secrets;
 create function vault.create_secret(new_secret text,new_name text default null,new_description text default '',new_key_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;begin insert into vault.secrets(name,secret,description) values(new_name,new_secret,new_description) returning id into result;return result;end;$$;
 create function vault.update_secret(secret_id uuid,new_secret text default null,new_name text default null,new_description text default null,new_key_id uuid default null) returns void language sql security definer set search_path='' as $$update vault.secrets set secret=coalesce(new_secret,secret),name=coalesce(new_name,name),description=coalesce(new_description,description),updated_at=now() where id=secret_id;$$;`);
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'pedidos@smartscaneuskadi.com',now()),($2,'provider-customer@example.com',now())",
    [admin, customer],
  );
  await db.query(
    "insert into private.tc_admins(user_id) values($1) on conflict do nothing",
    [admin],
  );
  await db.query(
    "insert into public.organizations(id,owner_id,name) values($1,$2,'Empresa ficticia')",
    [org, customer],
  );
  await db.query(
    "update vault.secrets set secret='synthetic-misplaced-credential' where name='truckcontrol_google_client_id'",
  );
  await db.query(
    "update vault.secrets set secret='synthetic-previous-value' where name='truckcontrol_google_client_secret'",
  );
  await db.query(
    "update vault.secrets set secret=$1 where name='truckcontrol_gmail_token_encryption_key'",
    ["f".repeat(64)],
  );
  // Match hosted Vault: runtime can read metadata, but only official functions mutate it.
  await db.exec(`create role provider_runtime nologin bypassrls;
   grant usage on schema private,auth,vault to provider_runtime;
   grant select on auth.users,private.gmail_connections,private.gmail_oauth_states,private.gmail_oauth_pending,
    private.tc_auth_mail_settings,private.tc_provider_settings,private.tc_settings,vault.secrets,vault.decrypted_secrets to provider_runtime;
   grant insert on private.tc_admin_audit to provider_runtime;
   grant execute on function private.tc_is_admin() to provider_runtime;
   alter function private.tc_provider_control(text,jsonb) owner to provider_runtime;`);
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("administración segura de proveedores", () => {
  it("funciona sin conceder UPDATE de Vault al ejecutor del backend", async () => {
    const row = (
      await db.query<{ can_read: boolean; can_update: boolean }>(
        "select has_table_privilege('provider_runtime','vault.secrets','select') can_read,has_table_privilege('provider_runtime','vault.secrets','update') can_update",
      )
    ).rows[0];
    expect(row).toEqual({ can_read: true, can_update: false });
  });
  it("el estado no devuelve secretos ni un valor indebido guardado como ID", async () => {
    const s = await call(admin);
    expect(JSON.stringify(s)).not.toContain("synthetic-misplaced");
    expect((s.google as { client_id: string | null }).client_id).toBeNull();
  });
  it("un cliente no puede consultar ni modificar la configuración global", async () => {
    await expect(call(customer)).rejects.toThrow();
    await expect(call(customer, "set_google", payload())).rejects.toThrow();
  });
  it("un anónimo no puede ejecutar la API", async () => {
    await expect(
      as(
        null,
        () => db.query("select public.tc_provider_control('status','{}')"),
        "anon",
      ),
    ).rejects.toThrow();
  });
  it("un administrador sin correo verificado o bloqueado pierde acceso", async () => {
    await db.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [admin],
    );
    await expect(call(admin)).rejects.toThrow();
    await db.query(
      "update auth.users set email_confirmed_at=now(),banned_until=now()+interval '1 day' where id=$1",
      [admin],
    );
    await expect(call(admin)).rejects.toThrow();
    await db.query("update auth.users set banned_until=null where id=$1", [
      admin,
    ]);
  });
  it("rechaza entradas vacías, de otro proyecto, enmascaradas o con campos adicionales", async () => {
    for (const value of [
      {},
      null,
      { client_id: cid },
      {
        client_id: "123-other.apps.googleusercontent.com",
        client_secret: secret,
      },
      { client_id: cid, client_secret: "GOCSPX-******" },
      { ...payload(), api_key: "synthetic" },
    ])
      await expect(call(admin, "set_google", value)).rejects.toThrow();
  });
  it("guarda la pareja sin devolver el secreto y deja intacta la clave AES", async () => {
    const s = await call(admin, "set_google", payload());
    expect((s.google as { configured: boolean }).configured).toBe(true);
    expect(JSON.stringify(s)).not.toContain(secret);
    const aes = (
      await db.query<{ secret: string }>(
        "select secret from vault.secrets where name='truckcontrol_gmail_token_encryption_key'",
      )
    ).rows[0].secret;
    expect(aes).toBe("f".repeat(64));
  });
  it("conserva las versiones previas en el almacén y audita solo metadatos", async () => {
    const rows = (
      await db.query<{ name: string; secret: string }>(
        "select name,secret from vault.secrets where name like 'truckcontrol_google_client%previous_%'",
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.secret === "synthetic-previous-value")).toBe(
      true,
    );
    const audit = (
      await db.query(
        "select details from private.tc_admin_audit where action='provider_google_set'",
      )
    ).rows;
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(secret);
  });
  it("repetir un guardado confirmado no crea versiones ni auditoría duplicadas", async () => {
    await call(admin, "set_google", payload());
    expect(
      (
        await db.query(
          "select id from private.tc_admin_audit where action='provider_google_set'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("exige confirmación para sustituir una pareja válida", async () => {
    await expect(
      call(admin, "set_google", payload(replacement)),
    ).rejects.toThrow(/Confirma/);
    expect(
      (
        await db.query<{ secret: string }>(
          "select secret from vault.secrets where name='truckcontrol_google_client_secret'",
        )
      ).rows[0].secret,
    ).toBe(secret);
  });
  it("la sustitución confirmada conserva también la pareja anterior", async () => {
    const s = await call(admin, "set_google", {
      ...payload(replacement),
      replace_existing: true,
    });
    expect(JSON.stringify(s)).not.toContain(replacement);
    expect(
      (
        await db.query(
          "select id from vault.secrets where name like 'truckcontrol_google_client%previous_%'",
        )
      ).rows,
    ).toHaveLength(4);
  });
  it("no cambia las credenciales si existen buzones vinculados", async () => {
    await db.query(
      "insert into private.gmail_connections(organization_id,connected_by,google_subject,email) values($1,$2,'synthetic-google','synthetic@example.com')",
      [org, customer],
    );
    await expect(
      call(admin, "set_google", { ...payload(), replace_existing: true }),
    ).rejects.toThrow(/mantenimiento/);
    expect(JSON.stringify(await call(admin))).not.toContain(
      "synthetic@example.com",
    );
    await db.exec("delete from private.gmail_connections");
  });
  it("protege las autorizaciones OAuth en curso", async () => {
    await db.query(
      "insert into private.gmail_oauth_states(state_hash,organization_id,user_id) values($1,$2,$3)",
      ["c".repeat(64), org, customer],
    );
    await expect(
      call(admin, "set_google", { ...payload(), replace_existing: true }),
    ).rejects.toThrow(/mantenimiento/);
    await db.exec("delete from private.gmail_oauth_states");
  });
  it("la ausencia del almacén falla de forma cerrada", async () => {
    await db.exec("alter schema vault rename to vault_unavailable");
    const s = await call(admin);
    expect((s.google as { vault_available: boolean }).vault_available).toBe(
      false,
    );
    await expect(call(admin, "set_google", payload())).rejects.toThrow(
      /almacén seguro/,
    );
    await db.exec("alter schema vault_unavailable rename to vault");
  });
  it("la fachada pública es invoker y el lector privilegiado vive en private", async () => {
    const rows = (
      await db.query<{ schema: string; prosecdef: boolean }>(
        "select n.nspname as schema,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='tc_provider_control'",
      )
    ).rows;
    expect(rows.find((r) => r.schema === "public")?.prosecdef).toBe(false);
    expect(rows.find((r) => r.schema === "private")?.prosecdef).toBe(true);
  });
});

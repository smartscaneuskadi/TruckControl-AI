import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const migrationName = "20261101125406_gmail_provider_vault_config.sql";
const migration = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
const org = "20000000-0000-4000-8000-000000000093";
const user = "10000000-0000-4000-8000-000000000093";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create schema vault;create table vault.secrets(name text primary key,decrypted_secret text);
    create view vault.decrypted_secrets as select name,decrypted_secret from vault.secrets;
    create function vault.create_secret(new_secret text,new_name text default null,new_description text default '',new_key_id uuid default null) returns uuid language plpgsql as $$
      begin insert into vault.secrets values(new_name,new_secret);return gen_random_uuid();end $$;`);
  for (const name of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql") && f < migrationName)
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  // Deterministic bytes are used only by this local provisioning test; production uses pgcrypto.
  await db.exec(`create schema if not exists extensions;
    create function extensions.gen_random_bytes(size integer) returns bytea language sql as $$ select decode(repeat('11',size),'hex') $$;`);
  await db.query("insert into auth.users values($1)", [user]);
  await db.query(
    "insert into public.organizations(id,owner_id,name) values($1,$2,'Empresa ficticia Vault')",
    [org, user],
  );
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback");
});
afterAll(async () => {
  await db?.close();
});

describe("provisión de credenciales sin rotar ni sustituir claves anteriores", () => {
  it("genera 32 bytes en el servidor y deja OAuth pendiente sin cambiar controles de acceso", async () => {
    const before = await db.query(
      "select enforce_access,registration_open,payments_enabled from private.tc_settings",
    );
    await db.exec(migration);
    const r = await db.query<{ name: string; decrypted_secret: string }>(
      "select name,decrypted_secret from vault.secrets",
    );
    const values = Object.fromEntries(
      r.rows.map((r) => [r.name, r.decrypted_secret]),
    );
    expect(Object.keys(values)).toHaveLength(3);
    expect(
      Buffer.from(values.truckcontrol_gmail_token_encryption_key, "base64")
        .length,
    ).toBe(32);
    expect(values.truckcontrol_google_client_id).toBe("pending");
    expect(values.truckcontrol_google_client_secret).toBe("pending");
    expect(
      (
        await db.query(
          "select enforce_access,registration_open,payments_enabled from private.tc_settings",
        )
      ).rows,
    ).toEqual(before.rows);
  });
  it("conserva una clave AES y un cliente OAuth ya configurados", async () => {
    await db.exec(
      "insert into vault.secrets values('truckcontrol_gmail_token_encryption_key','existing-key'),('truckcontrol_google_client_id','existing-client'),('truckcontrol_google_client_secret','existing-secret')",
    );
    const before = (await db.query("select * from vault.secrets order by name"))
      .rows;
    await db.exec(migration);
    expect(
      (await db.query("select * from vault.secrets order by name")).rows,
    ).toEqual(before);
  });
  it("no crea otra clave de cifrado cuando existen tokens y la original falta", async () => {
    await db.query(
      "insert into private.gmail_connections(organization_id,connected_by,google_subject,email,status) values($1,$2,'synthetic-subject','mail@example.com','connected')",
      [org, user],
    );
    await db.query("insert into private.gmail_tokens values($1,$2)", [
      org,
      "v1." + "x".repeat(70),
    ]);
    await db.exec(migration);
    expect(
      (
        await db.query(
          "select * from vault.secrets where name='truckcontrol_gmail_token_encryption_key'",
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from private.gmail_tokens")).rows,
    ).toHaveLength(1);
  });
});

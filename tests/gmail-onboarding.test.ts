import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

let db: PGlite;
const user = "10000000-0000-4000-8000-000000000091";
const other = "10000000-0000-4000-8000-000000000092";
const org = "20000000-0000-4000-8000-000000000091";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create schema vault;create table vault.secrets(name text primary key,decrypted_secret text);
    create view vault.decrypted_secrets as select name,decrypted_secret from vault.secrets;
    insert into vault.secrets values ('truckcontrol_google_client_id','synthetic-id'),('truckcontrol_google_client_secret','synthetic-secret'),('truckcontrol_gmail_token_encryption_key','synthetic-aes-key'),('unrelated_provider','must-not-be-returned');`);
  for (const name of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.query("insert into auth.users values($1),($2)", [user, other]);
  await db.query(
    "insert into public.organizations(id,owner_id,name) values($1,$2,'Empresa ficticia OAuth')",
    [org, user],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
async function as<T>(role: string, fn: () => Promise<T>) {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function server(action: string, data: object) {
  const r = await db.query<{ result: Record<string, unknown> | null }>(
    "select public.gmail_server($1,$2::jsonb) as result",
    [action, JSON.stringify(data)],
  );
  return r.rows[0].result;
}
describe("retorno OAuth y secretos de proveedor", () => {
  it("un token que exige reautorización solo se recupera para desconectar, nunca para importar", async () => {
    await db.query(
      "insert into private.gmail_connections(organization_id,connected_by,google_subject,email,status) values($1,$2,'synthetic-subject','mail@example.com','reauthorize')",
      [org, user],
    );
    await db.query("insert into private.gmail_tokens values($1,$2)", [
      org,
      "v1." + "x".repeat(70),
    ]);
    await as("service_role", async () => {
      expect(await server("credentials", { organization_id: org })).toBeNull();
      expect(
        await server("credentials", {
          organization_id: org,
          purpose: "disconnect",
        }),
      ).toMatchObject({ google_subject: "synthetic-subject", user_id: user });
    });
  });
  it("recuerda solo un origen propio y consume el estado una vez", async () => {
    await as("service_role", async () => {
      await server("state_create", {
        organization_id: org,
        user_id: user,
        state_hash: "a".repeat(64),
        return_origin: "https://www.truckcontrolai.com",
      });
      expect(
        await server("state_consume", { state_hash: "a".repeat(64) }),
      ).toMatchObject({
        organization_id: org,
        user_id: user,
        return_origin: "https://www.truckcontrolai.com",
      });
      expect(
        await server("state_consume", { state_hash: "a".repeat(64) }),
      ).toBeNull();
    });
  });
  it("rechaza destinos ajenos y usuarios sin administración de la empresa", async () => {
    await as("service_role", async () => {
      await expect(
        server("state_create", {
          organization_id: org,
          user_id: user,
          state_hash: "b".repeat(64),
          return_origin: "https://evil.example",
        }),
      ).rejects.toThrow();
      await expect(
        server("state_create", {
          organization_id: org,
          user_id: other,
          state_hash: "c".repeat(64),
          return_origin: "https://truckcontrolai.com",
        }),
      ).rejects.toThrow("Empresa no disponible");
    });
  });
  it("conserva compatibilidad de estados sin origen y deniega un estado caducado", async () => {
    await as("service_role", async () => {
      await server("state_create", {
        organization_id: org,
        user_id: user,
        state_hash: "d".repeat(64),
      });
      expect(
        await server("state_consume", { state_hash: "d".repeat(64) }),
      ).toMatchObject({ return_origin: "https://truckcontrolai.com" });
    });
    await db.query(
      "insert into private.gmail_oauth_states(state_hash,organization_id,user_id,expires_at) values($1,$2,$3,now()-interval '1 minute')",
      ["e".repeat(64), org, user],
    );
    expect(
      await as("service_role", () =>
        server("state_consume", { state_hash: "e".repeat(64) }),
      ),
    ).toBeNull();
  });
  it("anon y authenticated no pueden leer claves por SQL o por RPC", async () => {
    for (const role of ["anon", "authenticated"])
      await as(role, async () => {
        await expect(
          db.query("select public.gmail_runtime_config()"),
        ).rejects.toThrow("permission denied");
        await expect(
          db.query("select private.tc_gmail_runtime_config()"),
        ).rejects.toThrow("permission denied");
        await expect(
          db.query("select * from vault.decrypted_secrets"),
        ).rejects.toThrow("permission denied");
        await expect(
          db.query("select * from private.gmail_oauth_states"),
        ).rejects.toThrow("permission denied");
      });
  });
  it("solo el servidor obtiene tres valores nombrados sin acceso general al almacén", async () => {
    await as("service_role", async () => {
      const r = await db.query<{ config: object }>(
        "select public.gmail_runtime_config() as config",
      );
      expect(r.rows[0].config).toEqual({
        client_id: "synthetic-id",
        client_secret: "synthetic-secret",
        encryption_key: "synthetic-aes-key",
      });
      await expect(
        db.query("select * from vault.decrypted_secrets"),
      ).rejects.toThrow("permission denied");
    });
    const r = await db.query<{ name: string; definer: boolean }>(
      "select proname as name,prosecdef as definer from pg_proc where oid in ('public.gmail_runtime_config()'::regprocedure,'private.tc_gmail_runtime_config()'::regprocedure)",
    );
    expect(r.rows.find((r) => r.name === "gmail_runtime_config")?.definer).toBe(
      false,
    );
    expect(
      r.rows.find((r) => r.name === "tc_gmail_runtime_config")?.definer,
    ).toBe(true);
  });
});

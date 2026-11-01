import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "supabase/migrations/20261101203215_resend_admin_setup.sql",
  "utf8",
);
const transport =
  "create or replace function private.tc_resend_admin_http" +
  source
    .split("create function private.tc_resend_admin_http")[1]
    .split("create function private.tc_resend_admin_setup")[0];
const domain = "facturas.truckcontrolai.com";
const did = "d1000000-0000-4000-8000-000000000001";
const wid = "d1000000-0000-4000-8000-000000000002";
const endpoint =
  "https://kkkemaycedexymrpaqtp.supabase.co/functions/v1/company-mail-resend";
const signing = "whsec_" + "A".repeat(43) + "=";
let db: PGlite;
async function response(
  method: string,
  path: string,
  data: unknown,
  ok = true,
) {
  await db.query(
    "insert into private.test_http_responses values($1,$2,$3::jsonb) on conflict(method,path) do update set result=excluded.result",
    [method, path, JSON.stringify(ok ? { ok, status: 200, data } : data)],
  );
}
async function run(action: string) {
  return (
    await db.query<{ value: Record<string, unknown> }>(
      "select private.tc_resend_admin_setup($1) value",
      [action],
    )
  ).rows[0].value;
}
async function calls() {
  return (
    await db.query<{
      method: string;
      path: string;
      body: Record<string, unknown>;
    }>("select * from private.test_http_calls order by id")
  ).rows;
}
const domainData = {
  id: did,
  name: domain,
  status: "not_started",
  region: "eu-west-1",
  capabilities: { sending: "enabled", receiving: "enabled" },
  records: [
    {
      name: "resend._domainkey",
      type: "TXT",
      value: "p=synthetic-public-dkim",
      ttl: "Auto",
    },
  ],
};
const hookData = {
  id: wid,
  endpoint,
  status: "enabled",
  events: ["email.received"],
  signing_secret: signing,
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
    create schema private;create schema extensions;create schema vault;
    grant usage on schema private,vault to anon,authenticated,service_role;
    create table private.tc_provider_settings(id boolean primary key,receiving_domain text);
    insert into private.tc_provider_settings values(true,null);
    create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text);
    create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
    create table private.test_secret_updates(id uuid);
    create function vault.create_secret(value text,label text,description text default null) returns uuid language plpgsql as $$declare k uuid;begin insert into vault.secrets(name,secret) values(label,value) returning id into k;return k;end $$;
    create function vault.update_secret(k uuid,value text) returns void language plpgsql as $$begin update vault.secrets set secret=value where id=k;insert into private.test_secret_updates values(k);end $$;
    create table private.test_http_responses(method text,path text,result jsonb,primary key(method,path));
    create table private.test_http_calls(id bigint generated always as identity,method text,path text,body jsonb);`);
  await db.exec(source);
}, 30000);
beforeEach(async () => {
  await db.exec(transport);
  await db.exec(
    "delete from private.test_http_responses;delete from private.test_http_calls;delete from private.test_secret_updates;delete from vault.secrets;update private.tc_provider_settings set receiving_domain=null;",
  );
  await db.query(
    "insert into vault.secrets(name,secret) values('truckcontrol_resend_api_key',$1),('truckcontrol_resend_webhook_secret','pending')",
    ["re_" + "synthetic".repeat(5)],
  );
});
afterAll(async () => {
  await db?.close();
});

describe("administración Resend: límites reales de permisos", () => {
  it("anon, usuarios y runtime no pueden ejecutar el cliente administrativo", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec("set role " + role);
      try {
        await expect(
          db.query("select private.tc_resend_admin_setup('inspect')"),
        ).rejects.toThrow("permission denied");
        await expect(
          db.query(
            "select private.tc_resend_admin_http('GET','/domains?limit=100')",
          ),
        ).rejects.toThrow("permission denied");
      } finally {
        await db.exec("reset role");
      }
    }
  });
  it("rechaza URLs, envío de emails, borrados y rutas fuera de la lista antes de usar una clave", async () => {
    for (const [method, path] of [
      ["GET", "https://other.invalid"],
      ["POST", "/emails"],
      ["DELETE", "/domains/" + did],
      ["GET", "/domains/../api-keys"],
      ["POST", "/webhooks?redirect=other"],
    ])
      await expect(
        db.query("select private.tc_resend_admin_http($1,$2)", [method, path]),
      ).rejects.toThrow("endpoint is not allowed");
  });
  it("una clave pendiente detiene el transporte; no se instala HTTP en la base aislada", async () => {
    await db.exec(
      "update vault.secrets set secret='pending' where name='truckcontrol_resend_api_key'",
    );
    await expect(
      db.query(
        "select private.tc_resend_admin_http('GET','/domains?limit=100')",
      ),
    ).rejects.toThrow("credential is not configured");
    expect(
      (await db.query("select 1 from pg_extension where extname='http'")).rows,
    ).toHaveLength(0);
  });
});

describe("configuración con transporte oficial simulado, sin red ni credenciales reales", () => {
  beforeEach(async () => {
    await db.exec(`create or replace function private.tc_resend_admin_http(p_method text,p_path text,p_body jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$declare r jsonb;begin
      insert into private.test_http_calls(method,path,body) values(p_method,p_path,p_body);
      select result into r from private.test_http_responses where method=p_method and path=p_path;
      if not found then raise exception 'Missing synthetic response';end if;return r;end $$;`);
    await response("GET", "/domains?limit=100", { data: [], has_more: false });
    await response("GET", "/webhooks?limit=100", { data: [], has_more: false });
  });
  it("inspecciona sin devolver dominios ajenos ni URLs que puedan contener tokens", async () => {
    await response("GET", "/domains?limit=100", {
      has_more: false,
      data: [{ id: did, name: "other.invalid", secret: "do-not-expose" }],
    });
    await response("GET", "/webhooks?limit=100", {
      has_more: false,
      data: [
        { id: wid, endpoint: "https://other.invalid/?token=do-not-expose" },
      ],
    });
    const result = await run("inspect");
    expect(result).toMatchObject({
      ok: true,
      domain_count: 1,
      webhook_count: 1,
      free_plan_verified: false,
    });
    expect(JSON.stringify(result)).not.toContain("do-not-expose");
    expect((await calls()).every((c) => c.method === "GET")).toBe(true);
  });
  it("crea únicamente el subdominio autorizado, con TLS y sin seguimiento", async () => {
    await response("POST", "/domains", domainData);
    expect(await run("prepare_domain")).toMatchObject({
      ok: true,
      id: did,
      name: domain,
    });
    const request = (await calls()).find((c) => c.method === "POST")!;
    expect(request.path).toBe("/domains");
    expect(request.body).toMatchObject({
      name: domain,
      region: "eu-west-1",
      tls: "enforced",
      open_tracking: false,
      click_tracking: false,
      capabilities: { sending: "enabled", receiving: "enabled" },
    });
  });
  it("reutiliza el dominio existente y filtra propiedades inesperadas de DNS", async () => {
    await response("GET", "/domains?limit=100", {
      has_more: false,
      data: [{ id: did, name: domain }],
    });
    await response("GET", "/domains/" + did, {
      ...domainData,
      api_key: "do-not-expose",
      capabilities: { ...domainData.capabilities, secret: "do-not-expose" },
      records: [{ ...domainData.records[0], secret: "do-not-expose" }],
    });
    const result = await run("prepare_domain");
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("do-not-expose");
    expect((await calls()).some((c) => c.method === "POST")).toBe(false);
  });
  it("conserva los recursos ajenos y no supera la capacidad gratuita", async () => {
    await response("GET", "/domains?limit=100", {
      has_more: false,
      data: [1, 2, 3].map((n) => ({ id: did, name: `other-${n}.invalid` })),
    });
    expect(await run("prepare_domain")).toMatchObject({
      ok: false,
      error: "free_domain_capacity_unavailable",
    });
    await response("GET", "/webhooks?limit=100", {
      has_more: false,
      data: [{ id: wid, endpoint: "https://other.invalid" }],
    });
    expect(await run("prepare_webhook")).toMatchObject({
      ok: false,
      error: "free_webhook_capacity_unavailable",
    });
    expect((await calls()).every((c) => c.method === "GET")).toBe(true);
  });
  it("una lista paginada o ambigua no permite crear duplicados", async () => {
    await response("GET", "/domains?limit=100", { has_more: true, data: [] });
    expect(await run("prepare_domain")).toMatchObject({
      ok: false,
      error: "paged_inventory_requires_review",
    });
    await response("GET", "/domains?limit=100", {
      has_more: false,
      data: [
        { id: did, name: domain },
        { id: wid, name: domain },
      ],
    });
    expect(await run("prepare_domain")).toMatchObject({
      ok: false,
      error: "ambiguous_domain",
    });
    expect((await calls()).some((c) => c.method === "POST")).toBe(false);
  });
  it("guarda la firma en Vault, confirma la identidad y nunca la devuelve", async () => {
    await response("POST", "/webhooks", { id: wid, signing_secret: signing });
    await response("GET", "/webhooks/" + wid, hookData);
    const result = await run("prepare_webhook");
    expect(result).toMatchObject({
      ok: true,
      webhook_id: wid,
      signing_secret_configured: true,
      receiver_enabled: false,
    });
    expect(JSON.stringify(result)).not.toContain(signing);
    const stored = await db.query<{ secret: string }>(
      "select secret from vault.secrets where name='truckcontrol_resend_webhook_secret'",
    );
    expect(stored.rows[0].secret).toBe(signing);
    expect((await calls()).find((c) => c.method === "POST")?.body).toEqual({
      endpoint,
      events: ["email.received"],
    });
  });
  it("reutilizar la firma existente no la rota ni crea otro webhook", async () => {
    await response("GET", "/webhooks?limit=100", {
      has_more: false,
      data: [hookData],
    });
    await response("GET", "/webhooks/" + wid, hookData);
    expect((await run("prepare_webhook")).ok).toBe(true);
    expect((await run("prepare_webhook")).ok).toBe(true);
    expect(
      (await db.query("select * from private.test_secret_updates")).rows,
    ).toHaveLength(1);
    expect((await calls()).some((c) => c.method === "POST")).toBe(false);
  });
  it("no sustituye una firma diferente ya configurada", async () => {
    const existing = "whsec_" + "B".repeat(43) + "=";
    await db.query(
      "update vault.secrets set secret=$1 where name='truckcontrol_resend_webhook_secret'",
      [existing],
    );
    await response("GET", "/webhooks?limit=100", {
      has_more: false,
      data: [hookData],
    });
    await response("GET", "/webhooks/" + wid, hookData);
    expect(await run("prepare_webhook")).toMatchObject({
      ok: false,
      error: "stored_webhook_secret_requires_review",
    });
    expect(
      (
        await db.query<{ secret: string }>(
          "select secret from vault.secrets where name='truckcontrol_resend_webhook_secret'",
        )
      ).rows[0].secret,
    ).toBe(existing);
  });
  it("un webhook ajeno o deshabilitado se conserva sin almacenar su secreto", async () => {
    await response("GET", "/webhooks?limit=100", {
      has_more: false,
      data: [hookData],
    });
    await response("GET", "/webhooks/" + wid, {
      ...hookData,
      status: "disabled",
    });
    expect(await run("prepare_webhook")).toMatchObject({
      ok: false,
      error: "existing_webhook_requires_review",
    });
    expect(
      (
        await db.query<{ secret: string }>(
          "select secret from vault.secrets where name='truckcontrol_resend_webhook_secret'",
        )
      ).rows[0].secret,
    ).toBe("pending");
  });
  it("un error del proveedor no se reintenta ni devuelve su cuerpo", async () => {
    await response(
      "POST",
      "/webhooks",
      { ok: false, state: "unknown", status: 503, data: { secret: signing } },
      false,
    );
    const result = await run("prepare_webhook");
    expect(result).toEqual({ ok: false, state: "unknown", status: 503 });
    expect((await calls()).filter((c) => c.method === "POST")).toHaveLength(1);
    expect(
      (await db.query("select * from private.test_secret_updates")).rows,
    ).toHaveLength(0);
  });
  it("la verificación usa el ID del subdominio, sin tocar el dominio raíz", async () => {
    await response("GET", "/domains?limit=100", {
      has_more: false,
      data: [{ id: did, name: domain }],
    });
    await response("POST", "/domains/" + did + "/verify", { id: did });
    expect(await run("verify_domain")).toMatchObject({
      ok: true,
      domain_id: did,
    });
    expect((await calls()).find((c) => c.method === "POST")?.path).toBe(
      "/domains/" + did + "/verify",
    );
  });
  it("no cambia un receptor anterior ni acepta operaciones arbitrarias", async () => {
    await db.exec(
      "update private.tc_provider_settings set receiving_domain='existing.invalid'",
    );
    expect(await run("prepare_domain")).toMatchObject({
      ok: false,
      error: "existing_receiver_domain_requires_review",
    });
    expect((await run("activate_payments")).ok).toBe(false);
    expect((await calls()).some((c) => c.method === "POST")).toBe(false);
  });
});

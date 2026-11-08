import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const admin = "fc630000-0000-4000-8000-000000000001";
const session = "fc630000-0000-4000-8000-000000000002";
const buyer = "fc630000-0000-4000-8000-000000000003";
const request = "fc630000-0000-4000-8000-000000000004";
const operation = (n: number) => "fc630000-0000-4000-8000-" + String(n).padStart(12, "0");
const hash = "a".repeat(64);
let db: PGlite, company = "", task = "";
type Stored = { document_id: string; task_id: string; object_key: string; sha256: string; size_bytes: number; operation_id?: string; nonce?: string };
async function attempt<T>(body: () => Promise<T>) {
  await db.exec("savepoint pdf_attempt");
  try { const result = await body(); await db.exec("release savepoint pdf_attempt"); return result; }
  catch (error) { await db.exec("rollback to savepoint pdf_attempt; release savepoint pdf_attempt"); throw error; }
}
async function call(action: string, changes: Record<string, unknown> = {}, role = "service_role") {
  return attempt(async () => {
    await db.exec(role === "authenticated" ? "set local role authenticated" : role === "anon" ? "set local role anon" : "set local role service_role");
    const result = await db.query<{ result: Stored }>("select public.tc_manual_subscription_document_server($1,$2::jsonb) result",
      [action, JSON.stringify({ actor_id: admin, session_id: session, task_id: task, expected_version: 2, operation_id: operation(20), ...changes })]);
    await db.exec("reset role");
    return result.rows[0].result;
  });
}
async function enable() { await db.exec("update private.tc_manual_subscription_document_runtime set uploads_enabled=true where id"); }
async function reserve(n = 20) { return call("reserve", { operation_id: operation(n), sha256: hash, size_bytes: 99 }); }
async function object(key: string, size = 99) {
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('tc-subscription-fiscal',$1,$2::jsonb)",
    [key, JSON.stringify({ mimetype: "application/pdf", size })]);
}
async function complete(reserved: Stored) {
  return call("complete", { operation_id: reserved.operation_id, document_id: reserved.document_id,
    nonce: reserved.nonce, sha256: reserved.sha256, size_bytes: reserved.size_bytes });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth;" +
    "create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb not null default '{}');" +
    "create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id));" +
    "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;" +
    "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;" +
    "grant usage on schema public,auth to anon,authenticated,service_role;",
  );
  for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  }
  await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'pdf-operator@example.invalid',now())", [admin]);
  await db.query("insert into private.tc_admins(user_id) values($1) on conflict do nothing", [admin]);
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [session, admin]);
  await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'pdf-buyer@example.invalid',now(),$2::jsonb)",
    [buyer, JSON.stringify({ truckcontrol_registration: { contact_name: "Comprador ficticio", company_name: "Empresa ficticia PDF",
      tax_id: "DEMO-PDF", address: "Domicilio ficticio 50", phone: "+12025550120", requested_plan: "limited" } })]);
  company = (await db.query<{ id: string }>("select id from public.organizations where owner_id=$1", [buyer])).rows[0].id;
  await db.query("insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status,net_cents,vat_rate_bps,vat_cents) " +
    "select $1,$2,id,36300,revision,'paid',30000,2100,6300 from private.tc_plans where id='limited'", [request, buyer]);
  task = (await db.query<{ id: string }>(
    "select private.tc_manual_subscription_invoice_intake('acct_PdfSynthetic','evt_PdfSynthetic','pi_PdfSynthetic',$1,$2,36300,now()-interval '1 hour') id",
    [request, company])).rows[0].id;
  await db.exec("begin");
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [admin, JSON.stringify({ sub: admin, session_id: session, role: "authenticated" })]);
  await db.exec("set local role authenticated");
  await db.query("select public.tc_admin_manual_subscription_invoices('validate_buyer',$1,1,$2,$3::jsonb,null)", [
    task, operation(10), JSON.stringify({ company_name: "Empresa ficticia PDF", tax_id: "DEMO-PDF", address: "Domicilio ficticio 50",
      email: "pdf-buyer@example.invalid", evidence_reference: "Soporte fiscal sintético" }),
  ]);
  await db.exec("reset role; commit");
  // Storage stand-in is isolated to this ephemeral test. An intentionally broad
  // fleet policy proves the new restrictive bucket guard cannot be bypassed.
  await db.exec("create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);" +
    "create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb);" +
    "alter table storage.objects enable row level security;" +
    "grant usage on schema storage to anon,authenticated; grant select,insert on storage.objects to authenticated;" +
    "create policy existing_fleet_policy on storage.objects for all to authenticated using(true) with check(true);" +
    "insert into storage.buckets values('another-fleet-bucket','another-fleet-bucket',false,10485760,array['application/pdf']);");
  const proposal = readFileSync("docs/verification/manual-invoice-documents.proposal.sql", "utf8");
  const installed = (await db.query<{ installed: boolean }>(
    "select to_regclass('private.tc_manual_subscription_document_runtime') is not null installed",
  )).rows[0].installed;
  if (installed) {
    // Once the CLI-named migration contains these functions, do not execute a
    // second schema. All migrations were already loaded above. Provision ONLY
    // this test's Storage stand-in through the proposal's exact guarded prefix.
    const marker = proposal.indexOf("create table private.tc_manual_subscription_document_runtime(");
    if (marker < 0) throw Error("Missing reviewed Storage proposal boundary");
    await db.exec(proposal.slice(0, marker));
  } else await db.exec(proposal);
}, 60000);
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("reset role; rollback"); });
afterAll(async () => { await db?.close(); });

describe("propuesta PDF en PostgreSQL efímero: rol, nonce, CAS y storage privado", () => {
  it("parte deshabilitada y ningún cliente invoca la función del servidor", async () => {
    await expect(reserve()).rejects.toThrow("manual_document_upload_unavailable");
    for (const role of ["authenticated", "anon"]) await expect(call("reserve", { sha256: hash, size_bytes: 99 }, role)).rejects.toThrow();
    expect((await db.query("select uploads_enabled from private.tc_manual_subscription_document_runtime")).rows).toEqual([{ uploads_enabled: false }]);
    expect((await db.query("select count(*)::int n from private.tc_manual_subscription_document_reservations")).rows).toEqual([{ n: 0 }]);
  });
  it("deniega el bucket fiscal incluso con una política de flota permisiva, sin afectar el otro bucket", async () => {
    await attempt(async () => {
      await db.exec("set local role authenticated");
      await db.exec("insert into storage.objects(bucket_id,name,metadata) values('another-fleet-bucket','allowed.pdf','{}')");
      await db.exec("reset role");
    });
    await expect(attempt(async () => {
      await db.exec("set local role authenticated");
      await db.exec("insert into storage.objects(bucket_id,name,metadata) values('tc-subscription-fiscal','forbidden.pdf','{}')");
    })).rejects.toThrow();
    expect((await db.query("select bucket_id from storage.objects")).rows).toEqual([{ bucket_id: "another-fleet-bucket" }]);
    await db.exec("insert into storage.objects(bucket_id,name,metadata) values('tc-subscription-fiscal','owner-only.pdf','{}')");
    const visible = await attempt(async () => {
      await db.exec("set local role authenticated");
      const rows = (await db.query("select bucket_id from storage.objects")).rows;
      await db.exec("reset role");
      return rows;
    });
    expect(visible).toEqual([{ bucket_id: "another-fleet-bucket" }]);
  });
  it("reserva una ruta derivada del comprador y la tarea; el replay idéntico conserva nonce e identidad", async () => {
    await enable();
    const first = await reserve();
    expect(first.object_key).toBe("subscription-invoices/" + company + "/" + task + "/" + first.document_id + ".pdf");
    expect(first.nonce).toMatch(/^[a-f0-9-]{36}$/);
    expect(await reserve()).toEqual(first);
    await expect(call("reserve", { operation_id: operation(20), sha256: "b".repeat(64), size_bytes: 99 })).rejects.toThrow("conflicting_replay");
    expect((await db.query("select count(*)::int n from private.tc_manual_subscription_document_reservations")).rows).toEqual([{ n: 1 }]);
  });
  it("exige objeto privado con tamaño/MIME correcto y registra una única evidencia", async () => {
    await enable();
    const reserved = await reserve();
    await expect(complete(reserved)).rejects.toThrow("private_object_missing");
    await object(reserved.object_key, 100);
    await expect(complete(reserved)).rejects.toThrow("private_object_missing");
    await db.query("update storage.objects set metadata=$1::jsonb where name=$2", [JSON.stringify({ mimetype: "application/pdf", size: 99 }), reserved.object_key]);
    const first = await complete(reserved);
    expect(await complete(reserved)).toEqual(first);
    expect((await db.query("select count(*)::int n from private.tc_manual_subscription_invoice_documents")).rows).toEqual([{ n: 1 }]);
    expect(first.sha256).toBe(hash);
  });
  it("rechaza nonce, documento, sesión o versión distintos sin evidencia parcial", async () => {
    await enable();
    const reserved = await reserve();
    await object(reserved.object_key);
    for (const changed of [
      { nonce: operation(60) }, { document_id: operation(61) }, { session_id: operation(62) }, { expected_version: 1 },
    ]) await expect(call("complete", { operation_id: reserved.operation_id, nonce: reserved.nonce, document_id: reserved.document_id,
      sha256: hash, size_bytes: 99, ...changed })).rejects.toThrow();
    expect((await db.query("select count(*)::int n from private.tc_manual_subscription_invoice_documents")).rows).toEqual([{ n: 0 }]);
  });
  it("revocar la sesión impide finalizar una reserva ya creada y preserva sus datos", async () => {
    await enable();
    const reserved = await reserve();
    await object(reserved.object_key);
    await db.query("delete from auth.sessions where id=$1", [session]);
    await expect(complete(reserved)).rejects.toThrow("operator_required");
    expect((await db.query("select count(*)::int n from private.tc_manual_subscription_document_reservations")).rows).toEqual([{ n: 1 }]);
    expect((await db.query("select count(*)::int n from private.tc_manual_subscription_invoice_documents")).rows).toEqual([{ n: 0 }]);
  });
  it("el servidor no tiene permiso directo para insertar evidencia; usa el adaptador revisado", async () => {
    await enable();
    const reserved = await reserve();
    await expect(attempt(async () => {
      await db.exec("set local role service_role");
      await db.query("insert into private.tc_manual_subscription_invoice_documents(id,task_id,object_key,sha256,size_bytes) values($1,$2,$3,$4,99)",
        [reserved.document_id, task, reserved.object_key, hash]);
    })).rejects.toThrow();
  });
  it("las cuotas serializadas impiden reservas masivas y no borran las anteriores", async () => {
    await enable();
    for (let i = 100; i < 120; i++) await reserve(i);
    await expect(reserve(120)).rejects.toThrow("rate_limit");
    expect((await db.query("select count(*)::int n from private.tc_manual_subscription_document_reservations")).rows).toEqual([{ n: 20 }]);
  });
  it("las lecturas se auditan y repetir operation_id no permite superar la cuota", async () => {
    await enable();
    const reserved = await reserve();
    await object(reserved.object_key);
    const stored = await complete(reserved);
    await db.query("insert into private.tc_manual_subscription_document_access(operation_id,document_id,task_id,actor_id,session_id) " +
      "select $1,$2,$3,$4,$5 from generate_series(1,99)", [operation(90), stored.document_id, task, admin, session]);
    expect((await call("download", { document_id: stored.document_id, operation_id: operation(90) })).document_id).toBe(stored.document_id);
    await expect(call("download", { document_id: stored.document_id, operation_id: operation(90) })).rejects.toThrow("rate_limit");
    expect((await db.query("select count(*)::int n from private.tc_manual_subscription_document_access")).rows).toEqual([{ n: 100 }]);
  });
  it("no permite reescribir ni truncar las reservas y el registro de accesos", async () => {
    await enable(); await reserve();
    const before = (await db.query("select operation_id,document_id,nonce,sha256 from private.tc_manual_subscription_document_reservations")).rows;
    for (const table of ["private.tc_manual_subscription_document_reservations", "private.tc_manual_subscription_document_access"]) {
      for (const action of ["update " + table + " set operation_id=operation_id", "delete from " + table, "truncate " + table]) {
        await expect(attempt(() => db.exec(action))).rejects.toThrow();
      }
    }
    expect((await db.query("select operation_id,document_id,nonce,sha256 from private.tc_manual_subscription_document_reservations")).rows).toEqual(before);
    expect((await db.query("select payments_enabled from private.tc_settings where id")).rows).toEqual([{ payments_enabled: false }]);
  });
});

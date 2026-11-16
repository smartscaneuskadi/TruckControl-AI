/** Cross-layer test only: unchanged SQL + production handler/gateway/scanner.
 * Auth issuance, object bytes and Google/model HTTP are isolated fixtures.
 * Every business RPC, native SID gate, RLS policy and budget mutation is real PGlite SQL.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "node:fs";
import {
  installAuthSessionFixture,
  bindFixtureActor,
  seedFixtureSessions,
} from "./helpers/auth-session-fixture";
import { createMailHandler } from "../supabase/functions/company-mail/handler";
import { createMailGateway } from "../supabase/functions/company-mail/gateway";
import { scanConnectedGmail } from "../supabase/functions/company-mail/connected-gmail";
import { base64, base64url } from "../supabase/functions/_shared/invoice";
import { presetReceivedPeriod } from "../supabase/functions/_shared/mail-period";
import type {
  ConnectedMailRequest,
  ConnectedScanContext,
} from "../supabase/functions/company-mail/connected-contract";

const owner = "ca770000-0000-4000-8000-000000000001",
  other = "ca770000-0000-4000-8000-000000000002",
  truck = "ca770000-0000-4000-8000-000000000003",
  origin = "https://truckcontrolai.com",
  now = Date.parse("2026-11-16T12:00:00.000Z"),
  key = "fictitious-connected-mail-sql-signing-key-tests-only",
  googleTokens = new Map([
    [owner, "fictitious-google-account-A-authorization"],
    [other, "fictitious-google-account-B-authorization"],
  ]),
  emails = new Map([
    [owner, "invoices-a@fleet.invalid"],
    [other, "invoices-b@fleet.invalid"],
  ]);
let db: PGlite,
  organization: string,
  foreign: string,
  queue = Promise.resolve();
const issued = new Map<string, string>();
const tokens = new Map<string, string>();
async function value<T = unknown>(sql: string, args: unknown[] = []) {
  return (await db.query<{ v: T }>(sql, args)).rows[0].v;
}
async function actor<T>(
  role: "authenticated" | "service_role" | "anon",
  user: string | null,
  operation: () => Promise<T>,
) {
  const before = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await before;
  await db.exec("savepoint connected_mail_actor");
  try {
    await db.exec(`set role ${role}`);
    await bindFixtureActor(db, user);
    return await operation();
  } catch (error) {
    await db.exec("rollback to savepoint connected_mail_actor");
    throw error;
  } finally {
    await db.exec("reset role");
    await bindFixtureActor(db, null);
    await db.exec("release savepoint connected_mail_actor");
    release();
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb not null default '{}',unique(bucket_id,name));
    alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;`);
  await installAuthSessionFixture(db);
  const migrations = readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort();
  expect(migrations.at(-1)).toBe(
    "20261116085827_billing_document_attachments.sql",
  );
  for (const file of migrations)
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  for (const [index, user] of [owner, other].entries()) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        user,
        `connected-mail-sql-${index}@fleet.invalid`,
        {
          truckcontrol_registration: {
            contact_name: "Persona ficticia",
            company_name: `Empresa ficticia correo ${index}`,
            tax_id: `DEMO-MAIL-SQL-${index}`,
            address: "Dirección de pruebas ficticia 10",
            phone: `+1202555017${index + 1}`,
          },
        },
      ],
    );
  }
  organization = await value<string>(
    "select id v from public.organizations where owner_id=$1",
    [owner],
  );
  foreign = await value<string>(
    "select id v from public.organizations where owner_id=$1",
    [other],
  );
  await db.exec(`update private.tc_customers set ai_allowed=true,ai_opt_in=true,
    module_overrides='{"documents":true,"gmail":true,"invoice_ai":true,"income":true,"expenses":true}';
    update private.tc_modules set enabled=true where id='invoice_ai';
    update private.tc_provider_settings set ai_enabled=true,ai_monthly_budget_cents=1000;`);
  await db.query(
    "insert into public.trucks(id,organization_id,plate,brand,model,year,inspection_due_on) values($1,$2,'FICT-MAIL','Marca ficticia','Modelo ficticio',2024,'2027-06-01')",
    [truck, organization],
  );
  await seedFixtureSessions(db);
  // The fixture Auth issuer binds only its own exact tokens. Session validity
  // after logout is still decided by production public.tc_verified_session().
  for (const user of [owner, other]) {
    await bindFixtureActor(db, user);
    const claims = await value<string>(
      "select current_setting('request.jwt.claims') v",
    );
    const token = [
      base64url(new TextEncoder().encode('{"alg":"ES256","typ":"JWT"}')),
      base64url(new TextEncoder().encode(claims)),
      base64url(new TextEncoder().encode("FICTITIOUS-TEST-AUTH-SIGNATURE")),
    ].join(".");
    issued.set(token, user);
    tokens.set(user, token);
  }
  await bindFixtureActor(db, null);
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await queue;
  await db.exec("rollback;reset role");
  await bindFixtureActor(db, null);
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await db?.close();
});

interface RpcResult {
  data: unknown;
  error: { code: string; message: string } | null;
}
function fixture() {
  const storage = new Map<string, Uint8Array>(),
    seenRpcs: string[] = [],
    requests: string[] = [];
  let bytes = new Uint8Array(
      readFileSync("public/examples/factura-demostracion.pdf"),
    ),
    modelCalls = 0,
    messageSequence = 1,
    uncertain = false,
    onMetadata: (() => Promise<void>) | undefined;
  const sqlRpc = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<RpcResult> => {
    seenRpcs.push(name);
    try {
      const data = await actor("service_role", null, async () => {
        switch (name) {
          case "tc_company_server_access":
            return value(
              "select public.tc_company_server_access(p_org=>$1,p_user=>$2) v",
              [args.p_org, args.p_user],
            );
          case "company_provider_runtime_config":
            return value(
              "select public.company_provider_runtime_config($1) v",
              [args.p_scope],
            );
          case "company_mail_server":
            return value("select public.company_mail_server($1,$2::jsonb) v", [
              args.p_action,
              JSON.stringify(args.p_data),
            ]);
          case "company_ai_budget_server":
            return value(
              "select public.company_ai_budget_server($1,$2::jsonb) v",
              [args.p_action, JSON.stringify(args.p_data)],
            );
          case "company_invoice_ai_server":
            return value(
              "select public.company_invoice_ai_server($1,$2::jsonb) v",
              [args.p_action, JSON.stringify(args.p_data)],
            );
          case "company_invoice_ai_apply":
            return value(
              "select public.company_invoice_ai_apply($1::jsonb) v",
              [JSON.stringify(args.p_data)],
            );
          default:
            throw Error("Unexpected business RPC in the isolated SQL harness");
        }
      });
      return { data, error: null };
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error)) throw error;
      return {
        data: null,
        error: {
          code: String(error.code),
          message:
            error instanceof Error ? error.message : "SQL fixture failure",
        },
      };
    }
  };
  const client = {
    auth: {
      async getUser(token: string) {
        const id = issued.get(token);
        return { data: { user: id ? { id } : null }, error: null };
      },
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (name !== "tc_verified_session") return sqlRpc(name, args);
      return {
        async setHeader(header: string, value: string) {
          if (header !== "Authorization" || !value.startsWith("Bearer "))
            throw Error("Unexpected fixture header");
          const id = issued.get(value.slice(7));
          if (!id) return { data: false, error: null };
          return {
            data: await actor("authenticated", id, () =>
              valueSql<boolean>("select public.tc_verified_session() v"),
            ),
            error: null,
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        if (bucket !== "truckcontrol-documents")
          throw Error("Unexpected isolated bucket");
        return {
          async upload(
            path: string,
            content: Uint8Array,
            options: { contentType: string; upsert: boolean },
          ) {
            expect(options.upsert).toBe(false);
            await actor("service_role", null, () =>
              db.query(
                "insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)",
                [
                  bucket,
                  path,
                  { mimetype: options.contentType, size: content.length },
                ],
              ),
            );
            storage.set(path, new Uint8Array(content));
            return { error: null };
          },
          async remove(paths: string[]) {
            await actor("service_role", null, () =>
              db.query(
                "delete from storage.objects where bucket_id=$1 and name=any($2::text[])",
                [bucket, paths],
              ),
            );
            for (const path of paths) storage.delete(path);
            return { error: null };
          },
          async download(path: string) {
            const content = storage.get(path);
            return {
              data: content ? new Blob([new Uint8Array(content).buffer]) : null,
              error: null,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  // Alias avoids shadowing by PostgREST's setHeader value argument.
  const valueSql = value;
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input !== "https://api.openai.com/v1/responses")
        throw Error("Live network is forbidden in this isolated test");
      const payload = JSON.parse(String(init?.body));
      expect(payload).toMatchObject({
        model: "gpt-6-luna",
        store: false,
        max_output_tokens: 1200,
        service_tier: "default",
      });
      modelCalls++;
      if (uncertain)
        throw Error(
          "Fictitious uncertain model response; reservation must be retained",
        );
      return Response.json({
        status: "completed",
        usage: { input_tokens: 120, output_tokens: 30 },
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  supplier: "Proveedor ficticio",
                  invoice_number: "FICTITIOUS-SQL-1",
                  invoice_date: "2026-11-15",
                  net_cents: 10001,
                  tax_cents: 2100,
                  total_cents: 12101,
                  currency: "EUR",
                }),
              },
            ],
          },
        ],
      });
    },
  );
  const google: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== "https://gmail.googleapis.com")
      throw Error("Unexpected fictitious Google endpoint");
    const authorization = new Headers(init?.headers).get("Authorization");
    const selected = [...googleTokens].find(
      ([, token]) => authorization === "Bearer " + token,
    )?.[0];
    if (!selected) return Response.json({}, { status: 401 });
    requests.push(url.pathname + url.search);
    if (url.pathname.endsWith("/profile"))
      return Response.json({ emailAddress: emails.get(selected) });
    if (url.pathname.endsWith("/messages"))
      return Response.json({
        messages: [{ id: "fictitiousMessage" + messageSequence }],
      });
    if (url.searchParams.get("format") === "metadata") {
      await onMetadata?.();
      return Response.json({
        internalDate: String(now - 1000),
        labelIds: ["INBOX"],
      });
    }
    if (url.searchParams.get("format") === "full")
      return Response.json({
        internalDate: String(now - 1000),
        labelIds: ["INBOX"],
        payload: {
          filename: "Factura-ficticia.pdf",
          body: { size: bytes.length, attachmentId: "fictitiousAttachment" },
        },
      });
    if (url.pathname.endsWith("/attachments/fictitiousAttachment"))
      return Response.json({ data: base64(bytes) });
    throw Error("Unexpected fictitious Google path");
  };
  const gateway = createMailGateway(
    client,
    "sk-" + "fictitious-sql-key-only-".repeat(3),
  );
  const handler = createMailHandler(gateway, {
    origins: [origin],
    now: () => now,
    connectedMailboxCursorKey: key,
    connectedMailbox: (
      input: ConnectedMailRequest,
      context: ConnectedScanContext,
    ) => scanConnectedGmail(input, context, key, google),
  });
  const post = (
    user = owner,
    org = organization,
    extra: Record<string, unknown> = {},
  ) => {
    const period = presetReceivedPeriod("30d", now),
      email = emails.get(user)!;
    return handler(
      new Request("https://fixture.invalid/company-mail", {
        method: "POST",
        headers: {
          Origin: origin,
          Authorization: "Bearer " + tokens.get(user),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "import_connected_mailbox",
          organization_id: org,
          provider: "gmail",
          email,
          period,
          analyze: true,
          gmail_access_token: googleTokens.get(user),
          consent: {
            version: "2026-11-16",
            accepted: true,
            mailbox: email,
            provider: "gmail",
            period,
          },
          ...extra,
        }),
      }),
    );
  };
  return {
    storage,
    requests,
    seenRpcs,
    post,
    get modelCalls() {
      return modelCalls;
    },
    setUncertain() {
      uncertain = true;
    },
    replaceBytes(content: Uint8Array, newMessage = true) {
      bytes = content;
      if (newMessage) messageSequence++;
    },
    onMetadata(callback: () => Promise<void>) {
      onMetadata = callback;
    },
  };
}

describe("correo conectado con SQL real y empresas aisladas", () => {
  it("rechaza contenido diferente bajo la misma identidad de mensaje/pieza sin sobrescribir el original", async () => {
    const f = fixture();
    expect((await f.post()).status).toBe(200);
    const path = [...f.storage.keys()][0];
    const original = new Uint8Array(f.storage.get(path)!);
    f.replaceBytes(
      new TextEncoder().encode(
        "%PDF-1.4\n% FICTITIOUS MUTATED MESSAGE CONTENT\n%%EOF\n",
      ),
      false,
    );
    expect(await (await f.post()).json()).toMatchObject({
      imported: 0,
      failures: 1,
      ai_used: 0,
    });
    expect(f.modelCalls).toBe(1);
    expect(f.storage.size).toBe(1);
    expect(f.storage.get(path)).toEqual(original);
    expect(
      await value<number>(
        "select count(*)::integer v from private.invoice_documents",
      ),
    ).toBe(1);
    expect(
      await value<number>(
        "select count(*)::integer v from private.company_documents",
      ),
    ).toBe(1);
    expect(
      await value<number>("select count(*)::integer v from storage.objects"),
    ).toBe(1);
    expect(
      await value<number>(
        "select count(*)::integer v from public.finance_entries",
      ),
    ).toBe(0);
  });
  it("guarda origen/identidad compatibles, original privado y propuesta IA; contabiliza solo tras revisión explícita", async () => {
    const f = fixture();
    const response = await f.post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      imported: 1,
      ai_used: 1,
      failures: 0,
    });
    const invoice = await value<{
      id: string;
      status: string;
      message_id: string;
      attachment_id: string;
      import_source: string;
      net_cents: number;
      tax_cents: number;
      total_cents: number;
      object_path: string;
    }>(
      `select to_jsonb(i)||jsonb_build_object('object_path',d.object_path) v
        from private.invoice_documents i join private.company_documents d on d.organization_id=i.organization_id and d.id=i.document_id where i.organization_id=$1`,
      [organization],
    );
    expect(invoice).toMatchObject({
      status: "needs_review",
      import_source: "email_upload",
      net_cents: 10001,
      tax_cents: 2100,
      total_cents: 12101,
    });
    expect(invoice.message_id).toMatch(
      new RegExp(`^connected:v1:${owner}:[a-f0-9]{64}$`),
    );
    expect(invoice.attachment_id).toMatch(/^part:[a-f0-9]{64}$/);
    expect(invoice.message_id.length).toBeLessThanOrEqual(200);
    expect(f.storage.has(invoice.object_path)).toBe(true);
    expect(
      await value<boolean>(
        "select not public v from storage.buckets where id='truckcontrol-documents'",
      ),
    ).toBe(true);
    expect(
      await value<number>(
        "select count(*)::integer v from public.finance_entries",
      ),
    ).toBe(0);
    expect(
      await value<number>(
        "select count(*)::integer v from private.tc_ai_calls where user_id=$1 and organization_id=$2 and state='settled'",
        [owner, organization],
      ),
    ).toBe(1);
    const entry = await actor("authenticated", owner, () =>
      value<string>(
        "select public.approve_company_invoice($1,$2,$3::jsonb) v",
        [
          organization,
          invoice.id,
          JSON.stringify({
            truck_id: truck,
            concept: "Factura ficticia revisada",
            date: "2026-11-15",
            category: "maintenance",
            net_cents: 10001,
            tax_cents: 2100,
            total_cents: 12101,
          }),
        ],
      ),
    );
    expect(entry).toMatch(/^[a-f0-9-]{36}$/);
    expect(
      (
        await db.query(
          "select amount_cents,organization_id,payment_status from public.finance_entries",
        )
      ).rows,
    ).toEqual([
      {
        amount_cents: 10001,
        organization_id: organization,
        payment_status: "pending",
      },
    ]);
    expect(f.modelCalls).toBe(1);
  });
  it("repetir no duplica documentos ni modelos y otra empresa queda aislada aunque importe el mismo PDF", async () => {
    const f = fixture();
    expect((await f.post()).status).toBe(200);
    expect(await (await f.post()).json()).toMatchObject({
      imported: 0,
      skipped: 1,
      ai_used: 0,
    });
    const before = f.requests.length;
    expect((await f.post(other, organization)).status).toBe(403);
    expect(f.requests).toHaveLength(before);
    expect(f.modelCalls).toBe(1);
    expect((await f.post(other, foreign)).status).toBe(200);
    expect(f.modelCalls).toBe(2);
    expect(f.storage.size).toBe(2);
    expect(
      await actor("authenticated", other, () =>
        db.query(
          "select id from private.invoice_documents where organization_id=$1",
          [organization],
        ),
      ),
    ).toMatchObject({ rows: [] });
    expect(
      await actor("authenticated", other, () =>
        db.query("select name from storage.objects where name like $1", [
          organization + "/%",
        ]),
      ),
    ).toMatchObject({ rows: [] });
    expect(
      await actor("anon", null, () =>
        db.query("select name from storage.objects"),
      ),
    ).toMatchObject({ rows: [] });
    expect(
      await value<number>(
        "select count(*)::integer v from private.invoice_documents",
      ),
    ).toBe(2);
    expect(
      await value<number>(
        "select count(*)::integer v from public.finance_entries",
      ),
    ).toBe(0);
  });
  it("consentimiento, permisos IA y servicio desactivado fallan antes de descargar contenido", async () => {
    const f = fixture();
    expect(
      (
        await f.post(owner, organization, {
          consent: { version: "2026-11-16", accepted: false },
        })
      ).status,
    ).toBe(428);
    await db.query(
      "update private.tc_customers set module_overrides=module_overrides||'{\"invoice_ai\":false}'::jsonb where user_id=$1",
      [owner],
    );
    expect((await f.post()).status).toBe(403);
    await db.query(
      "update private.tc_customers set module_overrides=module_overrides||'{\"invoice_ai\":true}'::jsonb where user_id=$1",
      [owner],
    );
    await db.exec("update private.tc_provider_settings set ai_enabled=false");
    expect((await f.post()).status).toBe(503);
    expect(f.requests).toHaveLength(0);
    expect(f.storage.size).toBe(0);
    expect(f.modelCalls).toBe(0);
    expect(
      await value<number>(
        "select count(*)::integer v from private.invoice_documents",
      ),
    ).toBe(0);
  });
  it("el borrado real del SID durante metadata bloquea full, original, IA y alta contable", async () => {
    const f = fixture();
    f.onMetadata(async () => {
      await db.query("delete from auth.sessions where user_id=$1", [owner]);
    });
    const response = await f.post();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "authentication_required" });
    expect(
      f.requests.some(
        (path) =>
          path.includes("format=full") || path.includes("/attachments/"),
      ),
    ).toBe(false);
    expect(f.storage.size).toBe(0);
    expect(f.modelCalls).toBe(0);
    expect(
      await value<number>(
        "select count(*)::integer v from auth.sessions where user_id=$1",
        [owner],
      ),
    ).toBe(0);
    expect(
      await value<number>(
        "select count(*)::integer v from private.invoice_documents",
      ),
    ).toBe(0);
    expect(
      await value<number>(
        "select count(*)::integer v from public.finance_entries",
      ),
    ).toBe(0);
  });
  it("el presupuesto SQL bloquea modelos y una respuesta incierta conserva reserva sin reintento facturable", async () => {
    const f = fixture();
    await db.exec(
      "update private.tc_provider_settings set ai_monthly_budget_cents=100;insert into private.tc_ai_monthly_budget(month,estimated_micro_usd) values(date_trunc('month',now())::date,1000000)",
    );
    expect(await (await f.post()).json()).toMatchObject({
      imported: 1,
      ai_used: 0,
      failures: 1,
    });
    expect(f.modelCalls).toBe(0);
    expect(
      await value<number>(
        "select count(*)::integer v from private.tc_ai_calls",
      ),
    ).toBe(0);
    await db.exec(
      "update private.tc_provider_settings set ai_monthly_budget_cents=1000;update private.tc_ai_monthly_budget set estimated_micro_usd=0",
    );
    f.replaceBytes(
      new TextEncoder().encode(
        "%PDF-1.4\n% FICTITIOUS UNCERTAIN SECOND DOCUMENT\n%%EOF\n",
      ),
    );
    f.setUncertain();
    expect(await (await f.post()).json()).toMatchObject({
      imported: 1,
      ai_used: 0,
      failures: 1,
    });
    expect(f.modelCalls).toBe(1);
    expect(
      await value<number>(
        "select count(*)::integer v from private.tc_ai_calls where state='reserved'",
      ),
    ).toBe(1);
    expect(
      await value<number>(
        "select reserved_micro_usd v from private.tc_ai_monthly_budget",
      ),
    ).toBe(1000000);
    expect(await (await f.post()).json()).toMatchObject({
      imported: 0,
      skipped: 1,
      ai_used: 0,
    });
    expect(f.modelCalls).toBe(1);
    expect(
      await value<number>(
        "select count(*)::integer v from private.invoice_documents where status='needs_review' and net_cents is null",
      ),
    ).toBe(2);
    expect(
      await value<number>(
        "select count(*)::integer v from public.finance_entries",
      ),
    ).toBe(0);
  });
});

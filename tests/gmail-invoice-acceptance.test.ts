/** Cross-layer acceptance: real handlers, crypto, budget and PostgreSQL migrations.
 * Google/OpenAI transports and object storage are isolated fakes. No network or live data.
 */
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { createGmailHandler } from "../supabase/functions/company-gmail/handler";
import type { GmailGateway } from "../supabase/functions/company-gmail/handler";
import { createAiRuntimeResolver } from "../supabase/functions/_shared/ai-runtime";
import { base64, base64url } from "../supabase/functions/_shared/invoice";

const owner = "a5100000-0000-4000-8000-000000000001";
const other = "a5100000-0000-4000-8000-000000000002";
const truck = "a5200000-0000-4000-8000-000000000001";
const appOrigin = "https://truckcontrolai.com";
const endpoint = "https://project.invalid/functions/v1/company-gmail";
const now = Date.UTC(2026, 10, 5, 12);
const day = 86_400_000;
let db: PGlite, organization: string, foreign: string;
let queue = Promise.resolve();
async function value<T>(sql: string, args: unknown[] = []) {
  return (await db.query<{ v: T }>(sql, args)).rows[0].v;
}
async function as<T>(
  role: "authenticated" | "service_role",
  actor: string | null,
  fn: () => Promise<T>,
) {
  const previous = queue;
  let release!: () => void;
  queue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      actor ?? "",
    ]);
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    release();
  }
}
interface Access {
  active: boolean;
  can_manage: boolean;
  can_write: boolean;
  features: Record<string, boolean>;
}
function access(org: string, actor: string) {
  return as("service_role", null, () =>
    value<Access>(
      "select public.tc_company_server_access(p_user=>$1,p_org=>$2) v",
      [actor, org],
    ),
  );
}
function pdf(tag: string) {
  const stream = `BT /F1 12 Tf 30 740 Td (Factura ficticia ${tag} - base 100.01 IVA 21.00 total 121.01 EUR) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let content = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(content.length);
    content += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = content.length;
  content += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  content += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  content += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new TextEncoder().encode(content);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,phone text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;`);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  for (const [n, actor] of [owner, other].entries())
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        actor,
        `acceptance-${n}@fleet.invalid`,
        {
          truckcontrol_registration: {
            contact_name: "Persona ficticia",
            company_name: `Empresa de prueba ${n}`,
            tax_id: `DEMO-ACCEPTANCE-${n}`,
            address: "Dirección ficticia 10",
            phone: `+3460000070${n}`,
          },
        },
      ],
    );
  organization = await value<string>(
    "select id v from public.organizations where owner_id=$1",
    [owner],
  );
  foreign = await value<string>(
    "select id v from public.organizations where owner_id=$1",
    [other],
  );
  await db.exec(`update private.tc_customers set ai_allowed=true,ai_opt_in=true,
    module_overrides='{"documents":true,"gmail":true,"invoice_ai":true}';
    update private.tc_modules set enabled=true where id='invoice_ai';
    update private.tc_provider_settings set ai_enabled=true,ai_monthly_budget_cents=1000;`);
  await db.query(
    "insert into public.trucks(id,organization_id,plate,brand,model,year,inspection_due_on) values($1,$2,'DEMO-ACCEPT','Marca ficticia','Modelo ficticio',2024,'2027-06-01')",
    [truck, organization],
  );
}, 30000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await db?.close();
});

it("recibe, extrae, revisa y aprueba una sola vez; respeta período, empresa, consentimiento y presupuesto", async () => {
  vi.stubGlobal("fetch", async () => {
    throw Error("Live network is forbidden in this isolated acceptance test");
  });
  const storage = new Map<string, Uint8Array>();
  const requests: string[] = [];
  let modelCalls = 0;
  const recent = new Uint8Array(
      readFileSync("public/examples/factura-demostracion.pdf"),
    ),
    old = pdf("DEMO-OLD");
  const messages: {
    id: string;
    date: number;
    bytes: Uint8Array;
    labels: string[];
  }[] = [
    { id: "recent", date: now - day, bytes: recent, labels: ["INBOX"] },
    { id: "duplicate", date: now - day, bytes: recent, labels: ["INBOX"] },
    { id: "old", date: now - 90 * day, bytes: old, labels: ["INBOX"] },
    { id: "sent", date: now - day, bytes: pdf("SENT"), labels: ["SENT"] },
    { id: "future", date: now + day, bytes: pdf("FUTURE"), labels: ["INBOX"] },
  ];
  const model: typeof fetch = async (input, init) => {
    expect(input).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "gpt-6-luna",
      store: false,
      service_tier: "default",
      max_output_tokens: 1200,
    });
    expect(body.tools).toBeUndefined();
    modelCalls++;
    expect(body.input[0].content).toContainEqual({
      type: "input_file",
      filename: "invoice.pdf",
      file_data: `data:application/pdf;base64,${base64(modelCalls === 1 ? recent : old)}`,
    });
    if (modelCalls === 2) throw Error("Synthetic uncertain provider response");
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
                invoice_number: "DEMO-RECENT",
                invoice_date: "2026-11-04",
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
  };
  const ai = createAiRuntimeResolver(
    {
      async config() {
        const policy = await value<Record<string, unknown>>(
          "select jsonb_build_object('enabled',ai_enabled,'model',ai_model,'monthly_budget_cents',ai_monthly_budget_cents) v from private.tc_provider_settings where id",
        );
        return { ...policy, api_key: "sk-" + "synthetic-key-only-".repeat(3) };
      },
      async budget(action, data) {
        return as("service_role", null, () =>
          value("select public.company_ai_budget_server($1,$2::jsonb) v", [
            action,
            JSON.stringify(data),
          ]),
        );
      },
    },
    undefined,
    model,
  );
  const gateway: GmailGateway = {
    async authenticate(token) {
      return token === "actor-a"
        ? { id: owner }
        : token === "actor-b"
          ? { id: other }
          : null;
    },
    async owns(org, actor) {
      return (await access(org, actor)).active;
    },
    async actionAllowed(org, actor, action) {
      const permission = await access(org, actor);
      return (
        permission.active &&
        (action === "status" ||
          (action === "sync" ? permission.can_write : permission.can_manage))
      );
    },
    async featureAllowed(org, actor, feature) {
      return Boolean((await access(org, actor)).features[feature]);
    },
    async server<T>(action: string, data: Record<string, unknown>) {
      return as("service_role", null, () =>
        value<T>("select public.gmail_server($1,$2::jsonb) v", [
          action,
          JSON.stringify(data),
        ]),
      );
    },
    async upload(path, bytes) {
      expect(path.startsWith(organization + "/")).toBe(true);
      storage.set(path, bytes);
    },
    async remove(path) {
      storage.delete(path);
    },
  };
  const google: typeof fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url.href);
    if (url.href === "https://oauth2.googleapis.com/token")
      return Response.json({
        access_token: "synthetic-google-access",
        refresh_token: "synthetic-google-refresh",
        scope: "openid email https://www.googleapis.com/auth/gmail.readonly",
      });
    if (url.href === "https://openidconnect.googleapis.com/v1/userinfo")
      return Response.json({
        sub: "synthetic-google-subject",
        email: "invoices@fleet.invalid",
        email_verified: true,
      });
    if (url.pathname.endsWith("/profile"))
      return Response.json({ emailAddress: "invoices@fleet.invalid" });
    if (url.pathname.endsWith("/messages")) {
      expect(url.searchParams.get("q")).toMatch(/after:\d+ before:\d+/);
      return Response.json({ messages: messages.map(({ id }) => ({ id })) });
    }
    const match = url.pathname.match(
      /\/messages\/([^/]+)(\/attachments\/[^/]+)?$/,
    );
    const message = messages.find((m) => m.id === match?.[1]);
    if (!message) throw Error("Unexpected Google request: " + url.pathname);
    if (match?.[2]) return Response.json({ data: base64url(message.bytes) });
    if (url.searchParams.get("format") === "metadata")
      return Response.json({
        internalDate: String(message.date),
        labelIds: message.labels,
      });
    return Response.json({
      internalDate: String(message.date),
      payload: {
        filename: "Factura-ficticia.pdf",
        mimeType: "application/pdf",
        body: { size: message.bytes.length, attachmentId: "attachment" },
      },
    });
  };
  const handler = createGmailHandler(
    gateway,
    {
      enforceCompanyRoles: true,
      enforceEntitlements: true,
      enforceReceivedPeriod: true,
      now: () => now,
      appOrigin,
      callbackUrl: `${appOrigin}/gmail-callback`,
      oauth: {
        clientId: "synthetic-client",
        clientSecret: "synthetic-secret",
        encryptionKey: base64(new Uint8Array(32).fill(7)),
      },
      resolveAI: (organization_id, user_id) =>
        ai.resolve({ organization_id, user_id, kind: "invoice" }),
    },
    google,
  );
  const post = (
    action: string,
    extra: Record<string, unknown> = {},
    token = "actor-a",
  ) =>
    handler(
      new Request(endpoint, {
        method: "POST",
        headers: {
          origin: appOrigin,
          authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          organization_id: organization,
          ...extra,
        }),
      }),
    );
  const start = await post("start");
  expect(start.status).toBe(200);
  const state = new URL((await start.json()).url).searchParams.get("state");
  const callback = await handler(
    new Request(endpoint + "/oauth-callback", {
      method: "POST",
      headers: { origin: appOrigin, "Content-Type": "application/json" },
      body: JSON.stringify({ state, code: "synthetic-authorization-code" }),
    }),
  );
  const destination = new URL((await callback.json()).url);
  const ticket = new URLSearchParams(destination.hash.split("?")[1]).get(
    "gmail_ticket",
  );
  expect(ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect((await post("complete", { ticket })).status).toBe(200);
  expect((await post("complete", { ticket })).status).toBe(403);
  const cipher = await value<string>(
    "select refresh_token_cipher v from private.gmail_tokens where organization_id=$1",
    [organization],
  );
  expect(cipher).toMatch(/^v1\./);
  expect(cipher).not.toContain("synthetic-google-refresh");

  const first = await post("sync_period");
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ imported: 1 });
  expect(storage.size).toBe(1);
  expect(modelCalls).toBe(1);
  for (const id of ["old", "sent", "future"])
    expect(
      requests.some((u) => u.includes(`/messages/${id}?format=full`)),
    ).toBe(false);
  expect(
    await value<number>(
      "select count(*)::integer v from public.finance_entries",
    ),
  ).toBe(0);
  const invoice = await as("authenticated", owner, () =>
    value<{
      id: string;
      status: string;
      net_cents: number;
      tax_cents: number;
      total_cents: number;
    }>(
      "select to_jsonb(i) v from private.invoice_documents i where organization_id=$1",
      [organization],
    ),
  );
  expect(invoice).toMatchObject({
    status: "needs_review",
    net_cents: 10001,
    tax_cents: 2100,
    total_cents: 12101,
  });
  expect(
    await as("authenticated", other, () =>
      db.query(
        "select id from private.invoice_documents where organization_id=$1",
        [organization],
      ),
    ),
  ).toMatchObject({ rows: [] });
  const entry = {
    truck_id: truck,
    concept: "Factura ficticia revisada",
    date: "2026-11-04",
    category: "maintenance",
    net_cents: 10001,
    tax_cents: 2100,
    total_cents: 12101,
  };
  await expect(
    as("authenticated", other, () =>
      value("select public.approve_company_invoice($1,$2,$3::jsonb) v", [
        organization,
        invoice.id,
        JSON.stringify(entry),
      ]),
    ),
  ).rejects.toThrow();
  const approve = () =>
    as("authenticated", owner, () =>
      value<string>(
        "select public.approve_company_invoice($1,$2,$3::jsonb) v",
        [organization, invoice.id, JSON.stringify(entry)],
      ),
    );
  const approved = await approve();
  expect(await approve()).toBe(approved);
  expect(
    (
      await db.query(
        "select amount_cents,payment_status,organization_id from public.finance_entries",
      )
    ).rows,
  ).toEqual([
    {
      amount_cents: 10001,
      payment_status: "pending",
      organization_id: organization,
    },
  ]);
  expect((await post("sync_period")).status).toBe(200);
  expect(modelCalls).toBe(1);
  expect(storage.size).toBe(1);

  const extended = await post("sync_period", {
    received_period: { from: "2025-11-06", to: "2026-11-05" },
  });
  expect(extended.status).toBe(200);
  expect(await extended.json()).toMatchObject({ imported: 1 });
  expect(modelCalls).toBe(2);
  expect(storage.size).toBe(2);
  const uncertain = (
    await db.query<{
      net_cents: number | null;
      status: string;
      review_note: string;
    }>(
      "select net_cents,status,review_note from private.invoice_documents where message_id='old'",
    )
  ).rows[0];
  expect(uncertain.net_cents).toBeNull();
  expect(uncertain.status).toBe("needs_review");
  expect(uncertain.review_note).toContain("Revisa");
  await post("sync_period", {
    received_period: { from: "2025-11-06", to: "2026-11-05" },
  });
  expect(modelCalls).toBe(2);
  expect(
    await value<number>("select count(*)::integer v from private.tc_ai_calls"),
  ).toBe(2);
  expect(
    await value<number>(
      "select reserved_micro_usd v from private.tc_ai_monthly_budget",
    ),
  ).toBe(1_000_000);

  await db.query(
    "update private.tc_customers set ai_opt_in=false where user_id=$1",
    [owner],
  );
  messages.push({
    id: "without-consent",
    date: now - day,
    bytes: pdf("CONSENT-OFF"),
    labels: ["INBOX"],
  });
  expect((await post("sync_period")).status).toBe(200);
  expect(modelCalls).toBe(2);
  expect(
    await value<number>(
      "select count(*)::integer v from private.invoice_documents",
    ),
  ).toBe(3);
  await db.query(
    "update private.tc_customers set ai_opt_in=true where user_id=$1",
    [owner],
  );
  await db.exec(
    "update private.tc_provider_settings set ai_monthly_budget_cents=100",
  );
  messages.push({
    id: "budget-blocked",
    date: now - day,
    bytes: pdf("BUDGET-BLOCKED"),
    labels: ["INBOX"],
  });
  expect((await post("sync_period")).status).toBe(200);
  expect(modelCalls).toBe(2);
  expect(
    await value<number>("select count(*)::integer v from private.tc_ai_calls"),
  ).toBe(2);
  expect(
    await value<number>(
      "select count(*)::integer v from private.invoice_documents",
    ),
  ).toBe(4);
  expect(
    await value<number>(
      "select count(*)::integer v from public.finance_entries",
    ),
  ).toBe(1);
  const before = requests.length;
  expect(
    (
      await post("sync_period", {
        received_period: { from: "2025-10-01", to: "2026-11-05" },
      })
    ).status,
  ).toBe(400);
  expect((await post("sync_period", {}, "actor-b")).status).toBe(403);
  await db.query(
    "update private.tc_customers set status='suspended' where user_id=$1",
    [owner],
  );
  expect((await post("sync_period")).status).toBe(403);
  expect(requests).toHaveLength(before);
  expect(modelCalls).toBe(2);
  expect(
    await as("authenticated", other, () =>
      db.query(
        "select id from private.invoice_documents where organization_id=$1",
        [foreign],
      ),
    ),
  ).toMatchObject({ rows: [] });
}, 20000);

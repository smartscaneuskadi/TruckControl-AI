/** Synthetic database/provider transports only. No real accounts, keys or calls. */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import {
  installAuthSessionFixture,
  seedFixtureSessions,
} from "./helpers/auth-session-fixture";
import { createGmailHandler } from "../supabase/functions/company-gmail/handler";
import type { GmailGateway } from "../supabase/functions/company-gmail/handler";
import { base64, seal } from "../supabase/functions/_shared/invoice";

const actor = "a7100000-0000-4000-8000-000000000001";
const other = "a7100000-0000-4000-8000-000000000002";
const leaseA = "a7300000-0000-4000-8000-000000000001";
const leaseB = "a7300000-0000-4000-8000-000000000002";
const encryptionKey = base64(new Uint8Array(32).fill(17));
const appOrigin = "https://truckcontrol.example";
let db: PGlite, org: string, foreign: string;
async function value<T>(sql: string, args: unknown[] = []) {
  return (await db.query<{ v: T }>(sql, args)).rows[0].v;
}
async function server<T>(action: string, data: Record<string, unknown>) {
  // Model each real PostgREST RPC's transaction boundary inside test rollback.
  await db.exec("savepoint rpc;set local role service_role");
  try {
    const result = await value<T>(
      "select public.gmail_server($1,$2::jsonb) v",
      [action, JSON.stringify(data)],
    );
    await db.exec("reset role;release savepoint rpc");
    return result;
  } catch (error) {
    await db.exec("rollback to savepoint rpc;reset role;release savepoint rpc");
    throw error;
  }
}
function context(id = leaseA, company = org, user = actor) {
  return { organization_id: company, user_id: user, sync_lease_id: id };
}
async function connect(
  subject = "synthetic-mailbox-a",
  company = org,
  user = actor,
) {
  return server("connect", {
    organization_id: company,
    user_id: user,
    google_subject: subject,
    email: `${subject}@example.invalid`,
    refresh_token_cipher: await seal(
      "synthetic-refresh",
      encryptionKey,
      `${company}:${user}:${subject}`,
    ),
  });
}
async function state(company = org) {
  return value<Record<string, unknown>>(
    "select to_jsonb(c) v from private.gmail_connections c where organization_id=$1",
    [company],
  );
}
function invoice(lease = context()) {
  const id = crypto.randomUUID();
  return {
    ...lease,
    message_id: "synthetic-message",
    attachment_id: "synthetic-attachment",
    content_hash: "a".repeat(64),
    net_cents: null,
    tax_cents: null,
    total_cents: null,
    document: {
      id,
      name: "Factura ficticia.pdf",
      object_path: `${org}/${id}/document.pdf`,
      content_type: "application/pdf",
      size_bytes: 20,
    },
  };
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated,service_role;`);
  await installAuthSessionFixture(db);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(
    "update private.tc_settings set enforce_access=true,registration_open=true,sms_ready=false",
  );
  for (const [n, user] of [actor, other].entries()) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        user,
        `synthetic-lease-${n}@example.invalid`,
        JSON.stringify({
          truckcontrol_registration: {
            contact_name: "Persona ficticia",
            company_name: `Empresa ficticia ${n}`,
            tax_id: `DEMO-LEASE-${n}`,
            address: "Dirección ficticia 1",
            phone: `+3460000080${n}`,
          },
        }),
      ],
    );
  }
  org = await value<string>(
    "select id v from public.organizations where owner_id=$1",
    [actor],
  );
  foreign = await value<string>(
    "select id v from public.organizations where owner_id=$1",
    [other],
  );
  await db.exec(`update private.tc_customers set ai_allowed=true,ai_opt_in=true,module_overrides='{"gmail":true,"documents":true,"invoice_ai":true}';
    update private.tc_modules set enabled=true where id='invoice_ai';`);
  await seedFixtureSessions(db);
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
  await connect();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.exec("rollback");
});
afterAll(async () => {
  await db?.close();
});

it("binds credentials and private writes to one active company lease", async () => {
  expect(await server("lock_sync", context())).toBe(true);
  expect(await server("lock_sync", context(leaseB))).toBe(false);
  expect(await server("assert_sync", context())).toBe(true);
  expect(
    await server<Record<string, unknown>>("credentials", context()),
  ).toMatchObject({ google_subject: "synthetic-mailbox-a", user_id: actor });
  await server("record_invoice", invoice());
  expect(
    await value(
      "select count(*)::int v from private.invoice_documents where organization_id=$1",
      [org],
    ),
  ).toBe(1);
  await server("finish_sync", {
    ...context(),
    succeeded: true,
    reauthorize: false,
    page_token: "synthetic-cursor",
  });
  expect(await state()).toMatchObject({
    status: "connected",
    sync_lease_id: null,
    sync_lease_actor: null,
    sync_page_token: "synthetic-cursor",
  });
  expect(await server("assert_sync", context())).toBe(false);
});

it.each(["synthetic-mailbox-a", "synthetic-mailbox-b"])(
  "a renewed %s connection survives stale invalid_grant and stale cursors",
  async (subject) => {
    await server("lock_sync", context());
    await connect(subject);
    expect(await server("lock_sync", context(leaseB))).toBe(true);
    const fresh = await state();
    await server("finish_sync", {
      ...context(),
      reauthorize: true,
      succeeded: true,
      page_token: "stale",
    });
    expect(await state()).toEqual(fresh);
    expect(await server("assert_sync", context())).toBe(false);
    expect(await server("assert_sync", context(leaseB))).toBe(true);
  },
);

it("rejects stale invoice and credential operations after reconnect without partial metadata", async () => {
  await server("lock_sync", context());
  await connect("synthetic-mailbox-b");
  // Each error is rolled back independently so the enclosing transaction survives.
  for (const action of [
    "credentials",
    "exists",
    "reserve_ai",
    "record_invoice",
  ]) {
    await db.exec("savepoint rejected");
    await expect(
      server(action, action === "record_invoice" ? invoice() : context()),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("rollback to savepoint rejected");
  }
  expect(
    await value("select count(*)::int v from private.company_documents"),
  ).toBe(0);
  expect(
    await value("select count(*)::int v from private.invoice_documents"),
  ).toBe(0);
});

it("an expired lease cannot finish or steal a replacement worker", async () => {
  await server("lock_sync", context());
  await db.query(
    "update private.gmail_connections set sync_lease_until=now()-interval '1 second' where organization_id=$1",
    [org],
  );
  expect(await server("assert_sync", context())).toBe(false);
  expect(await server("lock_sync", context(leaseB))).toBe(true);
  const fresh = await state();
  await server("finish_sync", { ...context(), reauthorize: true });
  await server("finish_sync", { organization_id: org, reauthorize: true });
  expect(await state()).toEqual(fresh);
});

it("a legacy acquisition cannot revive an expired fenced worker", async () => {
  await server("lock_sync", context());
  await db.query(
    "update private.gmail_connections set sync_lease_until=now()-interval '1 second' where organization_id=$1",
    [org],
  );
  expect(await server("lock_sync", { organization_id: org })).toBe(true);
  expect(await server("assert_sync", context())).toBe(false);
  expect(await state()).toMatchObject({
    sync_lease_id: null,
    sync_lease_actor: null,
  });
  const fresh = await state();
  await server("finish_sync", { ...context(), reauthorize: true });
  expect(await state()).toEqual(fresh);
});

it("keeps company and actor identity bound even if a caller guesses another lease", async () => {
  await connect("synthetic-foreign", foreign, other);
  await server("lock_sync", context());
  await server("lock_sync", context(leaseB, foreign, other));
  expect(await server("assert_sync", context(leaseA, foreign, other))).toBe(
    false,
  );
  expect(await server("assert_sync", context(leaseA, org, other))).toBe(false);
  expect(await server("assert_sync", context(leaseB, foreign, actor))).toBe(
    false,
  );
  expect(await server("assert_sync", context())).toBe(true);
});

it.each(["banned", "deleted", "unconfirmed", "disabled-module"])(
  "rechecks permission before a write: %s",
  async (reason) => {
    await server("lock_sync", context());
    if (reason === "banned")
      await db.query(
        "update auth.users set banned_until=now()+interval '1 day' where id=$1",
        [actor],
      );
    else if (reason === "deleted")
      await db.query("update auth.users set deleted_at=now() where id=$1", [
        actor,
      ]);
    else if (reason === "unconfirmed")
      await db.query(
        "update auth.users set email_confirmed_at=null where id=$1",
        [actor],
      );
    else
      await db.query(
        "update private.tc_customers set module_overrides='{" +
          '"gmail":false' +
          "}' where user_id=$1",
        [actor],
      );
    expect(await server("assert_sync", context())).toBe(false);
    await db.exec("savepoint denied");
    await expect(server("record_invoice", invoice())).rejects.toMatchObject({
      code: "42501",
    });
    await db.exec("rollback to savepoint denied");
    await server("finish_sync", {
      ...context(),
      succeeded: true,
      reauthorize: true,
    });
    expect(await state()).toMatchObject({
      status: "connected",
      sync_lease_id: null,
      last_sync_at: null,
    });
  },
);

it.each(["anon", "authenticated"])(
  "denies browser roles access to lease RPC and private rows: %s",
  async (role) => {
    for (const sql of [
      "select public.gmail_server('lock_sync','{}')",
      "select private.tc_gmail_sync_fenced('lock_sync','{}')",
      "select sync_lease_id from private.gmail_connections",
    ]) {
      await db.exec("savepoint browser;set local role " + role);
      await expect(db.exec(sql)).rejects.toMatchObject({ code: "42501" });
      await db.exec("rollback to savepoint browser;reset role");
    }
  },
);

function request() {
  return new Request(`${appOrigin}/company-gmail`, {
    method: "POST",
    headers: {
      origin: appOrigin,
      authorization: "Bearer synthetic-owner",
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "sync", organization_id: org }),
  });
}
function gateway(upload: GmailGateway["upload"] = async () => {}) {
  return {
    authenticate: async () => ({ id: actor }),
    owns: async (company, user) => company === org && user === actor,
    server,
    upload,
    remove: vi.fn(async () => {}),
  } satisfies GmailGateway;
}
const config = {
  appOrigin,
  callbackUrl: `${appOrigin}/gmail-callback`,
  enforceSyncLease: true,
  oauth: {
    clientId: "synthetic-client",
    clientSecret: "synthetic-secret",
    encryptionKey,
  },
};

it.each([
  ["invalid_grant", 400],
  ["invalid_client", 401],
  ["server_error", 500],
] as const)(
  "a delayed %s cannot invalidate a freshly connected mailbox",
  async (error, status) => {
    const g = gateway();
    const fetcher = vi.fn<typeof fetch>(async () => {
      await connect("synthetic-mailbox-b");
      return Response.json({ error }, { status });
    });
    const response = await createGmailHandler(g, config, fetcher)(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "gmail_sync_superseded",
      imported: 0,
    });
    expect(await state()).toMatchObject({
      status: "connected",
      google_subject: "synthetic-mailbox-b",
      sync_lease_id: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it("cleans up an uploaded object when reconnect wins the final document commit", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\nsynthetic invoice only");
  const upload = vi.fn(async () => {
    await connect("synthetic-mailbox-b");
  });
  const g = gateway(upload);
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes("oauth2.googleapis.com"))
      return Response.json({ access_token: "synthetic-access" });
    if (url.includes("/attachments/"))
      return Response.json({ data: base64(bytes) });
    if (url.includes("/messages/synthetic"))
      return Response.json({
        payload: {
          filename: "factura.pdf",
          body: { attachmentId: "synthetic-attachment", size: bytes.length },
        },
      });
    return Response.json({ messages: [{ id: "synthetic-message" }] });
  });
  const response = await createGmailHandler(g, config, fetcher)(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    error: "gmail_sync_superseded",
    imported: 0,
  });
  expect(upload).toHaveBeenCalledTimes(1);
  expect(g.remove).toHaveBeenCalledTimes(1);
  expect(
    await value("select count(*)::int v from private.company_documents"),
  ).toBe(0);
  expect(
    await value("select count(*)::int v from private.invoice_documents"),
  ).toBe(0);
  expect(await state()).toMatchObject({
    status: "connected",
    google_subject: "synthetic-mailbox-b",
  });
});

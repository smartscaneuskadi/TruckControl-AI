import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { createRecurringHandler, type RecurringGateway } from "../supabase/functions/truckcontrol-subscriptions/handler.ts";
import { createLegacyStripeServer } from "../supabase/functions/_shared/subscription-legacy-payment-gate.ts";
import { financialDatabase, type Json } from "./helpers/subscription-financial-db";

const origin = "https://reserved-quote.example.invalid";
const terms = "synthetic-reserved-quote-v1";
const oldMigration = "supabase/migrations/20261113233252_subscription_snapshot_ordering.sql";
const oldSource = readFileSync(oldMigration, "utf8");
const functionStart = "create or replace function public.tc_recurring_billing";
const priorFunction = oldSource.slice(oldSource.indexOf(functionStart), oldSource.indexOf("\n$$;") + 4);
let db: PGlite;
let sequence = 0;
let baseline: Json;

async function databaseState() {
  return (await db.query<{ result: Json }>(`select jsonb_build_object(
    'settings',(select to_jsonb(s) from private.tc_settings s where id),
    'customers',(select jsonb_agg(to_jsonb(c) order by user_id) from private.tc_customers c),
    'requests',(select jsonb_agg(to_jsonb(r) order by id) from private.tc_payment_requests r),
    'reservations',(select jsonb_agg(to_jsonb(o) order by user_id) from private.tc_subscription_orders o),
    'subscriptions',(select jsonb_agg(to_jsonb(b) order by provider_id) from private.tc_billing_subscriptions b),
    'events',(select jsonb_agg(to_jsonb(e) order by event_id) from private.tc_subscription_events e),
    'invoices',(select jsonb_agg(to_jsonb(i) order by invoice_id) from private.tc_subscription_invoices i),
    'tasks',(select jsonb_agg(to_jsonb(t) order by id) from private.tc_manual_subscription_invoice_tasks t),
    'audit',(select jsonb_agg(to_jsonb(a) order by id) from private.tc_admin_audit a)
  ) result`)).rows[0].result;
}

// A failed PostgreSQL statement aborts its transaction. A request savepoint
// keeps each denial test inspectable without weakening the production RPC.
async function server<T = Json>(action: string, data: Json, role = "service_role"): Promise<T> {
  await db.exec("savepoint billing_request");
  try {
    await db.exec("set local role " + role);
    const result = (await db.query<{ result: T }>(
      "select public.tc_recurring_billing($1,$2::jsonb) result", [action, JSON.stringify(data)],
    )).rows[0].result;
    await db.exec("reset role; release savepoint billing_request");
    return result;
  } catch (failure) {
    await db.exec("rollback to savepoint billing_request; release savepoint billing_request");
    throw failure;
  }
}

async function fixture(ageHours = 23) {
  const n = ++sequence, user = randomUUID(), requestId = randomUUID();
  const checkoutId = "cs_test_ReservedQuote" + n;
  const hostedUrl = "https://checkout.stripe.com/c/pay/" + checkoutId;
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3::jsonb)",
    [user, "reserved-quote-" + n + "@example.invalid", JSON.stringify({ truckcontrol_registration: {
      contact_name: "Synthetic quote reviewer", company_name: "Synthetic reserved quote " + n,
      tax_id: "SYNTHETIC-QUOTE-" + n, address: "Synthetic quote address 123",
      phone: "+1202555" + String(1000 + n), requested_plan: "limited",
    } })],
  );
  await db.query("update private.tc_customers set trial_ends_at=now()+interval '49 hours',trial_started_at=now()+interval '49 hours'-interval '10 days' where user_id=$1", [user]);
  await db.query(`insert into private.tc_payment_requests(
    id,user_id,plan_id,quoted_cents,plan_revision,status,created_at,net_cents,vat_rate_bps,vat_cents
  ) select $1,$2,id,36300,revision,'requested',now()-$3*interval '1 hour',30000,2100,6300
    from private.tc_plans where id='limited'`, [requestId, user, ageHours]);
  const now = (await db.query<{ stamp: number }>("select floor(extract(epoch from now()))::float8 stamp")).rows[0].stamp;
  const session: Json = {
    id: checkoutId, object: "checkout.session", livemode: false, mode: "subscription",
    status: "open", payment_status: "unpaid", subscription: null, payment_intent: null,
    customer: null, currency: "eur", amount_total: 0, amount_subtotal: 0,
    expires_at: now + 23 * 3600, url: hostedUrl,
    metadata: { tc_user_id: user, tc_request_id: requestId, tc_terms_version: terms },
    line_items: { has_more: false, data: [{ quantity: 1, currency: "eur", price: {
      id: "price_ReservedQuote" + n, currency: "eur", unit_amount: 36300,
      recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    } }] },
  };
  const calls: { action: string; data: Json }[] = [];
  const gateway: RecurringGateway = {
    authenticate: async (token) => token === "synthetic-session" ? { id: user } : null,
    server: createLegacyStripeServer("recurring", async (action, data) => {
      calls.push({ action, data });
      return server(action, data);
    }),
  };
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url === "https://api.stripe.com/v1/checkout/sessions" && init?.method === "POST") {
      session.expires_at = Number(new URLSearchParams(String(init.body)).get("expires_at"));
      return Response.json(session);
    }
    if (url === "https://api.stripe.com/v1/checkout/sessions/" + checkoutId + "?expand%5B%5D=line_items" && init?.method === "GET")
      return Response.json(session);
    throw Error("Unexpected synthetic provider request; no network fallback");
  });
  const handler = createRecurringHandler(gateway, {
    appOrigin: origin, enabled: true, invoicingVerified: true,
    stripeKey: "rk_test_syntheticReservedQuoteAge", termsVersion: terms, termsUrl: origin + "/terms",
  }, fetcher);
  const open = (changes: Json = {}) => handler(new Request("https://edge.example.invalid/subscriptions", {
    method: "POST", headers: { origin, authorization: "Bearer synthetic-session", "content-type": "application/json" },
    body: JSON.stringify({ action: "checkout", request_id: requestId, terms_accepted: true, terms_version: terms, ...changes }),
  }));
  const prepare = (changes: Json = {}) => server("prepare", {
    user_id: user, request_id: requestId, terms_accepted: true, terms_version: terms, ...changes,
  });
  async function advanceTwoHours() {
    // Model T0 quote -> T+23h prepare/save -> T+25h reopen. PGlite's
    // PostgreSQL clock is independent of JS fake timers, so move fixture
    // timestamps back by two hours while preserving each elapsed interval.
    await db.query("update private.tc_payment_requests set created_at=created_at-interval '2 hours' where id=$1", [requestId]);
    await db.query("update private.tc_subscription_orders set created_at=created_at-interval '2 hours',terms_accepted_at=terms_accepted_at-interval '2 hours',expires_at=expires_at-interval '2 hours' where user_id=$1", [user]);
    await db.query("update private.tc_customers set trial_started_at=trial_started_at-interval '2 hours',trial_ends_at=trial_ends_at-interval '2 hours' where user_id=$1", [user]);
    session.expires_at = Number(session.expires_at) - 2 * 3600;
  }
  return { user, requestId, checkoutId, hostedUrl, session, calls, fetcher, gateway, open, prepare, advanceTwoHours };
}

async function savedOldFixture() {
  const f = await fixture();
  expect((await f.open()).status).toBe(200);
  await f.advanceTwoHours();
  f.calls.length = 0;
  f.fetcher.mockClear();
  return f;
}

beforeAll(async () => {
  db = await financialDatabase();
  baseline = await databaseState();
}, 30_000);
beforeEach(async () => {
  await db.exec("begin; update private.tc_settings set payments_enabled=true,prices_are_examples=false where id");
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.exec("rollback");
  expect(await databaseState()).toEqual(baseline);
});
afterAll(async () => { await db?.close(); });

describe("saved recurring checkout outlives its original quote age", () => {
  it("reopens the exact saved session at T+25h after a T+23h checkout without another POST or entitlement", async () => {
    const f = await fixture();
    const initial = await f.open();
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({ url: f.hostedUrl });
    await f.advanceTwoHours();
    const before = await databaseState();
    const remaining = (await db.query<{ hours: number }>("select extract(epoch from (expires_at-now()))::float8/3600 hours from private.tc_subscription_orders where user_id=$1", [f.user])).rows[0].hours;
    expect(remaining).toBe(21);
    for (let repeat = 0; repeat < 2; repeat++) {
      const reopened = await f.open();
      expect(reopened.status).toBe(200);
      expect(await reopened.json()).toEqual({ url: f.hostedUrl });
    }
    expect(f.calls.map((call) => call.action)).toEqual(["prepare", "saved", "prepare", "prepare"]);
    expect(f.fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET", "GET"]);
    expect(await databaseState()).toEqual(before);
    expect((await db.query(`select
      (select count(*)::int from private.tc_billing_subscriptions where user_id=$1) subscriptions,
      (select count(*)::int from private.tc_subscription_invoices where user_id=$1) invoices,
      (select count(*)::int from private.tc_manual_subscription_invoice_tasks where buyer_user_id=$1) fiscal_tasks,
      (select paid_until from private.tc_customers where user_id=$1) paid_until`, [f.user])).rows).toEqual([
      { subscriptions: 0, invoices: 0, fiscal_tasks: 0, paid_until: null },
    ]);
  });

  it("reproduces the age rejection using the immutable prior function", async () => {
    const f = await savedOldFixture();
    await db.exec(priorFunction);
    const before = await databaseState();
    await expect(f.prepare()).rejects.toThrow("Vuelve a solicitar el plan");
    expect(await databaseState()).toEqual(before);
    expect(f.fetcher).not.toHaveBeenCalled();
  });

  it("blocks an old quote that has never reserved or saved a checkout", async () => {
    const f = await fixture(25), before = await databaseState();
    expect((await f.open()).status).toBe(503);
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(await databaseState()).toEqual(before);
  });

  it("keeps an unknown provider outcome fenced when neither stored checkout ID exists", async () => {
    const f = await fixture();
    await f.prepare();
    await f.advanceTwoHours();
    const before = await databaseState();
    expect((await f.open()).status).toBe(503);
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(await databaseState()).toEqual(before);
  });

  it.each(["request ID absent", "reservation ID absent", "different IDs", "malformed matching IDs", "requested status", "paid status", "cancelled status"])(
    "does not treat %s as saved checkout recovery", async (attack) => {
      const f = await savedOldFixture();
      if (attack === "request ID absent") await db.query("update private.tc_payment_requests set checkout_id=null where id=$1", [f.requestId]);
      if (attack === "reservation ID absent") await db.query("update private.tc_subscription_orders set checkout_id=null where user_id=$1", [f.user]);
      if (attack === "different IDs") await db.query("update private.tc_subscription_orders set checkout_id='cs_test_AnotherSavedQuote' where user_id=$1", [f.user]);
      if (attack === "malformed matching IDs") {
        await db.query("update private.tc_subscription_orders set checkout_id='cs_bad?expand[]=customer' where user_id=$1", [f.user]);
        await db.query("update private.tc_payment_requests set checkout_id='cs_bad?expand[]=customer' where id=$1", [f.requestId]);
      }
      if (attack.endsWith(" status")) await db.query("update private.tc_payment_requests set status=$1 where id=$2", [attack.split(" ")[0], f.requestId]);
      const before = await databaseState();
      expect((await f.open()).status).toBe(503);
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(await databaseState()).toEqual(before);
    },
  );

  it.each(["terms", "request", "user", "unpublished plan", "changed revision", "suspended account", "payments off", "example prices"])(
    "preserves the existing %s boundary for an old saved quote", async (attack) => {
      const f = await savedOldFixture();
      if (attack === "terms") await db.query("update private.tc_subscription_orders set terms_version='synthetic-other-terms' where user_id=$1", [f.user]);
      if (attack === "unpublished plan") await db.exec("update private.tc_plans set published=false where id='limited'");
      if (attack === "changed revision") await db.exec("update private.tc_plans set revision=revision+1 where id='limited'");
      if (attack === "suspended account") await db.query("update private.tc_customers set status='suspended' where user_id=$1", [f.user]);
      if (attack === "payments off") await db.exec("update private.tc_settings set payments_enabled=false where id");
      if (attack === "example prices") await db.exec("update private.tc_settings set prices_are_examples=true where id");
      const other = attack === "user" || attack === "request" ? await fixture() : null;
      const before = await databaseState();
      if (attack === "user") await expect(f.prepare({ user_id: other!.user })).rejects.toThrow("Vuelve a solicitar el plan");
      else if (attack === "request") await expect(f.prepare({ request_id: other!.requestId })).rejects.toThrow("Vuelve a solicitar el plan");
      else expect((await f.open()).status).toBe(503);
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(await databaseState()).toEqual(before);
    },
  );

  it.each(["active", "canceled", "incomplete_expired"])(
    "does not create a replacement reservation for a %s subscription", async (state) => {
      const f = await savedOldFixture();
      await db.query(`insert into private.tc_billing_subscriptions(
        provider_id,user_id,request_id,customer_id,plan_id,monthly_cents,state,period_end,event_created
      ) values('sub_ReservedQuoteExisting',$1,$2,'cus_ReservedQuoteExisting','limited',36300,$3,now()+interval '30 days',extract(epoch from now())::bigint)`, [f.user, f.requestId, state]);
      const before = await databaseState();
      expect((await f.open()).status).toBe(503);
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(await databaseState()).toEqual(before);
    },
  );

  it.each(["saved", "unknown"])("never frees an expired %s reservation using the quote-age exception", async (kind) => {
    const f = await savedOldFixture();
    await db.query("update private.tc_subscription_orders set expires_at=now() where user_id=$1", [f.user]);
    if (kind === "unknown") {
      await db.query("update private.tc_subscription_orders set checkout_id=null where user_id=$1", [f.user]);
      await db.query("update private.tc_payment_requests set status='requested',checkout_id=null where id=$1", [f.requestId]);
    }
    const before = await databaseState();
    expect((await f.open()).status).toBe(409);
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(await databaseState()).toEqual(before);
  });

  it.each(["anon", "authenticated"])("retains denial of the server-only RPC for %s", async (role) => {
    const f = await savedOldFixture(), before = await databaseState();
    await expect(server("prepare", { user_id: f.user, request_id: f.requestId, terms_accepted: true, terms_version: terms }, role)).rejects.toThrow(/permission denied/);
    expect(await databaseState()).toEqual(before);
  });

  it("keeps legacy paid mutations disabled after recovering a saved checkout", async () => {
    const f = await savedOldFixture();
    expect((await f.open()).status).toBe(200);
    const before = await databaseState();
    await expect(f.gateway.server("event", { user_id: f.user, event_type: "invoice.paid", invoice_paid: true })).rejects.toThrow("legacy_paid_webhook_disabled");
    expect(await databaseState()).toEqual(before);
  });

  it("rejects another request of the same buyer without moving its saved reservation", async () => {
    const f = await savedOldFixture(), otherRequest = randomUUID();
    await db.query(`insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status)
      select $1,$2,id,84700,revision,'requested' from private.tc_plans where id='full'`, [otherRequest, f.user]);
    const before = await databaseState();
    await expect(f.prepare({ request_id: otherRequest })).rejects.toThrow("Ya existe un proceso de suscripción pendiente");
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(await databaseState()).toEqual(before);
  });
});

function candidateMigration() {
  const paths = readdirSync("supabase/migrations").filter((path) => path.endsWith("_subscription_reserved_quote_recovery.sql"));
  expect(paths).toHaveLength(1);
  return readFileSync("supabase/migrations/" + paths[0], "utf8");
}

async function functionIdentity() {
  return (await db.query(`select oid::text,proowner::text,proacl::text,provolatile,prosecdef,proconfig
    from pg_proc where oid='public.tc_recurring_billing(text,jsonb)'::regprocedure`)).rows[0];
}

describe("saved checkout recovery additive migration boundaries", () => {
  it("runs the same rollback-only SQL contract used by isolated real PostgreSQL", async () => {
    const results = await db.exec(readFileSync("tests/postgres/reserved_quote_contract.sql", "utf8"));
    const result = results.at(-1)?.rows[0]?.result as Json;
    expect(result).toMatchObject({ contract: "reserved-recurring-quote-age-v1", provider_calls: 0, paid_mutations: 0, rollback_required: true });
    expect(result.checks).toHaveLength(27);
    expect(new Set(result.checks as string[]).size).toBe(27);
  });

  it("preserves the function identity, invoker ACL and records and rolls back its DDL exactly", async () => {
    const f = await savedOldFixture();
    await db.exec(priorFunction);
    const identity = await functionIdentity(), before = await databaseState();
    const oldBody = (await db.query("select md5(prosrc) md5 from pg_proc where oid='public.tc_recurring_billing(text,jsonb)'::regprocedure")).rows;
    expect(oldBody).toEqual([{ md5: "8ba277d1bfa7c1fbe33d7d50678103c1" }]);
    await db.exec("savepoint candidate_upgrade");
    await db.exec(candidateMigration());
    expect(await functionIdentity()).toEqual(identity);
    expect(identity.prosecdef).toBe(false);
    expect((await f.prepare()).available).toBe(true);
    expect(await databaseState()).toEqual(before);
    expect((await db.query(`select has_function_privilege('anon','public.tc_recurring_billing(text,jsonb)','EXECUTE') anon,
      has_function_privilege('authenticated','public.tc_recurring_billing(text,jsonb)','EXECUTE') authenticated,
      has_function_privilege('service_role','public.tc_recurring_billing(text,jsonb)','EXECUTE') service_role`)).rows).toEqual([
      { anon: false, authenticated: false, service_role: true },
    ]);
    await db.exec("rollback to savepoint candidate_upgrade; release savepoint candidate_upgrade");
    expect(await functionIdentity()).toEqual(identity);
    expect((await db.query("select md5(prosrc) md5 from pg_proc where oid='public.tc_recurring_billing(text,jsonb)'::regprocedure")).rows).toEqual(oldBody);
    expect(await databaseState()).toEqual(before);
  });

  it("refuses an unreviewed prior function body without overwriting it", async () => {
    await db.exec(priorFunction.replace("declare\n", "declare\n  -- Synthetic concurrent source drift, isolated fixture only.\n"));
    const before = (await db.query("select prosrc from pg_proc where oid='public.tc_recurring_billing(text,jsonb)'::regprocedure")).rows;
    await db.exec("savepoint candidate_drift");
    await expect(db.exec(candidateMigration())).rejects.toThrow("subscription_checkout_recovery_prior_body_mismatch");
    await db.exec("rollback to savepoint candidate_drift; release savepoint candidate_drift");
    expect((await db.query("select prosrc from pg_proc where oid='public.tc_recurring_billing(text,jsonb)'::regprocedure")).rows).toEqual(before);
  });

  it("keeps every other action, including saved, provider expiry and event/CAS, byte-identical", () => {
    const candidate = candidateMigration();
    const next = candidate.slice(candidate.indexOf(functionStart));
    const prepare = "  elsif p_action='prepare' then";
    const saved = "  elsif p_action='saved' then";
    expect(next.slice(0, next.indexOf(prepare))).toBe(priorFunction.slice(0, priorFunction.indexOf(prepare)));
    expect(next.slice(next.indexOf(saved)).trimEnd()).toBe(priorFunction.slice(priorFunction.indexOf(saved)));
  });
});

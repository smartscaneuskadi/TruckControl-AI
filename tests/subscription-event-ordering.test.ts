import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  createRecurringHandler,
  type RecurringGateway,
} from "../supabase/functions/truckcontrol-subscriptions/handler.ts";
import { createLegacyStripeServer } from "../supabase/functions/_shared/subscription-legacy-payment-gate.ts";
import {
  financialDatabase,
  financialPayment,
  incidentNow,
  withDbRole,
  type Json,
  type PaidFixture,
} from "./helpers/subscription-financial-db";

let db: PGlite;
let sequence = 0;
const secret = "synthetic-ordering-webhook-secret";
const origin = "https://ordering.example.invalid";
const eventId = () => "evt_Ordering" + ++sequence;

async function server<T = Json>(action: string, data: Json): Promise<T> {
  return withDbRole(
    db,
    "service_role",
    async () =>
      (
        await db.query<{ result: T }>(
          "select public.tc_recurring_billing($1,$2::jsonb) result",
          [action, JSON.stringify(data)],
        )
      ).rows[0].result,
  );
}
const observe = (p: PaidFixture) =>
  server("observe", { subscription_id: p.subscription });
function event(p: PaidFixture, overrides: Json = {}) {
  return server("event", {
    user_id: p.user,
    request_id: p.request,
    subscription_id: p.subscription,
    customer_id: p.customer,
    event_id: eventId(),
    event_type: "customer.subscription.updated",
    event_created: incidentNow,
    unit_amount: 36300,
    currency: "EUR",
    state: "active",
    cancel_at_period_end: false,
    period_end: p.periodEnd,
    invoice_paid: false,
    ...overrides,
  });
}
async function canonical(p: PaidFixture, overrides: Json = {}) {
  return event(p, {
    snapshot_revision: (await observe(p)).snapshot_revision,
    ...overrides,
  });
}
async function subscription(p: PaidFixture) {
  return (
    await db.query<{ result: Json }>(
      "select to_jsonb(b)||jsonb_build_object('snapshot_revision',b.snapshot_revision::text) result from private.tc_billing_subscriptions b where provider_id=$1",
      [p.subscription],
    )
  ).rows[0].result;
}
async function entitlement(p: PaidFixture) {
  return (
    await db.query<{ result: Json }>(
      "select to_jsonb(c) result from private.tc_customers c where user_id=$1",
      [p.user],
    )
  ).rows[0].result;
}
async function receipts(p: PaidFixture) {
  return (
    await db.query<{ n: number }>(
      "select count(*)::integer n from private.tc_subscription_events where subscription_id=$1",
      [p.subscription],
    )
  ).rows[0].n;
}
function providerSubscription(p: PaidFixture, cancel: boolean) {
  return {
    id: p.subscription,
    customer: p.customer,
    status: "active",
    cancel_at_period_end: cancel,
    metadata: { tc_user_id: p.user, tc_request_id: p.request },
    items: {
      has_more: false,
      data: [
        {
          quantity: 1,
          current_period_end: p.periodEnd,
          price: {
            id: "price_Ordering",
            currency: "eur",
            unit_amount: 36300,
            recurring: {
              interval: "month",
              interval_count: 1,
              usage_type: "licensed",
            },
          },
        },
      ],
    },
  };
}
async function webhook(p: PaidFixture, id = eventId(), created = incidentNow) {
  const raw = JSON.stringify({
    id,
    type: "customer.subscription.updated",
    created,
    data: {
      object: {
        id: p.subscription,
        cancel_at_period_end: "untrusted snapshot",
      },
    },
  });
  const stamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${stamp}.${raw}`),
    ),
  );
  return new Request(
    "https://edge.example.invalid/subscriptions?webhook=stripe",
    {
      method: "POST",
      body: raw,
      headers: {
        "stripe-signature": `t=${stamp},v1=${Array.from(signature, (b) => b.toString(16).padStart(2, "0")).join("")}`,
      },
    },
  );
}
function handler(
  fetcher: typeof fetch,
  invoke: RecurringGateway["server"] = server,
) {
  return createRecurringHandler(
    {
      authenticate: async () => null,
      server: createLegacyStripeServer("recurring", invoke),
    },
    {
      appOrigin: origin,
      stripeKey: "synthetic-test-key",
      webhookSecret: secret,
      enabled: false,
      invoicingVerified: false,
    },
    fetcher,
  );
}

beforeAll(async () => {
  db = await financialDatabase();
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("subscription lifecycle snapshot ordering in local PostgreSQL", () => {
  it("upgrades populated subscriptions without changing historical values, function identity or grants", async () => {
    const p = await financialPayment(db, true);
    await db.exec("begin");
    try {
      await db.exec(
        "alter table private.tc_billing_subscriptions drop column snapshot_revision, drop column reconciliation_required",
      );
      const source = readFileSync(
        "supabase/migrations/20261031181317_recurring_subscriptions.sql",
        "utf8",
      );
      const oldFunction = source.slice(
        source.indexOf("create function public.tc_recurring_billing"),
        source.indexOf("\nrevoke all on function"),
      );
      await db.exec(
        oldFunction.replace("create function", "create or replace function"),
      );
      const identity = async () =>
        (
          await db.query(
            "select oid,proacl::text,prosecdef,proconfig from pg_proc where oid='public.tc_recurring_billing(text,jsonb)'::regprocedure",
          )
        ).rows[0];
      const historical = async () =>
        (
          await db.query<{ result: Json }>(
            "select to_jsonb(b)-'snapshot_revision'-'reconciliation_required' result from private.tc_billing_subscriptions b where provider_id=$1",
            [p.subscription],
          )
        ).rows[0].result;
      const oldIdentity = await identity(),
        before = await historical(),
        paid = await entitlement(p),
        count = await receipts(p);
      await db.exec(
        readFileSync(
          "supabase/migrations/20261113233252_subscription_snapshot_ordering.sql",
          "utf8",
        ),
      );
      expect(await identity()).toEqual(oldIdentity);
      expect(await historical()).toEqual(before);
      expect(await entitlement(p)).toEqual(paid);
      expect(await receipts(p)).toBe(count);
      expect(await subscription(p)).toMatchObject({
        snapshot_revision: "0",
        reconciliation_required: false,
      });
      await canonical(p, { cancel_at_period_end: true });
      expect(await subscription(p)).toMatchObject({
        snapshot_revision: "1",
        cancel_at_period_end: true,
      });
    } finally {
      await db.exec("rollback");
    }
  });

  it.each([false, true])(
    "preserves an ambiguous same-second unversioned snapshot after cancel=%s",
    async (cancel) => {
      const p = await financialPayment(db, true);
      await canonical(p, { cancel_at_period_end: cancel });
      const before = await entitlement(p);
      const result = await event(p, { cancel_at_period_end: !cancel });
      expect(result).toMatchObject({
        received: true,
        reconciliation_required: true,
      });
      expect(await subscription(p)).toMatchObject({
        cancel_at_period_end: cancel,
        reconciliation_required: true,
      });
      expect(
        (await server("status", { user_id: p.user })).subscription,
      ).toMatchObject({ reconciliation_required: true });
      expect(await entitlement(p)).toEqual(before);
      // A fresh canonical read resolves either direction within the same second.
      await canonical(p, { cancel_at_period_end: !cancel });
      expect(await subscription(p)).toMatchObject({
        cancel_at_period_end: !cancel,
        reconciliation_required: false,
      });
    },
  );

  it("keeps older unversioned state out and accepts later cancel and resume snapshots", async () => {
    const p = await financialPayment(db, true);
    await event(p, {
      event_created: incidentNow - 2,
      cancel_at_period_end: true,
    });
    await event(p, {
      event_created: incidentNow - 3,
      cancel_at_period_end: false,
    });
    expect(await subscription(p)).toMatchObject({
      cancel_at_period_end: true,
      reconciliation_required: false,
    });
    await event(p, {
      event_created: incidentNow - 1,
      cancel_at_period_end: false,
    });
    expect(await subscription(p)).toMatchObject({
      cancel_at_period_end: false,
      event_created: incidentNow - 1,
    });
  });

  it("accepts a fresh canonical snapshot triggered by an older event without lowering the timestamp watermark", async () => {
    const p = await financialPayment(db, true);
    await canonical(p, { cancel_at_period_end: true });
    await canonical(p, {
      event_created: incidentNow - 1,
      cancel_at_period_end: false,
    });
    expect(await subscription(p)).toMatchObject({
      cancel_at_period_end: false,
      event_created: incidentNow,
    });
  });

  it("rejects a stale observed write before its receipt, invoice or entitlement can commit", async () => {
    const p = await financialPayment(db, true);
    const stale = (await observe(p)).snapshot_revision;
    await canonical(p, { cancel_at_period_end: true });
    const before = await subscription(p),
      paid = await entitlement(p),
      count = await receipts(p);
    expect(
      await event(p, {
        snapshot_revision: stale,
        cancel_at_period_end: false,
        invoice_paid: true,
        invoice_id: "in_OrderingStale",
        invoice_amount: 36300,
        invoice_period_start: incidentNow,
        invoice_period_end: incidentNow + 30 * 86400,
      }),
    ).toEqual({ reconcile_required: true });
    expect(await subscription(p)).toEqual(before);
    expect(await entitlement(p)).toEqual(paid);
    expect(await receipts(p)).toBe(count);
    expect(
      (
        await db.query(
          "select 1 from private.tc_subscription_invoices where invoice_id='in_OrderingStale'",
        )
      ).rows,
    ).toEqual([]);
  });

  it("commits a valid paid renewal while preserving an ambiguous same-second cancellation", async () => {
    const p = await financialPayment(db, true);
    await canonical(p, { cancel_at_period_end: true });
    const proof = {
      ...p.proof,
      provider_event_id: eventId(),
      provider_event_created: incidentNow,
      provider_payment_id: "in_OrderingRenewal",
      invoice_id: "in_OrderingRenewal",
      billing_reason: "subscription_cycle",
      cancel_at_period_end: false,
      invoice_period_start: incidentNow,
      invoice_period_end: incidentNow + 30 * 86400,
      subscription_current_period_end: incidentNow + 30 * 86400,
    };
    const result = await withDbRole(
      db,
      "service_role",
      async () =>
        (
          await db.query<{ result: Json }>(
            "select public.tc_manual_subscription_apply_payment('subscription_invoice','acct_IncidentSynthetic',$1::jsonb) result",
            [JSON.stringify(proof)],
          )
        ).rows[0].result,
    );
    expect(result.received).toBe(true);
    expect(await subscription(p)).toMatchObject({
      cancel_at_period_end: true,
      reconciliation_required: true,
    });
    expect(Date.parse(String((await entitlement(p)).paid_until))).toBe(
      (incidentNow + 30 * 86400) * 1000,
    );
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::integer n from private.tc_subscription_invoices where subscription_id=$1",
          [p.subscription],
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::integer n from private.tc_manual_subscription_invoice_tasks where subscription_id=$1",
          [p.subscription],
        )
      ).rows[0].n,
    ).toBe(2);
    await canonical(p, {
      period_end: incidentNow + 30 * 86400,
      cancel_at_period_end: true,
    });
    expect(await subscription(p)).toMatchObject({
      cancel_at_period_end: true,
      reconciliation_required: false,
    });
  });

  it("keeps duplicate receipts idempotent and validates account, request, customer and event ownership first", async () => {
    const p = await financialPayment(db, true),
      other = await financialPayment(db, true),
      id = eventId();
    await canonical(p, { event_id: id, cancel_at_period_end: true });
    const before = await subscription(p),
      count = await receipts(p);
    expect(
      await event(p, {
        event_id: id,
        snapshot_revision: "0",
        cancel_at_period_end: false,
      }),
    ).toEqual({ duplicate: true });
    expect(await subscription(p)).toEqual(before);
    expect(await receipts(p)).toBe(count);
    await expect(
      event(p, {
        event_id: id,
        user_id: other.user,
        request_id: other.request,
      }),
    ).rejects.toThrow(/otra cuenta/);
    await expect(
      event(p, { event_id: id, customer_id: other.customer }),
    ).rejects.toThrow(/otra cuenta/);
    await expect(
      event(p, { event_id: id, request_id: other.request }),
    ).rejects.toThrow(/precio/);
    await expect(event(other, { event_id: id })).rejects.toThrow(
      /otra suscripción/,
    );
    expect(await subscription(p)).toEqual(before);
  });

  it.each([
    null,
    -1,
    "-1",
    "01",
    "1.5",
    "not-a-revision",
    "9223372036854775808",
  ])(
    "rejects malformed revision %s without a state change",
    async (revision) => {
      const p = await financialPayment(db, true),
        before = await subscription(p),
        count = await receipts(p);
      await expect(
        event(p, { snapshot_revision: revision, cancel_at_period_end: true }),
      ).rejects.toThrow();
      expect(await subscription(p)).toEqual(before);
      expect(await receipts(p)).toBe(count);
    },
  );

  it("keeps observation server-only and scopes revisions to the exact subscription", async () => {
    const p = await financialPayment(db, true),
      other = await financialPayment(db, true);
    await canonical(p);
    expect(await observe(p)).toEqual({ snapshot_revision: "2" });
    expect(await observe(other)).toEqual({ snapshot_revision: "1" });
    expect(
      await server("observe", { subscription_id: "sub_AbsentSynthetic" }),
    ).toEqual({ snapshot_revision: "0" });
    await expect(
      server("observe", { subscription_id: "malformed" }),
    ).rejects.toThrow(/no válida/);
    for (const role of ["anon", "authenticated"])
      await expect(
        withDbRole(db, role, async () =>
          db.query("select public.tc_recurring_billing('observe',$1::jsonb)", [
            JSON.stringify({ subscription_id: p.subscription }),
          ]),
        ),
      ).rejects.toThrow(/permission denied/);
  });
});

describe("signed lifecycle handler with real local SQL CAS and synthetic provider reads", () => {
  it.each([false, true])(
    "re-reads after overlapping same-second snapshots when current cancel=%s",
    async (previousCancel) => {
      const p = await financialPayment(db, true);
      if (previousCancel)
        await canonical(p, {
          event_created: incidentNow - 1,
          cancel_at_period_end: true,
        });
      const paid = await entitlement(p);
      let current = previousCancel;
      let release!: () => void, started!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const firstGet = new Promise<void>((resolve) => {
        started = resolve;
      });
      const staleFetcher = vi.fn<typeof fetch>(async (url) => {
        expect(String(url)).toBe(
          `https://api.stripe.com/v1/subscriptions/${p.subscription}`,
        );
        const captured = providerSubscription(p, current);
        if (staleFetcher.mock.calls.length === 1) {
          started();
          await held;
        }
        return Response.json(captured);
      });
      const currentFetcher = vi.fn<typeof fetch>(async () =>
        Response.json(providerSubscription(p, current)),
      );
      const stale = handler(staleFetcher)(await webhook(p));
      await firstGet;
      current = !previousCancel;
      expect((await handler(currentFetcher)(await webhook(p))).status).toBe(
        200,
      );
      release();
      expect((await stale).status).toBe(200);
      expect(staleFetcher).toHaveBeenCalledTimes(2);
      expect(currentFetcher).toHaveBeenCalledTimes(1);
      expect(await subscription(p)).toMatchObject({
        cancel_at_period_end: current,
        reconciliation_required: false,
      });
      expect(await entitlement(p)).toEqual(paid);
    },
  );

  it("returns retryable failure after three conflicting snapshots without acknowledging one", async () => {
    const p = await financialPayment(db, true);
    const invoke = vi.fn(
      async <T>(action: string) =>
        (action === "observe"
          ? { snapshot_revision: "1" }
          : { reconcile_required: true }) as T,
    );
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(providerSubscription(p, true)),
    );
    const before = await subscription(p);
    const response = await handler(fetcher, invoke)(await webhook(p));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "subscription_unavailable",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(invoke.mock.calls.map((c) => c[0])).toEqual([
      "observe",
      "event",
      "observe",
      "event",
      "observe",
      "event",
    ]);
    expect(await subscription(p)).toEqual(before);
  });

  it.each(["provider", "database"])(
    "does not acknowledge a %s failure",
    async (failure) => {
      const p = await financialPayment(db, true),
        before = await subscription(p),
        count = await receipts(p);
      const fetcher = vi.fn<typeof fetch>(async () => {
        if (failure === "provider")
          throw new Error("synthetic provider outage");
        return Response.json(providerSubscription(p, true));
      });
      const invoke = async <T>(action: string, data: Json): Promise<T> => {
        if (failure === "database" && action === "event")
          throw new Error("synthetic database outage");
        return server<T>(action, data);
      };
      expect((await handler(fetcher, invoke)(await webhook(p))).status).toBe(
        503,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(await subscription(p)).toEqual(before);
      expect(await receipts(p)).toBe(count);
    },
  );

  it("preserves signature verification before both observation and provider access", async () => {
    const p = await financialPayment(db, true),
      fetcher = vi.fn<typeof fetch>(),
      invoke = vi.fn(server);
    const request = await webhook(p);
    request.headers.set("stripe-signature", "t=0,v1=forged");
    expect((await handler(fetcher, invoke)(request)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});

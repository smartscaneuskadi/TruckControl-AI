import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
  createRecurringHandler,
  type RecurringGateway,
} from "../supabase/functions/truckcontrol-subscriptions/handler";
import {
  financialDatabase,
  financialPayment,
  incidentOriginalSnapshot,
  withDbRole,
  type Json,
  type PaidFixture,
} from "./helpers/subscription-financial-db";

let db: PGlite;
async function identity(p: PaidFixture) {
  const session_id = randomUUID();
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
    session_id,
    p.user,
  ]);
  return { id: p.user, session_id };
}
type Actor = Awaited<ReturnType<typeof identity>>;
function rpc(action: string, actor: Actor, operation: string, data: Json = {}) {
  return withDbRole(
    db,
    "service_role",
    async () =>
      (
        await db.query<{ result: Json }>(
          "select public.tc_subscription_snapshot_refresh($1,$2,$3,$4,$5::jsonb) result",
          [action, actor.id, actor.session_id, operation, JSON.stringify(data)],
        )
      ).rows[0].result,
  );
}
async function snapshot(p: PaidFixture) {
  return (
    await db.query<{ result: Json }>(
      "select to_jsonb(s) result from private.tc_billing_subscriptions s where provider_id=$1",
      [p.subscription],
    )
  ).rows[0].result;
}
async function canonicalData(
  p: PaidFixture,
  _actor: Actor,
  _operation: string,
  override: Json = {},
) {
  // Isolated commit fixtures read their revision directly; only actual HTTP
  // observation tests consume durable provider permits.
  const saved = (
    await db.query<{ snapshot_revision: string }>(
      "select snapshot_revision::text from private.tc_billing_subscriptions where provider_id=$1",
      [p.subscription],
    )
  ).rows[0];
  return {
    request_id: p.request,
    subscription_id: p.subscription,
    customer_id: p.customer,
    snapshot_revision: saved.snapshot_revision,
    state: "active",
    cancel_at_period_end: true,
    period_end: p.periodEnd,
    unit_amount: 36300,
    currency: "EUR",
    ...override,
  };
}
function provider(p: PaidFixture, override: Json = {}) {
  return {
    id: p.subscription,
    customer: p.customer,
    metadata: { tc_user_id: p.user, tc_request_id: p.request },
    status: "active",
    cancel_at_period_end: true,
    items: {
      has_more: false,
      data: [
        {
          quantity: 1,
          current_period_end: p.periodEnd,
          price: {
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
    ...override,
  };
}
const origin = "https://refresh.example.invalid";
function request(operation = randomUUID(), extra: Json = {}) {
  return new Request(origin, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer synthetic",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "refresh",
      operation_id: operation,
      ...extra,
    }),
  });
}
const config = {
  appOrigin: origin,
  stripeKey: "synthetic-backend-only",
  snapshotRefreshAccepted: true,
};
function gateway(actor: Actor): RecurringGateway {
  return {
    authenticate: async () => actor,
    refreshReady: async () => true,
    server: vi.fn(async () => {
      throw Error("legacy mutation forbidden");
    }),
    refresh: async <T>(
      action: "observe" | "commit",
      a: Actor,
      op: string,
      data: Json,
    ) => (await rpc(action, a, op, data)) as T,
  };
}
beforeAll(async () => {
  db = await financialDatabase();
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("private canonical subscription refresh", () => {
  it("keeps browser roles out of provider commit and the immutable private ledger", async () => {
    for (const role of ["anon", "authenticated"]) {
      await expect(
        withDbRole(db, role, () =>
          db.query(
            "select public.tc_subscription_snapshot_refresh('observe',null,null,null,'{}')",
          ),
        ),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        withDbRole(db, role, () =>
          db.query("select * from private.tc_subscription_snapshot_refreshes"),
        ),
      ).rejects.toThrow(/permission denied/i);
    }
    const result = await db.query<{
      rls: boolean;
      definer: boolean;
      config: string[];
    }>(
      "select c.relrowsecurity rls,p.prosecdef definer,p.proconfig config from pg_class c,pg_proc p where c.oid='private.tc_subscription_snapshot_refreshes'::regclass and p.oid='private.tc_subscription_snapshot_refresh(text,uuid,uuid,uuid,jsonb)'::regprocedure",
    );
    expect(result.rows[0]).toMatchObject({ rls: true, definer: true });
    expect(result.rows[0].config).toContain('search_path=""');
  });
  it.each(["canceled", "incomplete_expired"])(
    "refreshes a pending %s state without a new webhook or any paid mutation",
    async (state) => {
      const p = await financialPayment(db, true),
        actor = await identity(p),
        op = randomUUID();
      await db.query(
        "update private.tc_billing_subscriptions set state=$2,reconciliation_required=true where provider_id=$1",
        [p.subscription, state],
      );
      const original = await incidentOriginalSnapshot(db, p),
        before = await snapshot(p);
      const payload = await canonicalData(p, actor, op);
      expect(await rpc("commit", actor, op, payload)).toEqual({
        refreshed: true,
        duplicate: false,
      });
      expect(await snapshot(p)).toMatchObject({
        state: "active",
        cancel_at_period_end: true,
        reconciliation_required: false,
        snapshot_revision: Number(before.snapshot_revision) + 1,
        event_created: before.event_created,
      });
      expect(await incidentOriginalSnapshot(db, p)).toEqual(original);
      const row = (
        await db.query<{ previous: Json }>(
          "select previous from private.tc_subscription_snapshot_refreshes where operation_id=$1",
          [op],
        )
      ).rows[0];
      expect(row.previous).toMatchObject({
        state,
        reconciliation_required: true,
      });
      expect(await rpc("commit", actor, op, payload)).toEqual({
        refreshed: true,
        duplicate: true,
      });
      expect(await rpc("observe", actor, op)).toEqual({
        refreshed: true,
        duplicate: true,
      });
      await expect(
        rpc("commit", actor, op, { ...payload, cancel_at_period_end: false }),
      ).rejects.toThrow(/operation_conflict/);
      await db.query(
        "update private.tc_billing_subscriptions set reconciliation_required=true,snapshot_revision=snapshot_revision+1 where provider_id=$1",
        [p.subscription],
      );
      expect(await rpc("observe", actor, op)).toEqual({
        refreshed: true,
        duplicate: true,
      });
      expect((await snapshot(p)).reconciliation_required).toBe(true);
      await expect(
        db.query(
          "update private.tc_subscription_snapshot_refreshes set canonical='{}' where operation_id=$1",
          [op],
        ),
      ).rejects.toThrow();
      await expect(
        db.query(
          "delete from private.tc_subscription_snapshot_refreshes where operation_id=$1",
          [op],
        ),
      ).rejects.toThrow();
    },
  );
  it("loses a CAS race without state, receipt or invoice changes", async () => {
    const p = await financialPayment(db, true),
      actor = await identity(p),
      op = randomUUID();
    const payload = await canonicalData(p, actor, op);
    await db.query(
      "update private.tc_billing_subscriptions set snapshot_revision=snapshot_revision+1,reconciliation_required=true where provider_id=$1",
      [p.subscription],
    );
    const before = await snapshot(p),
      original = await incidentOriginalSnapshot(db, p);
    expect(await rpc("commit", actor, op, payload)).toEqual({
      reconcile_required: true,
    });
    expect(await snapshot(p)).toEqual(before);
    expect(await incidentOriginalSnapshot(db, p)).toEqual(original);
    expect(
      (
        await db.query(
          "select 1 from private.tc_subscription_snapshot_refreshes where operation_id=$1",
          [op],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      await rpc("commit", actor, op, await canonicalData(p, actor, op)),
    ).toEqual({ refreshed: true, duplicate: false });
  });
  it("binds the native request, subscription, customer, price and currency and rejects paid fields", async () => {
    const p = await financialPayment(db, true),
      other = await financialPayment(db, true),
      actor = await identity(p);
    const before = await snapshot(p);
    for (const override of [
      { request_id: other.request },
      { subscription_id: other.subscription },
      { customer_id: other.customer },
      { unit_amount: 700 },
      { currency: "USD" },
      { snapshot_revision: 1 },
      { state: null },
      { cancel_at_period_end: "true" },
      { period_end: null },
      { period_end: 1 },
      { invoice_paid: true },
      { user_id: other.user },
    ]) {
      const op = randomUUID();
      await expect(
        rpc("commit", actor, op, await canonicalData(p, actor, op, override)),
      ).rejects.toThrow();
    }
    expect(await snapshot(p)).toEqual(before);
    const otherActor = await identity(other);
    await expect(
      rpc(
        "commit",
        otherActor,
        randomUUID(),
        await canonicalData(p, actor, randomUUID()),
      ),
    ).rejects.toThrow();
  });
  it.each(["revoked", "expired", "banned", "unconfirmed", "foreign-session"])(
    "rejects an %s session at commit",
    async (kind) => {
      const p = await financialPayment(db, true),
        actor = await identity(p),
        op = randomUUID();
      const payload = await canonicalData(p, actor, op),
        before = await snapshot(p);
      if (kind === "revoked")
        await db.query("delete from auth.sessions where id=$1", [
          actor.session_id,
        ]);
      if (kind === "expired")
        await db.query(
          "update auth.sessions set not_after=now()-interval '1 second' where id=$1",
          [actor.session_id],
        );
      if (kind === "banned")
        await db.query(
          "update auth.users set banned_until=now()+interval '1 hour' where id=$1",
          [actor.id],
        );
      if (kind === "unconfirmed")
        await db.query(
          "update auth.users set email_confirmed_at=null where id=$1",
          [actor.id],
        );
      if (kind === "foreign-session")
        actor.session_id = (
          await identity(await financialPayment(db, true))
        ).session_id;
      await expect(rpc("commit", actor, op, payload)).rejects.toThrow(
        /session_required/,
      );
      expect(await snapshot(p)).toEqual(before);
    },
  );
  it("rolls the entire snapshot back when the immutable audit insert fails", async () => {
    const p = await financialPayment(db, true),
      actor = await identity(p),
      op = randomUUID();
    const payload = await canonicalData(p, actor, op),
      before = await snapshot(p);
    await db.exec(
      "create function private.synthetic_refresh_fail() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure';end$$;create trigger synthetic_refresh_fail before insert on private.tc_subscription_snapshot_refreshes for each row execute function private.synthetic_refresh_fail();",
    );
    try {
      await expect(rpc("commit", actor, op, payload)).rejects.toThrow(
        /synthetic audit failure/,
      );
    } finally {
      await db.exec(
        "drop trigger synthetic_refresh_fail on private.tc_subscription_snapshot_refreshes;drop function private.synthetic_refresh_fail();",
      );
    }
    expect(await snapshot(p)).toEqual(before);
  });
});

describe("human refresh HTTP pipeline", () => {
  it("shares a durable cadence across UUIDs and failed GETs, isolated per verified owner", async () => {
    const p = await financialPayment(db, true),
      actor = await identity(p);
    const fetcher = vi.fn(
      async () =>
        new Response("synthetic private upstream detail", { status: 503 }),
    );
    const handler = createRecurringHandler(
      gateway(actor),
      config,
      fetcher as typeof fetch,
    );
    const before = await snapshot(p);
    for (let n = 0; n < 3; n++) {
      const response = await handler(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "subscription_unavailable",
      });
    }
    const response = await handler(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "subscription_refresh_rate_limited",
      retry_after_seconds: 60,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(await snapshot(p)).toEqual(before);
    const other = await financialPayment(db, true),
      otherActor = await identity(other);
    const allowed = await createRecurringHandler(
      gateway(otherActor),
      config,
      async () => Response.json(provider(other)),
    )(request());
    expect(allowed.status).toBe(200);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from private.tc_subscription_snapshot_refresh_attempts where actor_id=$1",
          [actor.id],
        )
      ).rows[0].n,
    ).toBe(3);
    await expect(
      db.query(
        "delete from private.tc_subscription_snapshot_refresh_attempts where actor_id=$1",
        [actor.id],
      ),
    ).rejects.toThrow();
  });
  it("performs only canonical GET with a verified owner, never a legacy paid operation", async () => {
    const p = await financialPayment(db, true),
      actor = await identity(p),
      g = gateway(actor);
    const fetcher = vi.fn(async () => Response.json(provider(p)));
    const response = await createRecurringHandler(
      g,
      config,
      fetcher as typeof fetch,
    )(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      refreshed: true,
      duplicate: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      `https://api.stripe.com/v1/subscriptions/${p.subscription}`,
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "GET",
      redirect: "error",
    });
    expect(g.server).not.toHaveBeenCalled();
  });
  it("re-observes and refetches after CAS loss, with at most three GETs", async () => {
    const p = await financialPayment(db, true),
      actor = await identity(p),
      g = gateway(actor);
    const fetcher = vi.fn(async () => {
      await db.query(
        "update private.tc_billing_subscriptions set snapshot_revision=snapshot_revision+1 where provider_id=$1",
        [p.subscription],
      );
      return Response.json(provider(p));
    });
    const response = await createRecurringHandler(
      g,
      config,
      fetcher as typeof fetch,
    )(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "subscription_refresh_retry_required",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect((await snapshot(p)).cancel_at_period_end).toBe(false);
  });
  it("does not commit when logout happens during provider GET", async () => {
    const p = await financialPayment(db, true),
      actor = await identity(p),
      g = gateway(actor);
    const authenticate = vi
      .fn()
      .mockResolvedValueOnce(actor)
      .mockResolvedValueOnce(null);
    g.authenticate = authenticate;
    const original = await snapshot(p);
    const response = await createRecurringHandler(g, config, async () =>
      Response.json(provider(p)),
    )(request());
    expect(response.status).toBe(401);
    expect(await snapshot(p)).toEqual(original);
  });
  it.each([
    { customer: "cus_foreign" },
    { metadata: { tc_user_id: randomUUID(), tc_request_id: randomUUID() } },
    { id: "sub_foreign" },
    { cancel_at_period_end: "true" },
    { items: { has_more: true, data: [] } },
  ])("denies a canonical mismatch before persistence: %j", async (override) => {
    const p = await financialPayment(db, true),
      actor = await identity(p),
      original = await snapshot(p);
    const response = await createRecurringHandler(
      gateway(actor),
      config,
      async () => Response.json(provider(p, override)),
    )(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "subscription_unavailable",
    });
    expect(await snapshot(p)).toEqual(original);
  });
  it("does no provider work when unauthenticated, unavailable, malformed or disabled", async () => {
    const p = await financialPayment(db, true),
      actor = await identity(p),
      fetcher = vi.fn(async () => {
        throw Error("network forbidden");
      });
    for (const [g, c, req, status] of [
      [
        { ...gateway(actor), authenticate: async () => null },
        config,
        request(),
        401,
      ],
      [
        gateway(actor),
        { ...config, snapshotRefreshAccepted: false },
        request(),
        503,
      ],
      [gateway(actor), config, request(randomUUID(), { user_id: p.user }), 400],
      [gateway(actor), config, request("not-a-uuid"), 400],
    ] as const) {
      expect(
        (await createRecurringHandler(g, c, fetcher as typeof fetch)(req))
          .status,
      ).toBe(status);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("replays an uncertain successful operation without another GET", async () => {
    const p = await financialPayment(db, true),
      actor = await identity(p),
      op = randomUUID();
    const fetcher = vi.fn(async () => Response.json(provider(p))),
      handler = createRecurringHandler(
        gateway(actor),
        config,
        fetcher as typeof fetch,
      );
    expect((await handler(request(op))).status).toBe(200);
    const response = await handler(request(op));
    expect(await response.json()).toEqual({ refreshed: true, duplicate: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

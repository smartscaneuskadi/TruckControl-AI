import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createRecurringHandler,
  type RecurringGateway,
} from "../supabase/functions/truckcontrol-subscriptions/handler.ts";
import {
  financialDatabase,
  withDbRole,
} from "./helpers/subscription-financial-db";

type Obj = Record<string, unknown>;
const origin = "https://checkout-reuse.example.invalid";
const user = "fab10000-0000-4000-8000-000000000001";
const requestId = "fab20000-0000-4000-8000-000000000001";
const checkoutId = "cs_test_SyntheticCheckoutReuse";
const hostedUrl = "https://checkout.stripe.com/c/pay/" + checkoutId;
const testKey = "rk_test_" + "syntheticCheckoutReuseCredential";

function fixture(saved = true) {
  const now = Math.floor(Date.now() / 1000);
  const order = {
    available: true,
    id: requestId,
    user_id: user,
    plan_id: "limited",
    quoted_cents: 36300,
    currency: "EUR",
    trial_end: new Date((now + 49 * 3600) * 1000).toISOString(),
    expires_at: new Date((now + 23 * 3600) * 1000).toISOString(),
    checkout_id: saved ? checkoutId : (null as string | null),
    customer_id: null as string | null,
  };
  const session = {
    id: checkoutId,
    object: "checkout.session",
    livemode: false,
    mode: "subscription",
    status: "open",
    payment_status: "unpaid",
    subscription: null,
    payment_intent: null,
    customer: null,
    currency: "eur",
    amount_total: 0,
    amount_subtotal: 0,
    expires_at: now + 23 * 3600,
    metadata: {
      tc_user_id: user,
      tc_request_id: requestId,
      tc_terms_version: "synthetic-reuse-v1",
    },
    line_items: {
      has_more: false,
      data: [
        {
          quantity: 1,
          currency: "eur",
          price: {
            id: "price_SyntheticCheckoutReuse",
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
    url: hostedUrl,
  } as Obj;
  const calls: string[] = [];
  const gateway: RecurringGateway = {
    authenticate: async (token) =>
      token === "synthetic-session" ? { id: user } : null,
    server: async <T>(action: string, data: Obj): Promise<T> => {
      calls.push(action);
      if (action === "saved") order.checkout_id = String(data.checkout_id);
      return (action === "prepare" ? { ...order } : {}) as T;
    },
  };
  const config = {
    appOrigin: origin,
    enabled: true,
    invoicingVerified: true,
    stripeKey: testKey,
    termsVersion: "synthetic-reuse-v1",
    termsUrl: origin + "/terms",
  };
  let initialPayload: string | undefined;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    // There is no network fallback. Every request must use this private transport.
    if (
      url === "https://api.stripe.com/v1/checkout/sessions" &&
      init?.method === "POST"
    ) {
      const payload = String(init.body);
      if (initialPayload !== undefined && payload !== initialPayload)
        return Response.json(
          { error: { type: "idempotency_error" } },
          { status: 400 },
        );
      initialPayload = payload;
      session.expires_at = Number(
        new URLSearchParams(payload).get("expires_at"),
      );
      return Response.json(session);
    }
    if (
      url ===
        "https://api.stripe.com/v1/checkout/sessions/" +
          checkoutId +
          "?expand%5B%5D=line_items" &&
      init?.method === "GET"
    )
      return Response.json(session);
    throw Error("Unexpected synthetic provider request");
  });
  const call = () =>
    createRecurringHandler(
      gateway,
      config,
      fetcher,
    )(
      new Request("https://edge.example.invalid/subscriptions", {
        method: "POST",
        headers: {
          origin,
          authorization: "Bearer synthetic-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "checkout",
          request_id: requestId,
          terms_accepted: true,
          terms_version: config.termsVersion,
        }),
      }),
    );
  return { now, order, session, gateway, config, calls, fetcher, call };
}

afterEach(() => vi.restoreAllMocks());

describe("saved recurring Checkout sessions", () => {
  it("reopens the original session when its trial crosses the 48-hour threshold", async () => {
    const f = fixture(false);
    const clock = vi.spyOn(Date, "now").mockReturnValue(f.now * 1000);
    const initial = await f.call();
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({ url: hostedUrl });
    expect(
      new URLSearchParams(String(f.fetcher.mock.calls[0][1]?.body)).get(
        "subscription_data[trial_end]",
      ),
    ).toBe(String(f.now + 49 * 3600));

    clock.mockReturnValue((f.now + 2 * 3600) * 1000);
    const reopened = await f.call();
    expect(reopened.status).toBe(200);
    expect(await reopened.json()).toEqual({ url: hostedUrl });
    expect(f.calls).toEqual(["prepare", "saved", "prepare"]);
    expect(f.fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
      "POST",
      "GET",
    ]);
    const read = f.fetcher.mock.calls[1][1]!;
    expect(read.body).toBeUndefined();
    expect(read.redirect).toBe("error");
    expect(read.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(read.headers).get("Authorization")).toBe(
      "Bearer " + testKey,
    );
    expect(new Headers(read.headers).has("Idempotency-Key")).toBe(false);
    expect(new Headers(read.headers).has("Stripe-Account")).toBe(false);
  });

  it("reuses an open zero-value trial session without inventing a paid invoice", async () => {
    const f = fixture();
    f.session.payment_status = "no_payment_required";
    const response = await f.call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: hostedUrl });
    expect(f.calls).toEqual(["prepare"]);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });

  it("reuses an open session charging exactly the approved monthly quote", async () => {
    const f = fixture();
    f.session.amount_total = 36300;
    f.session.amount_subtotal = 36300;
    const response = await f.call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: hostedUrl });
    expect(f.calls).toEqual(["prepare"]);
  });

  it("requires the canonical session to match a live key and an existing customer", async () => {
    const f = fixture();
    f.config.stripeKey = "rk_live_" + "syntheticCheckoutReuseCredential";
    f.session.livemode = true;
    f.order.customer_id = "cus_SyntheticCheckoutReuse";
    f.session.customer = f.order.customer_id;
    expect((await f.call()).status).toBe(200);
    expect(f.calls).toEqual(["prepare"]);
  });

  const attacks: [string, (session: Obj) => void][] = [
    [
      "different session ID",
      (s) => {
        s.id = "cs_test_AnotherCheckout";
      },
    ],
    [
      "wrong object",
      (s) => {
        s.object = "payment_intent";
      },
    ],
    [
      "wrong account key mode",
      (s) => {
        s.livemode = true;
      },
    ],
    [
      "missing account key mode",
      (s) => {
        delete s.livemode;
      },
    ],
    [
      "one-time payment",
      (s) => {
        s.mode = "payment";
      },
    ],
    [
      "completed session",
      (s) => {
        s.status = "complete";
      },
    ],
    [
      "expired session",
      (s) => {
        s.status = "expired";
      },
    ],
    [
      "paid session",
      (s) => {
        s.payment_status = "paid";
      },
    ],
    [
      "already-created subscription",
      (s) => {
        s.subscription = "sub_SyntheticCheckoutReuse";
      },
    ],
    [
      "one-time payment intent",
      (s) => {
        s.payment_intent = "pi_SyntheticCheckoutReuse";
      },
    ],
    [
      "different user",
      (s) => {
        (s.metadata as Obj).tc_user_id = randomUUID();
      },
    ],
    [
      "different request",
      (s) => {
        (s.metadata as Obj).tc_request_id = randomUUID();
      },
    ],
    [
      "different terms",
      (s) => {
        (s.metadata as Obj).tc_terms_version = "other-terms";
      },
    ],
    [
      "malformed customer",
      (s) => {
        s.customer = "another-merchant";
      },
    ],
    [
      "different session currency",
      (s) => {
        s.currency = "usd";
      },
    ],
    [
      "different Checkout total",
      (s) => {
        s.amount_total = 30000;
        s.amount_subtotal = 30000;
      },
    ],
    [
      "additional tax or shipping",
      (s) => {
        s.amount_subtotal = 36300;
        s.amount_total = 40000;
      },
    ],
    [
      "discounted subtotal",
      (s) => {
        s.amount_subtotal = 36300;
      },
    ],
    [
      "different expiration",
      (s) => {
        s.expires_at = Number(s.expires_at) + 1;
      },
    ],
    [
      "more line items",
      (s) => {
        (s.line_items as Obj).has_more = true;
      },
    ],
    [
      "multiple line items",
      (s) => {
        const items = s.line_items as { data: Obj[] };
        items.data.push(structuredClone(items.data[0]));
      },
    ],
    [
      "missing line items",
      (s) => {
        delete s.line_items;
      },
    ],
    [
      "different quantity",
      (s) => {
        (s.line_items as { data: Obj[] }).data[0].quantity = 2;
      },
    ],
    [
      "different line currency",
      (s) => {
        (s.line_items as { data: Obj[] }).data[0].currency = "usd";
      },
    ],
    [
      "different price",
      (s) => {
        ((s.line_items as { data: Obj[] }).data[0].price as Obj).unit_amount =
          30000;
      },
    ],
    [
      "missing price ID",
      (s) => {
        delete ((s.line_items as { data: Obj[] }).data[0].price as Obj).id;
      },
    ],
    [
      "different price currency",
      (s) => {
        ((s.line_items as { data: Obj[] }).data[0].price as Obj).currency =
          "usd";
      },
    ],
    [
      "different billing interval",
      (s) => {
        (
          ((s.line_items as { data: Obj[] }).data[0].price as Obj)
            .recurring as Obj
        ).interval = "year";
      },
    ],
    [
      "different billing interval count",
      (s) => {
        (
          ((s.line_items as { data: Obj[] }).data[0].price as Obj)
            .recurring as Obj
        ).interval_count = 2;
      },
    ],
    [
      "metered billing",
      (s) => {
        (
          ((s.line_items as { data: Obj[] }).data[0].price as Obj)
            .recurring as Obj
        ).usage_type = "metered";
      },
    ],
    [
      "untrusted hosted URL",
      (s) => {
        s.url = "https://checkout.stripe.com.example.invalid/checkout";
      },
    ],
    [
      "non-TLS hosted URL",
      (s) => {
        s.url = "http://checkout.stripe.com/checkout";
      },
    ],
    [
      "credentials in hosted URL",
      (s) => {
        s.url = "https://user:password@checkout.stripe.com/checkout";
      },
    ],
    [
      "missing hosted URL",
      (s) => {
        s.url = null;
      },
    ],
  ];
  it.each(attacks)(
    "rejects %s without creating or releasing a reservation",
    async (_, attack) => {
      const f = fixture();
      attack(f.session);
      const response = await f.call();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "subscription_unavailable",
      });
      expect(f.calls).toEqual(["prepare"]);
      expect(f.fetcher).toHaveBeenCalledTimes(1);
      expect(f.fetcher.mock.calls[0][1]?.method).toBe("GET");
      expect(f.order.checkout_id).toBe(checkoutId);
    },
  );

  it("does not return a session for a different existing customer", async () => {
    const f = fixture();
    f.order.customer_id = "cus_SyntheticOriginalCustomer";
    f.session.customer = "cus_SyntheticOtherCustomer";
    expect((await f.call()).status).toBe(503);
    expect(f.calls).toEqual(["prepare"]);
  });

  it("rejects a session whose canonical expiry elapses during the provider read", async () => {
    const f = fixture();
    f.fetcher.mockImplementationOnce(async () => {
      vi.spyOn(Date, "now").mockReturnValue(
        Number(f.session.expires_at) * 1000,
      );
      return Response.json(f.session);
    });
    expect((await f.call()).status).toBe(503);
    expect(f.calls).toEqual(["prepare"]);
  });

  it.each(["invalid-key", "invalid-checkout"])(
    "denies %s before reading provider data",
    async (attack) => {
      const f = fixture();
      if (attack === "invalid-key")
        f.config.stripeKey = "unrecognized-synthetic-key";
      else f.order.checkout_id = "cs_test_bad?expand[]=customer";
      expect((await f.call()).status).toBe(503);
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(f.calls).toEqual(["prepare"]);
    },
  );

  it.each([404, 503])(
    "does not recreate a known session after provider HTTP %s",
    async (status) => {
      const f = fixture();
      f.fetcher.mockResolvedValueOnce(
        Response.json({ error: "synthetic failure" }, { status }),
      );
      expect((await f.call()).status).toBe(503);
      expect(f.fetcher).toHaveBeenCalledTimes(1);
      expect(f.calls).toEqual(["prepare"]);
    },
  );

  it("keeps the local-expiry fence for an unavailable reservation without a Checkout ID", async () => {
    const f = fixture(false);
    f.order.available = false;
    const response = await f.call();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "order_not_available" });
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.calls).toEqual(["prepare"]);
  });

  it("reads the Checkout ID persisted by the existing native SQL without a schema change", async () => {
    const db = await financialDatabase();
    const f = fixture(false);
    try {
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'checkout-reuse@example.invalid',now(),$2::jsonb)",
        [
          user,
          JSON.stringify({
            truckcontrol_registration: {
              contact_name: "Synthetic Checkout Review",
              company_name: "Synthetic Checkout Company",
              tax_id: "SYNTHETIC-REUSE",
              address: "Synthetic Review Address 123",
              phone: "+12025550123",
              requested_plan: "limited",
            },
          }),
        ],
      );
      await db.query(
        "update private.tc_customers set trial_ends_at=$1::timestamptz,trial_started_at=$1::timestamptz-interval '10 days' where user_id=$2",
        [f.order.trial_end, user],
      );
      await db.exec(
        "update private.tc_settings set payments_enabled=true,prices_are_examples=false",
      );
      await db.query(
        "insert into private.tc_payment_requests(id,user_id,plan_id,quoted_cents,plan_revision,status,net_cents,vat_rate_bps,vat_cents) select $1,$2,id,36300,revision,'requested',30000,2100,6300 from private.tc_plans where id='limited'",
        [requestId, user],
      );
      f.gateway.server = async <T>(action: string, data: Obj): Promise<T> => {
        f.calls.push(action);
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
      };
      const clock = vi.spyOn(Date, "now").mockReturnValue(f.now * 1000);
      expect((await f.call()).status).toBe(200);
      expect(
        (
          await db.query(
            "select checkout_id from private.tc_payment_requests where id=$1",
            [requestId],
          )
        ).rows,
      ).toEqual([{ checkout_id: checkoutId }]);
      clock.mockReturnValue((f.now + 2 * 3600) * 1000);
      const reopened = await f.call();
      expect(reopened.status).toBe(200);
      expect(await reopened.json()).toEqual({ url: hostedUrl });
      expect(f.fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
        "POST",
        "GET",
      ]);
      expect(f.calls).toEqual(["prepare", "saved", "prepare"]);
      expect(
        (
          await db.query(
            "select (select count(*) from private.tc_billing_subscriptions)::int subscriptions, (select count(*) from private.tc_manual_subscription_invoice_tasks)::int fiscal_tasks",
          )
        ).rows,
      ).toEqual([{ subscriptions: 0, fiscal_tasks: 0 }]);

      // Model a pre-existing unknown provider outcome in this isolated database.
      // Local time alone must not free its expired reservation or create again.
      await db.query(
        "update private.tc_subscription_orders set checkout_id=null,expires_at=now()-interval '1 second' where user_id=$1",
        [user],
      );
      await db.query(
        "update private.tc_payment_requests set checkout_id=null,status='requested' where id=$1",
        [requestId],
      );
      f.fetcher.mockClear();
      f.calls.length = 0;
      expect((await f.call()).status).toBe(409);
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(f.calls).toEqual(["prepare"]);
      expect(
        (
          await db.query(
            "select checkout_id from private.tc_subscription_orders where user_id=$1",
            [user],
          )
        ).rows,
      ).toEqual([{ checkout_id: null }]);
    } finally {
      await db.close();
    }
  }, 30000);
});

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRecurringHandler, type RecurringGateway } from "../supabase/functions/truckcontrol-subscriptions/handler.ts";
import { createBillingHandler } from "../supabase/functions/truckcontrol-billing/handler.ts";
import { createLegacyStripeServer, legacyPaidWebhookMutationsAvailable } from "../supabase/functions/_shared/subscription-legacy-payment-gate.ts";

const origin = "https://truckcontrol.example";
const user = "f0000000-0000-4000-8000-000000000001";
const requestId = "f0000000-0000-4000-8000-000000000003";
const now = Math.floor(Date.now() / 1000);
const secret = "synthetic-recurring-webhook-secret";
const config = {
  appOrigin: origin,
  enabled: true,
  invoicingVerified: true,
  stripeKey: "synthetic-test-key",
  webhookSecret: secret,
  termsVersion: "test-approved-v1",
  termsUrl: `${origin}/legal/subscription`,
};
async function sign(raw: string, stamp = now) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${stamp}.${raw}`),
    ),
  );
  return `t=${stamp},v1=${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
function fixture() {
  const calls: { action: string; data: Record<string, unknown> }[] = [];
  const order = {
    available: true,
    id: requestId,
    user_id: user,
    plan_id: "limited",
    currency: "EUR",
    quoted_cents: 1000,
    trial_end: new Date((now + 10 * 86400) * 1000).toISOString(),
    expires_at: new Date((now + 23 * 3600) * 1000).toISOString(),
  };
  const subscription = {
    id: "sub_synthetic",
    customer: "cus_synthetic",
    metadata: { tc_user_id: user, tc_request_id: requestId },
    status: "active",
    cancel_at_period_end: false,
    items: {
      has_more: false,
      data: [
        {
          id: "si_synthetic",
          quantity: 1,
          current_period_end: now + 30 * 86400,
          price: {
            id: "price_synthetic",
            unit_amount: 1000,
            currency: "eur",
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
  const invoice = {
    id: "in_synthetic",
    customer: "cus_synthetic",
    status: "paid",
    amount_paid: 1000,
    total: 1000,
    currency: "eur",
    billing_reason: "subscription_cycle",
    parent: { subscription_details: { subscription: "sub_synthetic" } },
    lines: {
      has_more: false,
      data: [
        {
          quantity: 1,
          pricing: { price_details: { price: "price_synthetic" } },
          period: { start: now, end: now + 30 * 86400 },
        },
      ],
    },
  };
  const gateway: RecurringGateway = {
    authenticate: async (token) =>
      token === "synthetic-session" ? { id: user } : null,
    server: async <T>(action: string, data: Record<string, unknown>) => {
      calls.push({ action, data });
      return (
        action === "prepare"
          ? order
          : action === "manage"
            ? { user_id: user, provider_id: "sub_synthetic" }
            : action === "status"
              ? { subscription: null, invoices: [] }
              : {}
      ) as T;
    },
  };
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    if (String(url) === "https://api.stripe.com/v1/checkout/sessions")
      return Response.json({
        id: "cs_test_synthetic",
        url: "https://checkout.stripe.com/c/pay/synthetic",
      });
    if (String(url) === "https://api.stripe.com/v1/invoices/in_synthetic")
      return Response.json(invoice);
    if (String(url) === "https://api.stripe.com/v1/subscriptions/sub_synthetic")
      return Response.json({
        ...subscription,
        ...(options?.method === "POST"
          ? {
              cancel_at_period_end:
                new URLSearchParams(String(options.body)).get(
                  "cancel_at_period_end",
                ) === "true",
            }
          : {}),
      });
    throw new Error("Unexpected external URL; tests never use the network");
  });
  return {
    gateway,
    calls,
    fetcher,
    order,
    subscription,
    invoice,
    handle: createRecurringHandler(gateway, config, fetcher),
  };
}
const request = (
  body: Record<string, unknown>,
  token = "synthetic-session",
  from = origin,
) =>
  new Request(
    "https://project.example/functions/v1/truckcontrol-subscriptions",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        origin: from,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
const checkout = () =>
  request({
    action: "checkout",
    request_id: requestId,
    terms_accepted: true,
    terms_version: config.termsVersion,
    user_id: "forged",
    amount_cents: 1,
  });
async function webhook(
  type: string,
  payload = { id: "in_synthetic" } as Record<string, unknown>,
  signature = true,
) {
  const raw = JSON.stringify({
    id: "evt_synthetic",
    created: now,
    type,
    data: { object: payload },
  });
  return new Request(
    "https://project.example/functions/v1/truckcontrol-subscriptions?webhook=stripe",
    {
      method: "POST",
      headers: {
        "stripe-signature": signature ? await sign(raw) : "t=0,v1=forged",
      },
      body: raw,
    },
  );
}


function protectedRecurring(f: ReturnType<typeof fixture>, sales = true) {
  return createRecurringHandler({
    authenticate:f.gateway.authenticate,
    server:createLegacyStripeServer("recurring",(action,data) => f.gateway.server(action,data)),
  },{...config,enabled:sales,invoicingVerified:sales},f.fetcher);
}
describe("production legacy paid-webhook closure", () => {
  it("keeps the native paid mutation lock closed without an environment override", () => {
    expect(legacyPaidWebhookMutationsAvailable()).toBe(false);
  });
  it("rejects payment_event before invoking the one-off database gateway", async () => {
    const rpc=vi.fn(async () => ({}));
    const server=createLegacyStripeServer("one_time",rpc);
    await expect(server("payment_event",{amount_cents:36300,bridge_verified:true}))
      .rejects.toThrow("legacy_paid_webhook_disabled");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([true,"true",1,null,undefined])("rejects a paid or untyped recurring mutation (%s)", async paid => {
    const rpc=vi.fn(async () => ({}));
    const server=createLegacyStripeServer("recurring",rpc);
    await expect(server("event",{event_type:"customer.subscription.updated",invoice_paid:paid}))
      .rejects.toThrow("legacy_paid_webhook_disabled");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not accept invoice.paid even if a future caller labels it unpaid", async () => {
    const rpc=vi.fn(async () => ({}));
    await expect(createLegacyStripeServer("recurring",rpc)("event",{
      event_type:"invoice.paid",invoice_paid:false,
    })).rejects.toThrow("legacy_paid_webhook_disabled");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("verifies a one-off HMAC then rejects the legacy paid write without a success acknowledgement", async () => {
    const rpc=vi.fn(async () => ({}));
    const authenticate=vi.fn(async () => ({id:user}));
    const raw=JSON.stringify({id:"evt_PaidOneoff",type:"checkout.session.completed",
      data:{object:{mode:"payment",payment_status:"paid",amount_total:36300,currency:"eur",
        metadata:{tc_user_id:user,tc_request_id:requestId}}}});
    const handler=createBillingHandler({authenticate,server:createLegacyStripeServer("one_time",rpc)},{
      appOrigin:origin,webhookSecret:secret,stripeKey:"synthetic-key",invoicingVerified:true,
    });
    const response=await handler(new Request("https://edge.example/billing?webhook=stripe",{
      method:"POST",headers:{"stripe-signature":await sign(raw)},body:raw,
    }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({error:"billing_unavailable"});
    expect(rpc).not.toHaveBeenCalled();
    expect(authenticate).not.toHaveBeenCalled();
  });
  it("requires a valid raw signature before the protected one-off gateway", async () => {
    const rpc=vi.fn(async () => ({}));
    const handler=createBillingHandler({authenticate:async()=>null,
      server:createLegacyStripeServer("one_time",rpc)},{
      appOrigin:origin,webhookSecret:secret,
    });
    const response=await handler(new Request("https://edge.example/billing?webhook=stripe",{
      method:"POST",headers:{"stripe-signature":"t=0,v1=forged"},body:"{}",
    }));
    expect(response.status).toBe(400);expect(rpc).not.toHaveBeenCalled();
  });
  it("reconciles a signed recurring payment but never reaches the legacy licence RPC", async () => {
    const f=fixture();
    const response=await protectedRecurring(f)(await webhook("invoice.paid"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({error:"subscription_unavailable"});
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(f.calls).toHaveLength(0);
  });
  it("keeps zero trial invoice events on the atomic route as well", async () => {
    const f=fixture();f.invoice.amount_paid=0;f.invoice.total=0;
    expect((await protectedRecurring(f)(await webhook("invoice.paid"))).status).toBe(503);
    expect(f.calls).toHaveLength(0);
  });
  it("rejects forged recurring signatures before provider access or gateway calls", async () => {
    const f=fixture();
    expect((await protectedRecurring(f)(await webhook("invoice.paid",undefined,false))).status).toBe(400);
    expect(f.fetcher).not.toHaveBeenCalled();expect(f.calls).toHaveLength(0);
  });
  it("retains nonpaid subscription state and payment failure reconciliation", async () => {
    for(const type of ["customer.subscription.updated","invoice.payment_failed","invoice.payment_action_required"]) {
      const f=fixture();f.subscription.status="past_due";
      const payload=type.startsWith("customer.")?{id:"sub_synthetic"}:{id:"in_synthetic"};
      const response=await protectedRecurring(f,false)(await webhook(type,payload));
      expect(response.status).toBe(200);
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0]).toMatchObject({action:"event",data:{invoice_paid:false,state:"past_due"}});
    }
  });
  it("preserves provider-confirmed checkout expiration", async () => {
    const f=fixture();
    f.fetcher.mockImplementation(async()=>Response.json({id:"cs_test_synthetic",
      status:"expired",mode:"subscription",subscription:null,
      metadata:{tc_user_id:user,tc_request_id:requestId}}));
    expect((await protectedRecurring(f,false)(await webhook("checkout.session.expired",{
      id:"cs_test_synthetic",
    }))).status).toBe(200);
    expect(f.calls.map(c=>c.action)).toEqual(["checkout_expired"]);
  });
  it("preserves status and cancellation when every sales gate is off", async () => {
    const f=fixture();const handle=protectedRecurring(f,false);
    const status=await handle(request({action:"status"}));
    expect(status.status).toBe(200);
    expect((await status.json()).configured).toBe(false);
    const canceled=await handle(request({action:"cancel",operation_id:requestId}));
    expect(canceled.status).toBe(200);
    expect(await canceled.json()).toEqual({requested:true});
    expect(f.calls.map(c=>c.action)).toEqual(["status","manage"]);
    expect(f.calls.some(c=>c.action==="event")).toBe(false);
  });
  it("leaves isolated legacy handler fixtures compatible while production wiring is protected", async () => {
    const f=fixture();
    expect((await f.handle(await webhook("invoice.paid"))).status).toBe(200);
    expect(f.calls[0].data.invoice_paid).toBe(true);
    for(const [path,channel] of [
      ["supabase/functions/truckcontrol-billing/index.ts","one_time"],
      ["supabase/functions/truckcontrol-subscriptions/index.ts","recurring"],
    ]){
      const source=readFileSync(path,"utf8");
      expect(source).toContain('server: createLegacyStripeServer("' + channel + '"');
      expect(source).toContain('from "../_shared/subscription-legacy-payment-gate.ts"');
      expect(source).not.toContain("async server<T>");
      const allowed = ["tc_manual_stripe_checkout_ready", channel === "one_time" ? "tc_platform_server" : "tc_recurring_billing"];
      const actual = [...source.matchAll(/client\.rpc\(\s*"([^"]+)"/g)].map(match => match[1]);
      expect(actual.sort()).toEqual(allowed.sort());
      expect((source.match(/client\.rpc\(/g) ?? []).length).toBe(actual.length);
    }
  });
});

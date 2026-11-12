import { describe, expect, it, vi } from "vitest";
import { createManualStripeWebhookHandler, type ManualStripeWebhookConfig } from "../supabase/functions/truckcontrol-stripe-fiscal/handler.ts";
import type { StripeReconciliationConfig } from "../supabase/functions/_shared/subscription-stripe-reconciliation.ts";
const now = Date.parse("2026-11-08T09:00:00Z");
const stamp = now / 1000;
const amount = 36300;
const user = "dd110000-0000-4000-8000-000000000001";
const request = "dd220000-0000-4000-8000-000000000001";
const company = "dd330000-0000-4000-8000-000000000001";
const config: StripeReconciliationConfig = {
  stripeKey: "sk_test_syntheticPrivateKey", webhookSecret: "synthetic-endpoint-secret",
  expectedAccountId: "acct_SyntheticMerchant", mode: "test", now,
};
type Obj = Record<string, unknown>;
const metadata = { tc_request_id: request, tc_user_id: user, tc_company_id: company };
async function signed(value: unknown, at = stamp) {
  const raw = JSON.stringify(value);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(config.webhookSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(String(at) + "." + raw)));
  const hex = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  return { raw, signature: "t=" + at + ",v1=" + hex };
}
function fixture(recurring = false, renewal = false) {
  const invoiceId = renewal ? "in_SecondMonth" : "in_FirstMonth";
  const type = recurring ? "invoice.paid" : "checkout.session.completed";
  const periodStart = renewal ? stamp : stamp - 30 * 86400;
  const event = { object: "event", id: renewal ? "evt_SecondMonth" : "evt_FirstMonth",
    type, created: stamp, livemode: false,
    data: { object: { id: recurring ? invoiceId : "cs_test_Synthetic" } } };
  const records: Record<string, Obj> = {
    account: { id: config.expectedAccountId },
    ["events/" + event.id]: structuredClone(event),
    "checkout/sessions/cs_test_Synthetic": { id: "cs_test_Synthetic", livemode: false,
      mode: "payment", status: "complete", payment_status: "paid", currency: "eur",
      amount_total: amount, customer: "cus_Synthetic", payment_intent: "pi_Synthetic",
      subscription: null, metadata: { ...metadata } },
    "payment_intents/pi_Synthetic": { id: "pi_Synthetic", livemode: false,
      status: "succeeded", currency: "eur", amount, amount_received: amount,
      amount_capturable: 0, capture_method: "automatic_async", customer: "cus_Synthetic", latest_charge: "ch_Synthetic",
      on_behalf_of: null, transfer_data: null },
    "charges/ch_Synthetic": { id: "ch_Synthetic", livemode: false,
      payment_intent: "pi_Synthetic", customer: "cus_Synthetic", status: "succeeded",
      paid: true, captured: true, refunded: false, disputed: false, created: stamp - 20, amount,
      amount_captured: amount, amount_refunded: 0, currency: "eur",
      on_behalf_of: null, transfer_data: null },
    ["invoices/" + invoiceId]: { id: invoiceId, livemode: false, status: "paid",
      currency: "eur", paid_out_of_band: false, amount_paid: amount, total: amount,
      amount_remaining: 0, status_transitions: { paid_at: stamp - 10 },
      billing_reason: renewal ? "subscription_cycle" : "subscription_create",
      customer: "cus_Synthetic", parent: { subscription_details: { subscription: "sub_Synthetic", metadata: { ...metadata } } },
      lines: { has_more: false, data: [{ quantity: 1, price: { id: "price_Synthetic" },
        period: { start: periodStart, end: periodStart + 30 * 86400 } }] } },
    "subscriptions/sub_Synthetic": { id: "sub_Synthetic", livemode: false,
      customer: "cus_Synthetic", status: "active", current_period_end: periodStart + 30 * 86400,
      cancel_at_period_end: false, metadata: { ...metadata },
      items: { has_more: false, data: [{ quantity: 1, price: { id: "price_Synthetic",
        unit_amount: amount, currency: "eur",
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } } }] } },
    ["invoice_payments?invoice=" + invoiceId + "&status=paid&limit=2"]: {
      has_more: false, data: [{ id: "inpay_Synthetic", invoice: invoiceId, status: "paid",
        livemode: false, currency: "eur", amount_paid: amount, amount_requested: amount,
        payment: { type: "payment_intent", payment_intent: "pi_Synthetic" },
        status_transitions: { paid_at: stamp - 10 } }] },
  };
  const fetcher = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const actual = String(url);
    expect(actual.startsWith("https://api.stripe.com/v1/")).toBe(true);
    expect(options?.method).toBe("GET");
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.body).toBeUndefined();
    const path = actual.slice("https://api.stripe.com/v1/".length);
    if (!records[path]) throw new Error("unexpected provider route");
    return new Response(JSON.stringify(records[path]), { status: 200 });
  }) as unknown as typeof fetch;
  return { event, records, fetcher, invoiceId };
}
async function run(f: ReturnType<typeof fixture>, options = config) {
  const body = await signed(f.event);
  return reconcileStripeManualInvoicePayment(body.raw, body.signature, options, f.fetcher);
}

const enabled: ManualStripeWebhookConfig = { ...config, enabled: true, schemaAccepted: true };
async function requestFor(f: ReturnType<typeof fixture>) {
  const body = await signed(f.event);
  return new Request("https://edge.example/webhook", { method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": body.signature },
    body: body.raw });
}
describe("manual Stripe webhook adapter: durable acknowledgement and closed switches", () => {
  describe("delivery check with commercial processing disabled", () => {
    const checkConfig: ManualStripeWebhookConfig = { ...config, enabled: false, schemaAccepted: false,
      stripeKey: "rk_live_synthetic", deliveryCheckAccountId: config.expectedAccountId };
    const product = { object: "product", id: "prod_TruckControlDeliveryCheck", active: false, default_price: null };
    const marker = { object: "event", id: "evt_CheckProduct", type: "product.created", livemode: true,
      created: stamp, data: { object: product } };
    async function check(event = marker, canonical = marker, account = config.expectedAccountId) {
      const applyPayment = vi.fn();
      const fetcher = vi.fn(async (url: RequestInfo | URL) => {
        if (String(url) === "https://api.stripe.com/v1/account") return Response.json({ id: account });
        if (String(url) === "https://api.stripe.com/v1/events/" + event.id) return Response.json(canonical);
        throw Error("Unexpected provider call");
      });
      const handler = createManualStripeWebhookHandler({ applyPayment }, checkConfig, fetcher);
      const body = await signed(event);
      const response = await handler(new Request("https://edge.example/webhook?verify=delivery", {
        method: "POST", headers: { "content-type": "application/json", "stripe-signature": body.signature }, body: body.raw,
      }));
      expect(applyPayment).not.toHaveBeenCalled();
      return { response, fetcher };
    }
    it("records delivery only after reading the merchant and canonical archived product event", async () => {
      const { response, fetcher } = await check();
      expect(response.status).toBe(204);
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it("does not mark a different merchant or a sellable canonical product verified", async () => {
      expect((await check(marker, marker, "acct_AnotherMerchant")).response.status).toBe(400);
      const other = { ...marker, data: { object: { ...product, active: true } } };
      expect(await (await check(marker, other)).response.json()).toEqual({ ignored: true });
    });
    it("never acknowledges a payment on the delivery-check route", async () => {
      const result = await check({ ...marker, type: "invoice.paid" });
      expect(result.response.status).toBe(409);
      expect(result.fetcher).not.toHaveBeenCalled();
    });
    it("rejects unsigned checks before reading Stripe or touching the database", async () => {
      const applyPayment = vi.fn(), fetcher = vi.fn();
      const handler = createManualStripeWebhookHandler({ applyPayment }, checkConfig, fetcher);
      const response = await handler(new Request("https://edge.example/webhook?verify=delivery", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(marker),
      }));
      expect(response.status).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();
      expect(applyPayment).not.toHaveBeenCalled();
    });
    it("records only operator classifications once without exposing credentials in the response or logs", async () => {
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      const privateKey = "rk_test_syntheticMarkerOnly", secret = "whsec_otherSyntheticMarker";
      const handler = createManualStripeWebhookHandler({ applyPayment: vi.fn() },
        { ...checkConfig, stripeKey: privateKey, webhookSecret: secret }, vi.fn());
      try {
        for (let i = 0; i < 2; i++) {
          const result = await handler(new Request("https://edge.example/webhook?verify=delivery", {
            method: "POST", headers: { "content-type": "application/json" }, body: "{}",
          }));
          expect(await result.json()).toEqual({ error: "manual_stripe_pipeline_unavailable" });
        }
        expect(info.mock.calls).toEqual([["truckcontrol_stripe_delivery_setup",
          { apiState: "test_mode", signingState: "signing_format" }]]);
      } finally { info.mockRestore(); }
    });
  });
  it.each(["disabled", "schema_pending"])("fails closed before provider or SQL when %s", async reason => {
    const f = fixture();
    const applyPayment = vi.fn();
    const handler = createManualStripeWebhookHandler({ applyPayment }, {
      ...enabled, enabled: reason !== "disabled", schemaAccepted: reason !== "schema_pending",
    }, f.fetcher);
    expect((await handler(await requestFor(f))).status).toBe(503);
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(applyPayment).not.toHaveBeenCalled();
  });
  it("commits a single typed one-off persistence operation after canonical funding", async () => {
    const f = fixture();
    const applyPayment = vi.fn(async () => {});
    const result = await createManualStripeWebhookHandler({ applyPayment }, enabled, f.fetcher)(await requestFor(f));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ received: true });
    expect(applyPayment).toHaveBeenCalledOnce();
    expect(applyPayment).toHaveBeenCalledWith(expect.objectContaining({
      kind: "initial_payment", provider_payment_id: "pi_Synthetic",
      provider_account_id: config.expectedAccountId, request_id: request, user_id: user,
      provider_event_type: "checkout.session.completed", provider_event_created: stamp,
    }));
  });
  it("passes canonical recurring invoice, period, account, customer and state to one transaction", async () => {
    const f = fixture(true, true);
    const applyPayment = vi.fn(async () => {});
    const result = await createManualStripeWebhookHandler({ applyPayment }, enabled, f.fetcher)(await requestFor(f));
    expect(result.status).toBe(200);
    expect(applyPayment).toHaveBeenCalledOnce();
    expect(applyPayment).toHaveBeenCalledWith(expect.objectContaining({
      kind: "subscription_invoice", provider_payment_id: "in_SecondMonth",
      invoice_id: "in_SecondMonth", subscription_id: "sub_Synthetic", customer_id: "cus_Synthetic",
      invoice_period_start: stamp, invoice_period_end: stamp + 30 * 86400,
      subscription_current_period_end: stamp + 30 * 86400, unit_amount: amount,
      cancel_at_period_end: false, subscription_state: "active",
    }));
  });
  it("does not acknowledge before the durable transaction completes", async () => {
    const f = fixture();
    let release: (() => void) | undefined;
    let started = false;
    const handler = createManualStripeWebhookHandler({
      async applyPayment() { started = true; await new Promise<void>(resolve => { release = resolve; }); },
    }, enabled, f.fetcher);
    let finished = false;
    const pending = handler(await requestFor(f)).then(value => { finished = true; return value; });
    await vi.waitFor(() => { expect(started).toBe(true); });
    expect(finished).toBe(false);
    release!();
    expect((await pending).status).toBe(200);
  });
  it("keeps persistence failure retryable and suppresses raw database messages", async () => {
    const f = fixture();
    const applyPayment = vi.fn(async () => { throw Error("SQL secret/private buyer@example.invalid"); });
    const response = await createManualStripeWebhookHandler({ applyPayment }, enabled, f.fetcher)(await requestFor(f));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "manual_stripe_pipeline_unavailable" });
    expect(applyPayment).toHaveBeenCalledOnce();
  });
  it("invalid signatures never invoke the database or provider", async () => {
    const f = fixture();
    const applyPayment = vi.fn();
    const response = await createManualStripeWebhookHandler({ applyPayment }, enabled, f.fetcher)(
      new Request("https://edge.example/webhook", { method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer customer-token" },
        body: JSON.stringify(f.event) }));
    expect(response.status).toBe(400);
    expect(applyPayment).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("browser Origin and methods confer no provider capability", async () => {
    const f = fixture(); const applyPayment = vi.fn();
    const handler = createManualStripeWebhookHandler({ applyPayment }, enabled, f.fetcher);
    expect((await handler(new Request("https://edge.example/webhook"))).status).toBe(405);
    const request = await requestFor(f);
    request.headers.set("origin", "https://truckcontrolai.com");
    const response = await handler(request);
    expect(response.status).toBe(403);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    expect(applyPayment).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("bounds request bytes and requires the JSON media type", async () => {
    const f = fixture(); const applyPayment = vi.fn();
    const handler = createManualStripeWebhookHandler({ applyPayment }, enabled, f.fetcher);
    const huge = await handler(new Request("https://edge.example/webhook", { method: "POST",
      headers: { "content-type": "application/json" }, body: "x".repeat(65537) }));
    expect(huge.status).toBe(413);
    expect((await handler(new Request("https://edge.example/webhook", { method: "POST", body: "{}" }))).status).toBe(415);
    expect(applyPayment).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("acknowledges a verified zero trial invoice without RPC, licence, task or notice", async () => {
    const f = fixture(true);
    const invoice = f.records["invoices/" + f.invoiceId];
    const start = stamp - 60, end = stamp + 10 * 86400;
    Object.assign(invoice, { amount_paid: 0, total: 0, amount_remaining: 0, billing_reason: "subscription_create" });
    Object.assign(f.records["subscriptions/sub_Synthetic"],
      { status: "trialing", trial_start: start, trial_end: end, current_period_end: end });
    (invoice.lines as { data: { period: { start: number; end: number } }[] }).data[0].period = { start, end };
    const applyPayment = vi.fn();
    const result = await createManualStripeWebhookHandler({ applyPayment }, enabled, f.fetcher)(await requestFor(f));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ received: true });
    expect(applyPayment).not.toHaveBeenCalled();
    expect(f.fetcher).toHaveBeenCalledTimes(4);
  });
  it("ignores unrelated signed events without invoking fiscal persistence", async () => {
    const f = fixture(); f.event.type = "customer.created";
    const applyPayment = vi.fn();
    const response = await createManualStripeWebhookHandler({ applyPayment }, enabled, f.fetcher)(await requestFor(f));
    expect(response.status).toBe(200); expect(applyPayment).not.toHaveBeenCalled();
  });
});

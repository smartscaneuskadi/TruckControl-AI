import { describe, expect, it, vi } from "vitest";
import { reconcileStripeManualInvoicePayment, StripeReconciliationError,
  type StripeReconciliationConfig } from "../supabase/functions/_shared/subscription-stripe-reconciliation.ts";

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
      customer: "cus_Synthetic", status: "active", metadata: { ...metadata },
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
describe("Stripe fiscal reconciliation: signed canonical reads only", () => {
  it("confirms a one-off charge using account, canonical event, Checkout, PI and captured Charge", async () => {
    const f = fixture();
    const result = await run(f);
    expect(result).toEqual({ kind: "initial_payment", provider_account_id: config.expectedAccountId,
      provider_event_id: f.event.id, provider_payment_id: "pi_Synthetic",
      checkout_id: "cs_test_Synthetic", request_id: request, user_id: user, company_id: company,
      amount_cents: amount, currency: "EUR", paid_at: new Date(now - 20000).toISOString(), livemode: false });
    expect(f.fetcher).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(result)).not.toContain("syntheticPrivateKey");
  });
  it("uses a separate canonical invoice identity for first and second subscription month", async () => {
    const first = await run(fixture(true));
    const second = await run(fixture(true, true));
    expect(first.kind).toBe("subscription_invoice");
    expect(second.kind).toBe("subscription_invoice");
    if (first.kind !== "subscription_invoice" || second.kind !== "subscription_invoice") throw Error("type");
    expect(first.request_id).toBe(second.request_id);
    expect(first.provider_payment_id).toBe("in_FirstMonth");
    expect(second.provider_payment_id).toBe("in_SecondMonth");
    expect(second.invoice_period_start).toBe(first.invoice_period_end);
    expect(first.billing_reason).toBe("subscription_create");
    expect(second.billing_reason).toBe("subscription_cycle");
  });
  it("keeps the canonical one-off timestamp stable across distinct successful event deliveries", async () => {
    const first = fixture();
    const second = fixture();
    second.event.id = "evt_AsyncSuccess";
    second.event.type = "checkout.session.async_payment_succeeded";
    second.event.created = stamp - 5;
    delete second.records["events/evt_FirstMonth"];
    second.records["events/evt_AsyncSuccess"] = structuredClone(second.event);
    const a = await run(first);
    const b = await run(second);
    if (a.kind !== "initial_payment" || b.kind !== "initial_payment") throw Error("type");
    expect(a.provider_payment_id).toBe(b.provider_payment_id);
    expect(a.paid_at).toBe(b.paid_at);
    expect(a.provider_event_id).not.toBe(b.provider_event_id);
  });
  it("does not silently map subscription Checkout to a second one-off invoice", async () => {
    const f = fixture();
    f.records["checkout/sessions/cs_test_Synthetic"].mode = "subscription";
    f.records["checkout/sessions/cs_test_Synthetic"].subscription = "sub_Synthetic";
    await expect(run(f)).rejects.toMatchObject({ code: "payment_not_confirmed" });
  });
  it.each([null, "t=1,v1=" + "0".repeat(64), "t=" + stamp + ",v1=" + "a".repeat(64)])(
    "rejects missing, stale or forged signatures before provider traffic (%s)", async signature => {
      const f = fixture();
      await expect(reconcileStripeManualInvoicePayment(JSON.stringify(f.event), signature, config, f.fetcher))
        .rejects.toMatchObject({ code: "invalid_signature" });
      expect(f.fetcher).not.toHaveBeenCalled();
    });
  it("rejects body manipulation after signing", async () => {
    const f = fixture();
    const body = await signed(f.event);
    await expect(reconcileStripeManualInvoicePayment(body.raw + " ", body.signature, config, f.fetcher))
      .rejects.toMatchObject({ code: "invalid_signature" });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each(["account", "mode", "connected", "context", "canonical"])(
    "rejects foreign account/mode/event identity (%s)", async attack => {
      const f = fixture();
      if (attack === "account") f.records.account.id = "acct_OtherMerchant";
      if (attack === "mode") f.event.livemode = true;
      if (attack === "connected") Object.assign(f.event, { account: "acct_OtherMerchant" });
      if (attack === "context") Object.assign(f.event, { context: "acct_OtherMerchant" });
      if (attack === "canonical") f.records["events/" + f.event.id].type = "invoice.paid";
      await expect(run(f)).rejects.toMatchObject({ code: "provider_identity_mismatch" });
    });
  it.each(["refunded", "disputed", "uncaptured", "partial", "other_customer", "other_intent", "manual_capture"])(
    "rejects an unconfirmed or financially changed charge (%s)", async attack => {
      const f = fixture(true);
      const c = f.records["charges/ch_Synthetic"];
      if (attack === "refunded") { c.refunded = true; c.amount_refunded = amount; }
      if (attack === "disputed") c.disputed = true;
      if (attack === "uncaptured") c.captured = false;
      if (attack === "partial") c.amount_captured = amount - 1;
      if (attack === "other_customer") c.customer = "cus_OtherCustomer";
      if (attack === "other_intent") c.payment_intent = "pi_OtherIntent";
      if (attack === "manual_capture") f.records["payment_intents/pi_Synthetic"].capture_method = "manual";
      await expect(run(f)).rejects.toMatchObject({ code: "payment_not_confirmed" });
    });
  it("rejects invoice paid outside Stripe without creating fiscal work", async () => {
    const f = fixture(true);
    f.records["invoices/" + f.invoiceId].paid_out_of_band = true;
    await expect(run(f)).rejects.toMatchObject({ code: "payment_not_confirmed" });
    expect(f.fetcher).toHaveBeenCalledTimes(3);
  });
  it.each(["multiple", "truncated", "manual", "amount"])(
    "requires one complete canonical InvoicePayment (%s)", async attack => {
      const f = fixture(true);
      const list = f.records["invoice_payments?invoice=" + f.invoiceId + "&status=paid&limit=2"];
      const rows = list.data as Obj[];
      if (attack === "multiple") rows.push(structuredClone(rows[0]));
      if (attack === "truncated") list.has_more = true;
      if (attack === "manual") rows[0].payment = { type: "payment_record", payment_record: "pmt_Synthetic" };
      if (attack === "amount") rows[0].amount_paid = amount - 1;
      await expect(run(f)).rejects.toMatchObject({ code: "unsupported_payment" });
    });
  it("uses canonical metadata, never mutable webhook payload metadata", async () => {
    const f = fixture();
    Object.assign(f.event.data.object, { metadata: { tc_user_id: "attacker" } });
    const result = await run(f);
    expect(result.kind).toBe("initial_payment");
    if (result.kind === "ignored") throw Error("type");
    expect(result.user_id).toBe(user);
  });
  it("leaves absent organization correlation for server authorization rather than guessing", async () => {
    const f = fixture();
    f.records["checkout/sessions/cs_test_Synthetic"].metadata = { tc_user_id: user, tc_request_id: request };
    const result = await run(f);
    if (result.kind === "ignored") throw Error("type");
    expect(result.company_id).toBeNull();
  });
  it("rejects missing canonical request ownership or invalid company correlation", async () => {
    const f = fixture();
    f.records["checkout/sessions/cs_test_Synthetic"].metadata = { ...metadata, tc_company_id: "foreign-input" };
    await expect(run(f)).rejects.toMatchObject({ code: "correlation_missing" });
  });
  it("rejects malformed periods and mismatched subscription customer", async () => {
    const f = fixture(true);
    f.records["subscriptions/sub_Synthetic"].customer = "cus_OtherCustomer";
    await expect(run(f)).rejects.toMatchObject({ code: "payment_not_confirmed" });
    const g = fixture(true);
    const lines = g.records["invoices/" + g.invoiceId].lines as { data: { period: { start: number; end: number } }[] };
    lines.data[0].period.end = lines.data[0].period.start + 86400;
    await expect(run(g)).rejects.toMatchObject({ code: "payment_not_confirmed" });
  });
  it("does not reattribute a historical invoice after subscription metadata changes", async () => {
    const f = fixture(true);
    f.records["subscriptions/sub_Synthetic"].metadata = { ...metadata,
      tc_user_id: "dd110000-0000-4000-8000-000000000099" };
    await expect(run(f)).rejects.toMatchObject({ code: "correlation_missing" });
  });
  it("requires the invoice creation snapshot even if current subscription metadata exists", async () => {
    const f = fixture(true);
    f.records["invoices/" + f.invoiceId].parent = { subscription_details: { subscription: "sub_Synthetic" } };
    await expect(run(f)).rejects.toMatchObject({ code: "correlation_missing" });
  });
  it("bounds provider responses and sanitizes provider exceptions", async () => {
    const f = fixture();
    const body = await signed(f.event);
    const huge = vi.fn(async () => new Response("x".repeat(524289))) as unknown as typeof fetch;
    await expect(reconcileStripeManualInvoicePayment(body.raw, body.signature, config, huge))
      .rejects.toMatchObject({ code: "provider_response_limit" });
    const unavailable = vi.fn(async () => { throw Error("secret provider response " + config.stripeKey); }) as unknown as typeof fetch;
    let error: unknown;
    try { await reconcileStripeManualInvoicePayment(body.raw, body.signature, config, unavailable); } catch (value) { error = value; }
    expect(error).toBeInstanceOf(StripeReconciliationError);
    expect(String(error)).toBe("Error: provider_unavailable");
    expect(String(error)).not.toContain(config.stripeKey);
  });
  it("ignores unrelated signed events without making provider calls", async () => {
    const f = fixture();
    f.event.type = "customer.created";
    expect(await run(f)).toEqual({ kind: "ignored", provider_event_id: f.event.id });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("refuses a test key in live mode and oversized input without provider calls", async () => {
    const f = fixture();
    await expect(run(f, { ...config, mode: "live" })).rejects.toMatchObject({ code: "configuration_unavailable" });
    await expect(reconcileStripeManualInvoicePayment(" ".repeat(65537), null, config, f.fetcher))
      .rejects.toMatchObject({ code: "configuration_unavailable" });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});

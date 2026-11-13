import { describe, expect, it } from "vitest";
import { reconcileStripeFinancialIncident } from "../supabase/functions/_shared/subscription-financial-incidents";
import { financialFixture, financialConfig, financialQuery, financialSignature, type FinancialObject } from "./helpers/stripe-financial-fixtures";

async function reconcile(f = financialFixture()) {
  const result = await reconcileStripeFinancialIncident(f.raw(), f.signature(), financialConfig, f.fetcher);
  if (result.kind !== "incident") throw Error("Expected a provider observation");
  return result;
}
const snapshot = (f: ReturnType<typeof financialFixture>) =>
  (f.event.data as FinancialObject).object as FinancialObject;

describe("canonical Stripe financial observations, no external network", () => {
  it("observes a partial refund without copying private Stripe evidence or granting a licence", async () => {
    const f = financialFixture();
    const result = await reconcile(f);
    expect(result.data).toMatchObject({ object_type: "refund", current_amount_cents: 5000,
      invoice_id: "in_FinancialOriginal", charge_amount_cents: 36300, currency: "EUR" });
    expect(JSON.stringify(result)).not.toContain("DO-NOT-COPY");
    expect(JSON.stringify(result)).not.toContain("customer_private_note");
    for (const [url, init] of f.fetcher.mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/api\.stripe\.com\/v1\//);
      expect(init).toMatchObject({ method: "GET", redirect: "error" });
    }
  });
  it("accepts an observed full refund rather than reusing the funded() rejection", async () => {
    const f = financialFixture();
    snapshot(f).amount = f.records["refunds/re_FinancialOriginal"].amount = 36300;
    f.records["charges/ch_FinancialOriginal"].amount_refunded = 36300;
    f.records["charges/ch_FinancialOriginal"].refunded = true;
    expect((await reconcile(f)).data).toMatchObject({ current_amount_cents: 36300, charge_amount_refunded_cents: 36300 });
  });
  it.each(["pending", "requires_action", "failed", "canceled"])("records %s as a provider status, not a completed refund", async status => {
    const f = financialFixture();
    snapshot(f).status = f.records["refunds/re_FinancialOriginal"].status = status;
    f.records["charges/ch_FinancialOriginal"].amount_refunded = 0;
    const result = await reconcile(f);
    expect(result.data.current_status).toBe(status);
    expect(result.data.charge_amount_refunded_cents).toBe(0);
  });
  it.each(["charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed"])("observes %s without storing dispute evidence", async type => {
    const result = await reconcile(financialFixture(type));
    expect(result.data.object_type).toBe("dispute");
    expect(JSON.stringify(result)).not.toContain("private-synthetic");
    expect(JSON.stringify(result)).not.toContain("evidence");
  });
  it("keeps historical invoice identity when subscription price/state/metadata/latest_invoice changed", async () => {
    const f = financialFixture();
    const result = await reconcile(f);
    expect(result.data.invoice_id).toBe("in_FinancialOriginal");
    expect(result.data.invoice_amount_cents).toBe(36300);
    expect(JSON.stringify(result)).not.toContain("SomeDifferentNewMonth");
    expect(JSON.stringify(result)).not.toContain("ANOTHER-COMPANY");
  });
  it("allows the immutable event status to differ from a later canonical provider observation", async () => {
    const f = financialFixture();
    snapshot(f).status = "pending";
    f.records["refunds/re_FinancialOriginal"].status = "succeeded";
    expect((await reconcile(f)).data).toMatchObject({ status_at_event: "pending", current_status: "succeeded" });
  });
  it("retains an old charge.refunded observation even after the current cumulative value returned to zero", async () => {
    const f = financialFixture("charge.refunded");
    f.records["charges/ch_FinancialOriginal"].amount_refunded = 0;
    const result = await reconcile(f);
    expect(result.data).toMatchObject({ event_amount_cents: 5000, current_amount_cents: 0 });
  });
  it("maps a one-off PaymentIntent without inventing an invoice or monthly period", async () => {
    const f = financialFixture();
    f.records[financialQuery].data = [];
    expect((await reconcile(f)).data).toMatchObject({ invoice_id: null, subscription_id: null,
      invoice_payment_id: null, invoice_period_start: null, invoice_period_end: null });
  });
  it("does no provider I/O before verifying HMAC", async () => {
    const f = financialFixture();
    await expect(reconcileStripeFinancialIncident(f.raw(), "t=1,v1=invalid", financialConfig, f.fetcher))
      .rejects.toMatchObject({ code: "invalid_signature" });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("rejects a live event using the sandbox configuration before provider I/O", async () => {
    const f = financialFixture();
    f.event.livemode = true;
    await expect(reconcile(f)).rejects.toMatchObject({ code: "provider_identity_mismatch" });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("rejects another canonical account", async () => {
    const f = financialFixture(); f.records.account.id = "acct_AnotherAccount";
    await expect(reconcile(f)).rejects.toMatchObject({ code: "provider_identity_mismatch" });
  });
  it("binds the body to the canonical Event resource rather than mutable delivery fields", async () => {
    const f = financialFixture(); const raw = f.raw();
    f.records["events/" + String(f.event.id)] = { ...f.event, data: { object: { id: "re_Another" } } };
    await expect(reconcileStripeFinancialIncident(raw, financialSignature(raw), financialConfig, f.fetcher))
      .rejects.toMatchObject({ code: "provider_identity_mismatch" });
  });
  it.each(["foreign_currency", "other_charge", "other_intent", "uncaptured", "connect_transfer", "refund_amount_change"])(
    "rejects canonical payment mismatch (%s)", async attack => {
      const f = financialFixture();
      if (attack === "foreign_currency") f.records["refunds/re_FinancialOriginal"].currency = "usd";
      if (attack === "other_charge") f.records["payment_intents/pi_FinancialOriginal"].latest_charge = "ch_Other";
      if (attack === "other_intent") f.records["refunds/re_FinancialOriginal"].payment_intent = "pi_Other";
      if (attack === "uncaptured") f.records["charges/ch_FinancialOriginal"].captured = false;
      if (attack === "connect_transfer") f.records["charges/ch_FinancialOriginal"].transfer_data = { destination: "acct_Other" };
      if (attack === "refund_amount_change") f.records["refunds/re_FinancialOriginal"].amount = 6000;
      await expect(reconcile(f)).rejects.toMatchObject({ code: "financial_event_invalid" });
    });
  it.each(["more", "two", "different_pi", "different_customer", "invalid_period"])("fails closed on ambiguous/historical invoice mapping (%s)", async attack => {
    const f = financialFixture(), payments = f.records[financialQuery];
    const rows = payments.data as FinancialObject[];
    if (attack === "more") payments.has_more = true;
    if (attack === "two") payments.data = [rows[0], structuredClone(rows[0])];
    if (attack === "different_pi") (rows[0].payment as FinancialObject).payment_intent = "pi_Other";
    if (attack === "different_customer") f.records["invoices/in_FinancialOriginal"].customer = "cus_Other";
    if (attack === "invalid_period") {
      const lines = f.records["invoices/in_FinancialOriginal"].lines as { data: FinancialObject[] };
      lines.data[0].period = { start: 10, end: 1 };
    }
    await expect(reconcile(f)).rejects.toMatchObject({ code: "financial_mapping_unavailable" });
  });
  it("does not apply licence policy to a canonical disputed amount differing from the original charge", async () => {
    const f = financialFixture("charge.dispute.created");
    snapshot(f).amount = f.records["disputes/dp_FinancialOriginal"].amount = 40000;
    expect((await reconcile(f)).data.current_amount_cents).toBe(40000);
  });
  it("acknowledges unsupported types without inventing an incident", async () => {
    const f = financialFixture("customer.created");
    const result = await reconcileStripeFinancialIncident(f.raw(), f.signature(), financialConfig, f.fetcher);
    expect(result.kind).toBe("ignored"); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("bounds provider responses rather than retaining arbitrary response bodies", async () => {
    const f = financialFixture();
    f.fetcher.mockImplementationOnce(async () => new Response(" ".repeat(524289), { status: 200 }));
    await expect(reconcile(f)).rejects.toMatchObject({ code: "provider_response_limit" });
  });
});

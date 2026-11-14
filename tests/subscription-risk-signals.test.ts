import { describe, expect, it } from "vitest";
import { reconcileStripeRiskSignal } from "../supabase/functions/_shared/subscription-risk-signals";
import {
  financialConfig,
  financialQuery,
} from "./helpers/stripe-financial-fixtures";
import { riskFixture } from "./helpers/stripe-risk-fixtures";

async function observe(
  f: ReturnType<typeof riskFixture>,
  config = financialConfig,
) {
  return reconcileStripeRiskSignal(f.raw(), f.signature(), config, f.fetcher);
}
describe("Basil native early fraud warning graph, read-only fixtures", () => {
  it.each(["created", "updated"])(
    "projects a canonical %s warning separately from financial loss",
    async (suffix) => {
      const f = riskFixture("radar.early_fraud_warning." + suffix),
        result = await observe(f);
      expect(result).toMatchObject({
        kind: "risk_signal",
        mode: "test",
        data: {
          warning_id: "issfr_RiskSynthetic",
          actionable_at_event: true,
          actionable_now: true,
          charge_amount_cents: 36300,
          invoice_id: "in_FinancialOriginal",
          subscription_id: "sub_FinancialOriginal",
        },
      });
      expect(JSON.stringify(result)).not.toMatch(
        /private_customer|DO-NOT|metadata|evidence|loss_amount|refund_amount/,
      );
      for (const [url, init] of f.fetcher.mock.calls) {
        expect(String(url).startsWith("https://api.stripe.com/v1/")).toBe(true);
        expect(init).toMatchObject({
          method: "GET",
          redirect: "error",
          headers: { "Stripe-Version": "2025-03-31.basil" },
        });
      }
      expect(f.fetcher).toHaveBeenCalledTimes(8); // hard bounded; no pagination or polling
    },
  );
  it("rejects an invalid signature before account/provider I/O", async () => {
    const f = riskFixture();
    await expect(
      reconcileStripeRiskSignal(
        f.raw(),
        "t=1,v1=invalid",
        financialConfig,
        f.fetcher,
      ),
    ).rejects.toMatchObject({ code: "invalid_signature" });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each(["account", "mode", "event_type", "event_object"])(
    "rejects canonical %s mismatches",
    async (mismatch) => {
      const f = riskFixture();
      if (mismatch === "account") f.records.account.id = "acct_ForeignMerchant";
      if (mismatch === "mode") f.event.livemode = true;
      if (mismatch === "event_type")
        f.records["events/" + String(f.event.id)] = {
          ...f.event,
          type: "refund.created",
        };
      if (mismatch === "event_object")
        f.records["events/" + String(f.event.id)] = {
          ...f.event,
          data: { object: { id: "issfr_Foreign" } },
        };
      await expect(observe(f)).rejects.toMatchObject({
        code: "provider_identity_mismatch",
      });
    },
  );
  it.each([
    "warning_id",
    "warning_type",
    "warning_created",
    "warning_mode",
    "charge",
    "pi",
    "currency",
    "capture",
    "destination",
  ])("rejects invalid native %s identity", async (mismatch) => {
    const f = riskFixture(),
      warning = f.records["radar/early_fraud_warnings/issfr_RiskSynthetic"],
      charge = f.records["charges/ch_FinancialOriginal"];
    if (mismatch === "warning_id") warning.id = "issfr_Foreign";
    if (mismatch === "warning_type") warning.object = "dispute";
    if (mismatch === "warning_created") warning.created = 1;
    if (mismatch === "warning_mode") warning.livemode = true;
    if (mismatch === "charge") warning.charge = "ch_Foreign";
    if (mismatch === "pi") warning.payment_intent = "pi_Foreign";
    if (mismatch === "currency") charge.currency = "usd";
    if (mismatch === "capture") charge.amount_captured = 1;
    if (mismatch === "destination")
      charge.transfer_data = { destination: "acct_Foreign" };
    await expect(observe(f)).rejects.toMatchObject({
      code: "risk_signal_invalid",
    });
  });
  it.each([
    "ambiguous",
    "overflow",
    "payment_intent",
    "customer",
    "invoice_mode",
    "unpaid",
  ])("refuses %s InvoicePayment mapping", async (mismatch) => {
    const f = riskFixture(),
      list = f.records[financialQuery],
      payment = (list.data as Record<string, unknown>[])[0];
    const invoice = f.records["invoices/in_FinancialOriginal"];
    if (mismatch === "ambiguous")
      list.data = [payment, { ...payment, id: "inpay_Foreign" }];
    if (mismatch === "overflow") list.has_more = true;
    if (mismatch === "payment_intent")
      payment.payment = {
        type: "payment_intent",
        payment_intent: "pi_Foreign",
      };
    if (mismatch === "customer") invoice.customer = "cus_Foreign";
    if (mismatch === "invoice_mode") invoice.livemode = true;
    if (mismatch === "unpaid") invoice.status = "open";
    await expect(observe(f)).rejects.toMatchObject({
      code:
        mismatch === "invoice_mode"
          ? "risk_signal_invalid"
          : "risk_signal_mapping_unavailable",
    });
  });
  it("uses canonical snapshot instead of signed stale/non-authoritative embedded fields", async () => {
    const f = riskFixture(),
      canonical = structuredClone(f.event);
    f.records["events/" + String(f.event.id)] = canonical;
    (f.event.data as { object: Record<string, unknown> }).object.fraud_type =
      "forged";
    expect(await observe(f)).toMatchObject({
      data: { fraud_type_at_event: "misc" },
    });
  });
  it("preserves warning observations even after a refund/dispute; actionable does not establish a loss", async () => {
    const f = riskFixture();
    f.records["radar/early_fraud_warnings/issfr_RiskSynthetic"].actionable =
      false;
    Object.assign(f.records["charges/ch_FinancialOriginal"], {
      disputed: true,
      refunded: true,
      amount_refunded: 36300,
    });
    expect(await observe(f)).toMatchObject({
      data: { actionable_at_event: true, actionable_now: false },
    });
  });
  it("supports a genuinely one-time charge with no InvoicePayment, leaving binding to native receipts", async () => {
    const f = riskFixture();
    f.records[financialQuery].data = [];
    expect(await observe(f)).toMatchObject({
      data: {
        invoice_id: null,
        subscription_id: null,
        invoice_payment_id: null,
      },
    });
  });
  it("bounds non-success/invalid body errors without returning provider data", async () => {
    const f = riskFixture();
    f.fetcher.mockImplementationOnce(
      async () => new Response("private backend failure", { status: 429 }),
    );
    await expect(observe(f)).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });
});

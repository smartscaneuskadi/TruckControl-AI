import { createHmac } from "node:crypto";
import { vi } from "vitest";
import type { StripeReconciliationConfig } from "../../supabase/functions/_shared/subscription-stripe-reconciliation";

export type FinancialObject = Record<string, unknown>;
export const financialStamp = Math.floor(Date.now() / 1000);
export const financialAccount = "acct_FinancialSynthetic";
export const financialQuery = "invoice_payments?payment%5Btype%5D=payment_intent&payment%5Bpayment_intent%5D=pi_FinancialOriginal&status=paid&limit=2";
export const financialConfig: StripeReconciliationConfig = {
  mode: "test", expectedAccountId: financialAccount, stripeKey: "rk_test_fixture",
  webhookSecret: "synthetic-financial-webhook-only", now: financialStamp * 1000,
};
export function financialSignature(raw: string, at = financialStamp) {
  return "t=" + at + ",v1=" + createHmac("sha256", financialConfig.webhookSecret)
    .update(String(at) + "." + raw).digest("hex");
}
export function financialFixture(type = "refund.created") {
  const charge: FinancialObject = {
    id: "ch_FinancialOriginal", object: "charge", livemode: false,
    payment_intent: "pi_FinancialOriginal", customer: "cus_FinancialOriginal",
    amount: 36300, amount_captured: 36300, amount_refunded: 5000, currency: "eur",
    paid: true, captured: true, refunded: false, disputed: false, status: "succeeded",
    created: financialStamp - 60 * 86400, on_behalf_of: null, transfer_data: null,
  };
  const refund: FinancialObject = {
    id: "re_FinancialOriginal", object: "refund", amount: 5000, currency: "eur",
    charge: charge.id, payment_intent: charge.payment_intent, status: type === "refund.failed" ? "failed" : "succeeded",
    metadata: { customer_private_note: "DO-NOT-COPY-SYNTHETIC-NOTE" },
  };
  const dispute: FinancialObject = {
    id: "du_FinancialOriginal", object: "dispute", livemode: false, amount: 10000, currency: "eur",
    charge: charge.id, payment_intent: charge.payment_intent,
    status: type === "charge.dispute.closed" ? "won" : "needs_response",
    evidence: { customer_email_address: "private-synthetic@example.invalid" },
  };
  const invoice: FinancialObject = {
    id: "in_FinancialOriginal", object: "invoice", livemode: false, currency: "eur",
    customer: charge.customer, status: "paid", amount_paid: 36300, total: 36300, amount_remaining: 0,
    paid_out_of_band: false, billing_reason: "subscription_cycle",
    status_transitions: { paid_at: financialStamp - 20 },
    parent: { subscription_details: { subscription: "sub_FinancialOriginal", metadata: {
      tc_request_id: "cb220000-0000-4000-8000-000000000001",
      tc_user_id: "cb110000-0000-4000-8000-000000000001",
      tc_company_id: "cb330000-0000-4000-8000-000000000001",
    } } },
    lines: { has_more: false, data: [{ quantity: 1, price: "price_FinancialHistorical",
      period: { start: financialStamp - 30 * 86400, end: financialStamp } }] },
  };
  const subscription: FinancialObject = {
    id: "sub_FinancialOriginal", object: "subscription", livemode: false,
    customer: charge.customer, status: "canceled", cancel_at_period_end: true,
    latest_invoice: "in_SomeDifferentNewMonth", current_period_end: financialStamp,
    metadata: { mutable_untrusted_owner: "ANOTHER-COMPANY" },
    items: { has_more: false, data: [{ quantity: 1, current_period_end: financialStamp,
      price: { id: "price_FinancialHistorical", unit_amount: 99999, currency: "eur",
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } } }] },
  };
  const records: Record<string, FinancialObject> = {
    account: { id: financialAccount },
    "charges/ch_FinancialOriginal": charge, "refunds/re_FinancialOriginal": refund,
    "disputes/du_FinancialOriginal": dispute, "invoices/in_FinancialOriginal": invoice,
    "subscriptions/sub_FinancialOriginal": subscription,
    "payment_intents/pi_FinancialOriginal": {
      id: "pi_FinancialOriginal", object: "payment_intent", livemode: false, currency: "eur",
      customer: charge.customer, latest_charge: charge.id, status: "succeeded",
      capture_method: "automatic", amount: 36300, amount_received: 36300, amount_capturable: 0,
      on_behalf_of: null, transfer_data: null,
      metadata: { tc_company_id: "not-authoritative" },
    },
    [financialQuery]: { object: "list", has_more: false, data: [{
      id: "inpay_FinancialOriginal", object: "invoice_payment", livemode: false,
      invoice: invoice.id, amount_requested: 36300, amount_paid: 36300, status: "paid", currency: "eur",
      status_transitions: { paid_at: financialStamp - 20 },
      payment: { type: "payment_intent", payment_intent: charge.payment_intent },
    }] },
  };
  const resource = type === "charge.refunded" ? charge : type.startsWith("charge.dispute.") ? dispute :
    type === "invoice.paid" ? invoice : refund;
  const event: FinancialObject = {
    id: "evt_FinancialOriginal", object: "event", type, livemode: false,
    created: financialStamp - 10, data: { object: structuredClone(resource) },
  };
  records["events/" + String(event.id)] = event;
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://api.stripe.com/v1/") || init?.method !== "GET" || init.redirect !== "error")
      throw Error("Only fixed-origin GET is allowed in this fixture");
    const path = url.slice("https://api.stripe.com/v1/".length);
    const value = records[path];
    if (!value) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return {
    event, records, fetcher,
    raw: () => JSON.stringify(event),
    signature: () => financialSignature(JSON.stringify(event)),
  };
}

import {
  canonicalStripeEnvelope,
  stripeObject as obj,
  stripeRef as ref,
  stripeId as id,
  stripeCents as cents,
  stripeSeconds as seconds,
  type StripeObject,
} from "./stripe-provider-reader.ts";
import type { StripeReconciliationConfig } from "./subscription-stripe-reconciliation.ts";

/** Both events exist in the pinned 2025-03-31.basil event reference. */
export const stripeRiskSignalTypes = new Set([
  "radar.early_fraud_warning.created",
  "radar.early_fraud_warning.updated",
]);
export const stripeFraudTypes = new Set([
  "card_never_received",
  "fraudulent_card_application",
  "made_with_counterfeit_card",
  "made_with_lost_card",
  "made_with_stolen_card",
  "misc",
  "unauthorized_use_of_card",
]);
export class StripeRiskSignalError extends Error {
  constructor(
    readonly code: "risk_signal_invalid" | "risk_signal_mapping_unavailable",
  ) {
    super(code);
  }
}
export interface StripeRiskSignal {
  event_id: string;
  event_type: string;
  event_created: number;
  livemode: boolean;
  warning_id: string;
  warning_created: number;
  actionable_at_event: boolean;
  actionable_now: boolean;
  fraud_type_at_event: string;
  fraud_type_now: string;
  payment_intent_id: string;
  charge_id: string;
  customer_id: string | null;
  charge_amount_cents: number;
  currency: "EUR";
  invoice_id: string | null;
  subscription_id: string | null;
  invoice_payment_id: string | null;
  invoice_period_start: number | null;
  invoice_period_end: number | null;
}
export type StripeRiskSignalResult =
  | { kind: "ignored"; event_id: string }
  | {
      kind: "risk_signal";
      account: string;
      mode: "test" | "live";
      data: StripeRiskSignal;
    };
const fail = (mapping = false): never => {
  throw new StripeRiskSignalError(
    mapping ? "risk_signal_mapping_unavailable" : "risk_signal_invalid",
  );
};

/** Informational observation only. Never creates money movement, access or a fiscal task.
 * Every relationship comes from the native graph, never metadata/latest_invoice.
 */
export async function reconcileStripeRiskSignal(
  raw: string,
  signature: string | null,
  config: StripeReconciliationConfig,
  fetcher: typeof fetch = fetch,
): Promise<StripeRiskSignalResult> {
  const envelope = await canonicalStripeEnvelope(
    raw,
    signature,
    config,
    stripeRiskSignalTypes,
    fetcher,
  );
  if (envelope.kind === "ignored") return envelope;
  const { event, snapshot, get, now } = envelope;
  const mode = (value: StripeObject) => {
    if (value.livemode !== event.livemode) fail();
  };
  const warning = (value: StripeObject) => {
    mode(value);
    if (
      !id(value.id, "issfr") ||
      value.object !== "radar.early_fraud_warning" ||
      !seconds(value.created, now) ||
      typeof value.actionable !== "boolean" ||
      !stripeFraudTypes.has(String(value.fraud_type)) ||
      !id(ref(value.charge), "ch") ||
      (ref(value.payment_intent) != null &&
        !id(ref(value.payment_intent), "pi"))
    )
      fail();
  };
  warning(snapshot);
  if (Number(snapshot.created) > Number(event.created)) return fail();
  const current = await get("radar/early_fraud_warnings/" + snapshot.id);
  warning(current);
  if (
    current.id !== snapshot.id ||
    current.created !== snapshot.created ||
    ref(current.charge) !== ref(snapshot.charge)
  )
    return fail();
  const chargeId = String(ref(current.charge));
  const charge = await get("charges/" + chargeId);
  mode(charge);
  const intentId = ref(charge.payment_intent);
  if (
    charge.id !== chargeId ||
    charge.object !== "charge" ||
    !id(intentId, "pi") ||
    charge.currency !== "eur" ||
    charge.status !== "succeeded" ||
    charge.paid !== true ||
    charge.captured !== true ||
    !cents(charge.amount) ||
    charge.amount < 1 ||
    charge.amount_captured !== charge.amount ||
    !cents(charge.amount_refunded) ||
    charge.amount_refunded > charge.amount ||
    typeof charge.refunded !== "boolean" ||
    typeof charge.disputed !== "boolean" ||
    charge.on_behalf_of != null ||
    charge.transfer_data != null
  )
    return fail();
  for (const value of [snapshot, current])
    if (
      ref(value.payment_intent) != null &&
      ref(value.payment_intent) !== intentId
    )
      return fail();
  const intent = await get("payment_intents/" + intentId);
  mode(intent);
  const customer = ref(intent.customer);
  if (
    intent.id !== intentId ||
    intent.object !== "payment_intent" ||
    intent.status !== "succeeded" ||
    intent.currency !== "eur" ||
    intent.amount !== charge.amount ||
    intent.amount_received !== charge.amount ||
    intent.amount_capturable !== 0 ||
    !["automatic", "automatic_async"].includes(String(intent.capture_method)) ||
    ref(intent.latest_charge) !== chargeId ||
    ref(charge.customer) !== customer ||
    (customer != null && !id(customer, "cus")) ||
    intent.on_behalf_of != null ||
    intent.transfer_data != null
  )
    return fail();
  const list = await get(
    "invoice_payments?payment%5Btype%5D=payment_intent&payment%5Bpayment_intent%5D=" +
      intentId +
      "&status=paid&limit=2",
  );
  if (
    list.object !== "list" ||
    list.has_more !== false ||
    !Array.isArray(list.data) ||
    list.data.length > 1
  )
    return fail(true);
  let invoiceId: string | null = null,
    subscriptionId: string | null = null,
    paymentId: string | null = null;
  let start: number | null = null,
    end: number | null = null;
  if (list.data.length) {
    const payment = obj(list.data[0]),
      detail = obj(payment.payment);
    mode(payment);
    const wantedInvoice = ref(payment.invoice);
    if (
      !id(payment.id, "inpay") ||
      payment.object !== "invoice_payment" ||
      !id(wantedInvoice, "in") ||
      payment.status !== "paid" ||
      payment.currency !== "eur" ||
      payment.amount_paid !== charge.amount ||
      payment.amount_requested !== charge.amount ||
      detail.type !== "payment_intent" ||
      ref(detail.payment_intent) !== intentId
    )
      return fail(true);
    const invoice = await get("invoices/" + wantedInvoice);
    mode(invoice);
    const sub = ref(
      obj(obj(invoice.parent).subscription_details).subscription ??
        invoice.subscription,
    );
    const lines = obj(invoice.lines),
      line = obj(
        Array.isArray(lines.data) && lines.data.length === 1
          ? lines.data[0]
          : null,
      );
    const period = obj(line.period);
    if (
      invoice.id !== wantedInvoice ||
      invoice.object !== "invoice" ||
      invoice.currency !== "eur" ||
      invoice.status !== "paid" ||
      invoice.amount_paid !== charge.amount ||
      invoice.total !== charge.amount ||
      invoice.amount_remaining !== 0 ||
      invoice.paid_out_of_band !== false ||
      ref(invoice.customer) !== customer ||
      !id(sub, "sub") ||
      lines.has_more !== false ||
      line.quantity !== 1 ||
      !seconds(period.start, now) ||
      !seconds(period.end, now + 62 * 86400000) ||
      period.end <= period.start
    )
      return fail(true);
    const subscription = await get("subscriptions/" + sub);
    mode(subscription);
    if (
      subscription.id !== sub ||
      subscription.object !== "subscription" ||
      ref(subscription.customer) !== customer
    )
      return fail(true);
    invoiceId = wantedInvoice;
    subscriptionId = sub;
    paymentId = String(payment.id);
    start = period.start;
    end = period.end;
  }
  return {
    kind: "risk_signal",
    account: config.expectedAccountId,
    mode: config.mode,
    data: {
      event_id: String(event.id),
      event_type: String(event.type),
      event_created: Number(event.created),
      livemode: Boolean(event.livemode),
      warning_id: String(snapshot.id),
      warning_created: Number(snapshot.created),
      actionable_at_event: Boolean(snapshot.actionable),
      actionable_now: Boolean(current.actionable),
      fraud_type_at_event: String(snapshot.fraud_type),
      fraud_type_now: String(current.fraud_type),
      payment_intent_id: intentId,
      charge_id: chargeId,
      customer_id: typeof customer === "string" ? customer : null,
      charge_amount_cents: charge.amount,
      currency: "EUR",
      invoice_id: invoiceId,
      subscription_id: subscriptionId,
      invoice_payment_id: paymentId,
      invoice_period_start: start,
      invoice_period_end: end,
    },
  };
}

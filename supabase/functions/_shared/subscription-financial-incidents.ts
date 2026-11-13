import { canonicalStripeEnvelope, stripeObject as obj, stripeRef as ref,
  stripeId as id, stripeCents as cents, stripeSeconds as seconds, type StripeObject } from "./stripe-provider-reader.ts";
import { type StripeReconciliationConfig } from "./subscription-stripe-reconciliation.ts";

export const stripeIncidentTypes = new Set([
  "charge.refunded", "refund.created", "refund.updated", "refund.failed",
  "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed",
]);
export class StripeFinancialIncidentError extends Error {
  constructor(readonly code: "financial_event_invalid" | "financial_mapping_unavailable") { super(code); }
}
export interface StripeFinancialIncident {
  event_id: string; event_type: string; event_created: number; livemode: boolean; currency: "EUR";
  object_type: "refund" | "dispute" | "charge"; object_id: string;
  status_at_event: string; current_status: string;
  event_amount_cents: number; current_amount_cents: number;
  charge_amount_cents: number; charge_amount_refunded_cents: number;
  event_amount_refunded_cents: number | null;
  payment_intent_id: string; charge_id: string; customer_id: string | null;
  invoice_id: string | null; subscription_id: string | null; invoice_payment_id: string | null;
  invoice_period_start: number | null; invoice_period_end: number | null; invoice_amount_cents: number | null;
}
export type StripeFinancialResult =
  | { kind: "ignored"; event_id: string }
  | { kind: "incident"; account: string; mode: "test" | "live"; data: StripeFinancialIncident };
const refundStates = new Set(["pending", "requires_action", "succeeded", "failed", "canceled"]);
const disputeStates = new Set(["warning_needs_response", "warning_under_review", "warning_closed",
  "needs_response", "under_review", "won", "lost"]);
const fail = (mapping = false): never => { throw new StripeFinancialIncidentError(
  mapping ? "financial_mapping_unavailable" : "financial_event_invalid"); };
const positiveCents = (value: unknown): value is number => cents(value) && value > 0;

/**
 * Read-only observation, never a refund command or licence decision.
 * Metadata/current plan/latest_invoice are deliberately not used as authority.
 */
export async function reconcileStripeFinancialIncident(
  raw: string, signature: string | null, config: StripeReconciliationConfig,
  fetcher: typeof fetch = fetch,
): Promise<StripeFinancialResult> {
  const envelope = await canonicalStripeEnvelope(raw, signature, config, stripeIncidentTypes, fetcher);
  if (envelope.kind === "ignored") return envelope;
  const { event, snapshot, get, now } = envelope;
  const mode = (record: StripeObject, optional = false) => {
    if (!(optional && record.livemode === undefined) && record.livemode !== event.livemode) fail();
  };
  const type = String(event.type);
  const objectType = type.startsWith("refund.") ? "refund" : type.startsWith("charge.dispute.") ? "dispute" : "charge";
  const prefix = objectType === "refund" ? "re" : objectType === "dispute" ? "dp" : "ch";
  if (!id(snapshot.id, prefix) || snapshot.object !== objectType) return fail();
  mode(snapshot, objectType === "refund");
  const current = await get((objectType === "refund" ? "refunds/" : objectType === "dispute" ? "disputes/" : "charges/") + snapshot.id);
  if (current.id !== snapshot.id || current.object !== objectType || current.currency !== "eur" || snapshot.currency !== "eur")
    return fail();
  mode(current, objectType === "refund");
  const chargeId = objectType === "charge" ? current.id : ref(current.charge);
  if (!id(chargeId, "ch") || objectType !== "charge" && ref(snapshot.charge) !== chargeId) return fail();
  const charge = objectType === "charge" ? current : await get("charges/" + chargeId);
  mode(charge);
  const intentId = ref(charge.payment_intent);
  if (!id(intentId, "pi") || charge.id !== chargeId || charge.object !== "charge" ||
      charge.currency !== "eur" || charge.status !== "succeeded" || charge.paid !== true ||
      charge.captured !== true || !positiveCents(charge.amount) || charge.amount_captured !== charge.amount ||
      !cents(charge.amount_refunded) || charge.amount_refunded > charge.amount ||
      typeof charge.refunded !== "boolean" || typeof charge.disputed !== "boolean" ||
      charge.on_behalf_of != null || charge.transfer_data != null) return fail();
  const intent = await get("payment_intents/" + intentId);
  mode(intent);
  const customer = ref(intent.customer);
  if (intent.id !== intentId || intent.object !== "payment_intent" || intent.status !== "succeeded" ||
      intent.currency !== "eur" || intent.amount !== charge.amount || intent.amount_received !== charge.amount ||
      intent.amount_capturable !== 0 || !["automatic", "automatic_async"].includes(String(intent.capture_method)) ||
      ref(intent.latest_charge) !== chargeId || ref(charge.customer) !== customer ||
      customer != null && !id(customer, "cus") || intent.on_behalf_of != null || intent.transfer_data != null)
    return fail();
  if (objectType !== "charge" && (
      ref(current.payment_intent) != null && ref(current.payment_intent) !== intentId ||
      ref(snapshot.payment_intent) != null && ref(snapshot.payment_intent) !== intentId)) return fail();

  let eventAmount: unknown = snapshot.amount;
  let currentAmount: unknown = current.amount;
  const eventStatus = snapshot.status;
  const currentStatus = current.status;
  let eventRefunded: number | null = null;
  if (objectType === "charge") {
    if (snapshot.amount !== charge.amount || snapshot.status !== "succeeded" ||
        !cents(snapshot.amount_refunded) || snapshot.amount_refunded > charge.amount) return fail();
    eventRefunded = snapshot.amount_refunded;
    eventAmount = eventRefunded;
    currentAmount = charge.amount_refunded;
  } else {
    const states = objectType === "refund" ? refundStates : disputeStates;
    if (!states.has(String(eventStatus)) || !states.has(String(currentStatus)) ||
        !positiveCents(eventAmount) || !positiveCents(currentAmount)) return fail();
    if (objectType === "refund" && (eventAmount !== currentAmount || currentAmount > charge.amount)) return fail();
    if (type === "refund.failed" && eventStatus !== "failed" ||
        type === "charge.dispute.closed" && !["won", "lost", "warning_closed"].includes(String(eventStatus))) return fail();
  }
  if (!cents(eventAmount) || !cents(currentAmount) || typeof eventStatus !== "string" || typeof currentStatus !== "string")
    return fail();

  // Reverse lookup follows THIS PaymentIntent, never the subscription's latest invoice.
  const payments = await get("invoice_payments?payment%5Btype%5D=payment_intent&payment%5Bpayment_intent%5D="
    + intentId + "&status=paid&limit=2");
  if (payments.object !== "list" || payments.has_more !== false || !Array.isArray(payments.data) || payments.data.length > 1)
    return fail(true);
  let invoiceId: string | null = null, subscriptionId: string | null = null, paymentId: string | null = null;
  let start: number | null = null, end: number | null = null, invoiceAmount: number | null = null;
  if (payments.data.length === 1) {
    const payment = obj(payments.data[0]), detail = obj(payment.payment);
    mode(payment);
    if (!id(payment.id, "inpay") || payment.object !== "invoice_payment" || !id(ref(payment.invoice), "in") ||
        payment.status !== "paid" || payment.currency !== "eur" || payment.amount_paid !== charge.amount ||
        payment.amount_requested !== charge.amount || detail.type !== "payment_intent" ||
        ref(detail.payment_intent) !== intentId) return fail(true);
    const wantedInvoice = String(ref(payment.invoice));
    const invoice = await get("invoices/" + wantedInvoice);
    mode(invoice);
    const sub = ref(obj(obj(invoice.parent).subscription_details).subscription ?? invoice.subscription);
    const lines = obj(invoice.lines), line = obj(Array.isArray(lines.data) && lines.data.length === 1 ? lines.data[0] : null);
    const period = obj(line.period);
    if (invoice.id !== wantedInvoice || invoice.object !== "invoice" || invoice.currency !== "eur" ||
        ref(invoice.customer) !== customer || !id(sub, "sub") || lines.has_more !== false ||
        line.quantity !== 1 || !seconds(period.start, now) || !seconds(period.end, now + 62 * 86400000) ||
        period.end <= period.start) return fail(true);
    const subscription = await get("subscriptions/" + sub);
    mode(subscription);
    // Historical prices, state and metadata may have changed: identity only.
    if (subscription.id !== sub || subscription.object !== "subscription" || ref(subscription.customer) !== customer)
      return fail(true);
    invoiceId = wantedInvoice; subscriptionId = sub; paymentId = String(payment.id);
    start = period.start; end = period.end; invoiceAmount = Number(payment.amount_paid);
  }
  return { kind: "incident", account: config.expectedAccountId, mode: config.mode, data: {
    event_id: String(event.id), event_type: type, event_created: Number(event.created), livemode: Boolean(event.livemode), currency: "EUR",
    object_type: objectType, object_id: String(snapshot.id), status_at_event: eventStatus, current_status: currentStatus,
    event_amount_cents: eventAmount, current_amount_cents: currentAmount,
    charge_amount_cents: charge.amount, charge_amount_refunded_cents: charge.amount_refunded,
    event_amount_refunded_cents: eventRefunded,
    payment_intent_id: intentId, charge_id: chargeId, customer_id: typeof customer === "string" ? customer : null,
    invoice_id: invoiceId, subscription_id: subscriptionId, invoice_payment_id: paymentId,
    invoice_period_start: start, invoice_period_end: end, invoice_amount_cents: invoiceAmount,
  } };
}

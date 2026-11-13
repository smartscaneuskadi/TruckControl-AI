import { isUuid } from "./invoice.ts";
import { canonicalStripeEnvelope, stripeObject as obj, stripeRef as ref } from "./stripe-provider-reader.ts";
import { stripeIncidentTypes, StripeFinancialIncidentError, type StripeFinancialIncident } from "./subscription-financial-incidents.ts";
import type { StripeReconciliationConfig } from "./subscription-stripe-reconciliation.ts";

export interface StripeOwnedCheckout {
  request_id: string;
  user_id: string;
  checkout_id: string;
  mode: "payment" | "subscription";
}
const fail = (): never => { throw new StripeFinancialIncidentError("financial_mapping_unavailable"); };

/** Additional proof only after the existing verified ledger lacks a paid task.
 * One exact-PI/subscription Checkout list, at most two objects, no pagination.
 * Native SQL MUST independently match the saved request/checkout/owner/quote.
 * Official GET /v1/checkout/sessions supports payment_intent and subscription.
 */
export async function reconcileStripeOwnedCheckout(
  raw: string, signature: string | null, config: StripeReconciliationConfig,
  incident: StripeFinancialIncident, fetcher: typeof fetch = fetch,
): Promise<StripeOwnedCheckout> {
  const envelope = await canonicalStripeEnvelope(raw, signature, config, stripeIncidentTypes, fetcher);
  if (envelope.kind !== "verified" || envelope.event.id !== incident.event_id ||
      envelope.event.type !== incident.event_type || envelope.event.created !== incident.event_created ||
      envelope.snapshot.id !== incident.object_id || envelope.event.livemode !== incident.livemode) return fail();
  const recurring = incident.invoice_id !== null;
  const query = recurring ? "subscription=" + incident.subscription_id : "payment_intent=" + incident.payment_intent_id;
  const list = await envelope.get("checkout/sessions?" + query + "&limit=2");
  if (list.object !== "list" || list.has_more !== false || !Array.isArray(list.data) || list.data.length !== 1) return fail();
  const session = obj(list.data[0]), metadata = obj(session.metadata);
  if (typeof session.id !== "string" || !/^cs_[A-Za-z0-9_]{1,200}$/.test(session.id) ||
      session.object !== "checkout.session" || session.status !== "complete" ||
      session.livemode !== incident.livemode || session.currency !== "eur" ||
      session.mode !== (recurring ? "subscription" : "payment") ||
      ref(session.customer) !== incident.customer_id ||
      !isUuid(metadata.tc_request_id) || !isUuid(metadata.tc_user_id)) return fail();
  if (!recurring) {
    if (session.payment_status !== "paid" || session.amount_total !== incident.charge_amount_cents ||
        ref(session.payment_intent) !== incident.payment_intent_id || session.subscription != null) return fail();
  } else {
    if (ref(session.subscription) !== incident.subscription_id ||
        !["paid", "no_payment_required"].includes(String(session.payment_status))) return fail();
    const invoice = await envelope.get("invoices/" + incident.invoice_id);
    const details = obj(obj(invoice.parent).subscription_details), original = obj(details.metadata);
    if (invoice.id !== incident.invoice_id || invoice.object !== "invoice" || invoice.livemode !== incident.livemode ||
        ref(details.subscription ?? invoice.subscription) !== incident.subscription_id ||
        original.tc_request_id !== metadata.tc_request_id || original.tc_user_id !== metadata.tc_user_id) return fail();
  }
  return { request_id: metadata.tc_request_id, user_id: metadata.tc_user_id,
    checkout_id: session.id, mode: recurring ? "subscription" : "payment" };
}

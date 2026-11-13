import { isUuid } from "./invoice.ts";
import { stripeServerKeyMode } from "./stripe-server-key.ts";
import { verifyStripeSignature } from "../truckcontrol-billing/handler.ts";
import { stripeEventMatchesAccount } from "./stripe-event-scope.ts";

type Obj = Record<string, unknown>;
export type StripeReconciliationCode =
  | "invalid_signature" | "invalid_event" | "configuration_unavailable"
  | "provider_unavailable" | "provider_response_limit" | "provider_identity_mismatch"
  | "payment_not_confirmed" | "unsupported_payment" | "correlation_missing";

/** Codes only: never retain provider responses, customer details or secret values. */
export class StripeReconciliationError extends Error {
  constructor(readonly code: StripeReconciliationCode) { super(code); }
}
export interface StripeReconciliationConfig {
  stripeKey: string;
  webhookSecret: string;
  expectedAccountId: string;
  mode: "test" | "live";
  now?: number;
}
interface PaymentCorrelation {
  provider_account_id: string;
  provider_event_id: string;
  provider_payment_id: string;
  request_id: string;
  user_id: string;
  /** Absence requires a server-side unambiguous organization lookup, never a client guess. */
  company_id: string | null;
  amount_cents: number;
  currency: "EUR";
  paid_at: string;
  livemode: boolean;
  provider_event_type: string;
  provider_event_created: number;
  customer_id: string | null;
}
export type ReconciledStripePayment =
  | ({ kind: "initial_payment"; checkout_id: string } & PaymentCorrelation)
  | ({ kind: "subscription_invoice"; invoice_id: string; subscription_id: string;
       invoice_period_start: number; invoice_period_end: number;
       billing_reason: "subscription_create" | "subscription_cycle";
       subscription_state: string; cancel_at_period_end: boolean;
       subscription_current_period_end: number; unit_amount: number } & PaymentCorrelation)
  | { kind: "ignored"; provider_event_id: string };

const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const id = (v: unknown, prefix: string): v is string =>
  typeof v === "string" && new RegExp("^" + prefix + "_[A-Za-z0-9]{1,200}$").test(v);
const ref = (v: unknown): unknown => typeof v === "string" ? v : obj(v).id;
const money = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 100 && v <= 100000000;
const seconds = (v: unknown, now: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= now / 1000 + 300;
const fail = (code: StripeReconciliationCode): never => { throw new StripeReconciliationError(code); };
const supported = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "invoice.paid"]);
const states = new Set(["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"]);

async function boundedJson(response: Response): Promise<Obj> {
  const reader = response.body?.getReader();
  if (!reader) return fail("provider_unavailable");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 524288) { await reader.cancel(); return fail("provider_response_limit"); }
    chunks.push(part.value);
  }
  const all = new Uint8Array(length);
  let offset = 0;
  for (const part of chunks) { all.set(part, offset); offset += part.length; }
  return obj(JSON.parse(new TextDecoder().decode(all)));
}

/**
 * Read-only reconciliation for the future server-only fiscal intake.
 * Signature precedes every request. Only the fixed Stripe origin, GET, TLS and
 * bounded responses are allowed. No payment, database write, email or invoice
 * issuance occurs here. This helper deliberately does not activate either
 * checkout handler or grant any database/API capability.
 */
export async function reconcileStripeManualInvoicePayment(
  raw: string,
  signature: string | null,
  config: StripeReconciliationConfig,
  fetcher: typeof fetch = fetch,
): Promise<ReconciledStripePayment> {
  const now = config.now ?? Date.now();
  try {
    if (new TextEncoder().encode(raw).byteLength > 65536 ||
        !Number.isFinite(now) || !id(config.expectedAccountId, "acct") ||
        config.mode !== "test" && config.mode !== "live" ||
        stripeServerKeyMode(config.stripeKey) !== config.mode ||
        !config.webhookSecret) return fail("configuration_unavailable");
    if (!await verifyStripeSignature(raw, signature, config.webhookSecret, now))
      return fail("invalid_signature");
    const event = obj(JSON.parse(raw));
    if (!id(event.id, "evt") || typeof event.type !== "string" ||
        typeof event.livemode !== "boolean" || !seconds(event.created, now))
      return fail("invalid_event");
    if (event.livemode !== (config.mode === "live") || !stripeEventMatchesAccount(event, config.expectedAccountId))
      return fail("provider_identity_mismatch");
    if (!supported.has(event.type)) return { kind: "ignored", provider_event_id: event.id };

    const resource = obj(obj(event.data).object);
    if (event.type === "invoice.paid" ? !id(resource.id, "in") :
        typeof resource.id !== "string" || !/^cs_[A-Za-z0-9_]{1,200}$/.test(resource.id))
      return fail("invalid_event");
    const deadline = AbortSignal.timeout(25000);
    const get = async (path: string): Promise<Obj> => {
      const response = await fetcher("https://api.stripe.com/v1/" + path, {
        method: "GET",
        headers: { Authorization: "Bearer " + config.stripeKey, "Stripe-Version": "2025-03-31.basil" },
        redirect: "error",
        signal: AbortSignal.any([deadline, AbortSignal.timeout(10000)]),
      });
      if (!response.ok) return fail("provider_unavailable");
      return boundedJson(response);
    };
    const account = await get("account");
    if (account.id !== config.expectedAccountId) return fail("provider_identity_mismatch");
    const canonicalEvent = await get("events/" + event.id);
    if (canonicalEvent.id !== event.id || canonicalEvent.type !== event.type ||
        canonicalEvent.created !== event.created || canonicalEvent.livemode !== event.livemode ||
        !stripeEventMatchesAccount(canonicalEvent, config.expectedAccountId) ||
        obj(obj(canonicalEvent.data).object).id !== resource.id)
      return fail("provider_identity_mismatch");
    const live = (record: Obj): void => {
      if (record.livemode !== event.livemode) fail("provider_identity_mismatch");
    };
    const correlate = (metadata: unknown) => {
      const m = obj(metadata);
      if (!isUuid(m.tc_request_id) || !isUuid(m.tc_user_id) ||
          m.tc_company_id != null && !isUuid(m.tc_company_id))
        return fail("correlation_missing");
      return { request_id: m.tc_request_id, user_id: m.tc_user_id,
        company_id: typeof m.tc_company_id === "string" ? m.tc_company_id : null };
    };
    const funded = async (paymentId: unknown, amount: number, customer: unknown): Promise<{ intent: Obj; charge: Obj }> => {
      if (!id(paymentId, "pi")) return fail("unsupported_payment");
      const intent = await get("payment_intents/" + paymentId);
      live(intent);
      if (intent.id !== paymentId || intent.status !== "succeeded" || intent.currency !== "eur" ||
          intent.amount !== amount || intent.amount_received !== amount || intent.amount_capturable !== 0 ||
          !["automatic", "automatic_async"].includes(String(intent.capture_method)) ||
          ref(intent.customer) !== ref(customer) || intent.on_behalf_of != null || intent.transfer_data != null ||
          !id(ref(intent.latest_charge), "ch"))
        return fail("payment_not_confirmed");
      const charge = await get("charges/" + ref(intent.latest_charge));
      live(charge);
      if (charge.id !== ref(intent.latest_charge) || ref(charge.payment_intent) !== intent.id ||
          ref(charge.customer) !== ref(customer) || charge.status !== "succeeded" ||
          charge.paid !== true || charge.captured !== true || charge.refunded !== false ||
          charge.disputed !== false || charge.amount !== amount || charge.amount_captured !== amount ||
          charge.amount_refunded !== 0 || charge.currency !== "eur" || !seconds(charge.created, now) || charge.on_behalf_of != null ||
          charge.transfer_data != null) return fail("payment_not_confirmed");
      return { intent, charge };
    };
    const common = {
      provider_account_id: config.expectedAccountId, provider_event_id: event.id,
      currency: "EUR" as const, livemode: event.livemode,
      provider_event_type: event.type, provider_event_created: event.created,
    };
    if (event.type !== "invoice.paid") {
      const session = await get("checkout/sessions/" + resource.id);
      live(session);
      if (session.id !== resource.id || session.mode !== "payment" || session.status !== "complete" ||
          session.payment_status !== "paid" || session.currency !== "eur" ||
          !money(session.amount_total) || session.subscription != null)
        return fail("payment_not_confirmed");
      const correlation = correlate(session.metadata);
      const funding = await funded(ref(session.payment_intent), session.amount_total, session.customer);
      return { ...common, ...correlation, kind: "initial_payment", checkout_id: String(session.id),
        provider_payment_id: String(funding.intent.id), amount_cents: session.amount_total,
        customer_id: typeof ref(session.customer) === "string" ? String(ref(session.customer)) : null,
        // Stable automatic Charge creation time, not event delivery, bank settlement or fiscal devengo.
        paid_at: new Date(Number(funding.charge.created) * 1000).toISOString() };
    }

    const invoice = await get("invoices/" + resource.id);
    live(invoice);
    const paidAt = obj(invoice.status_transitions).paid_at;
    const zeroTrialInvoice = invoice.amount_paid === 0 && invoice.total === 0;
    if (invoice.id !== resource.id || invoice.status !== "paid" || invoice.currency !== "eur" ||
        invoice.paid_out_of_band === true || (!zeroTrialInvoice && !money(invoice.amount_paid)) ||
        invoice.amount_paid !== invoice.total || invoice.amount_remaining !== 0 ||
        !seconds(paidAt, now) ||
        !["subscription_create", "subscription_cycle"].includes(String(invoice.billing_reason)))
      return fail("payment_not_confirmed");
    const subRef = ref(obj(obj(invoice.parent).subscription_details).subscription ?? invoice.subscription);
    if (!id(subRef, "sub")) return fail("unsupported_payment");
    const subscription = await get("subscriptions/" + subRef);
    live(subscription);
    // Stripe snapshots subscription metadata onto the invoice at creation.
    // A later subscription profile change must not reattribute a historical invoice.
    const correlation = correlate(obj(obj(invoice.parent).subscription_details).metadata);
    const currentCorrelation = correlate(subscription.metadata);
    if (currentCorrelation.request_id !== correlation.request_id ||
        currentCorrelation.user_id !== correlation.user_id ||
        currentCorrelation.company_id !== correlation.company_id)
      return fail("correlation_missing");
    const items = obj(subscription.items);
    const item = obj(Array.isArray(items.data) && items.data.length === 1 ? items.data[0] : null);
    const price = obj(item.price);
    const recurring = obj(price.recurring);
    const lines = obj(invoice.lines);
    const line = obj(Array.isArray(lines.data) && lines.data.length === 1 ? lines.data[0] : null);
    const linePrice = ref(obj(obj(line.pricing).price_details).price ?? line.price);
    const period = obj(line.period);
    const currentPeriodEnd = item.current_period_end ?? subscription.current_period_end;
    if (subscription.id !== subRef || !id(ref(subscription.customer), "cus") ||
        ref(invoice.customer) !== ref(subscription.customer) || !states.has(String(subscription.status)) ||
        items.has_more === true || item.quantity !== 1 || !id(price.id, "price") ||
        !seconds(currentPeriodEnd, now + 62 * 86400000) ||
        (zeroTrialInvoice ? !money(price.unit_amount) : price.unit_amount !== invoice.amount_paid) || price.currency !== "eur" ||
        recurring.interval !== "month" || recurring.interval_count !== 1 || recurring.usage_type === "metered" ||
        lines.has_more === true || line.quantity !== 1 || linePrice !== price.id ||
        !seconds(period.start, now) || !seconds(period.end, now + 62 * 86400000) ||
        period.end <= period.start || (!zeroTrialInvoice && (period.end - period.start < 27 * 86400 ||
        period.end - period.start > 32 * 86400)))
      return fail("payment_not_confirmed");
    if (zeroTrialInvoice) {
      const trialStart = subscription.trial_start;
      const trialEnd = subscription.trial_end;
      // A zero Stripe trial invoice creates no payment, licence or fiscal task.
      // Verify canonical subscription/snapshot/price/period first, then acknowledge
      // without inventing a PaymentIntent, receipt or charge.
      if (invoice.billing_reason !== "subscription_create" ||
          !seconds(trialStart, now) || !seconds(trialEnd, now + 32 * 86400000) ||
          trialEnd <= trialStart || trialEnd - trialStart > 32 * 86400 ||
          period.start !== trialStart || period.end !== trialEnd)
        return fail("unsupported_payment");
      return { kind: "ignored", provider_event_id: event.id };
    }
    if (!money(invoice.amount_paid)) return fail("payment_not_confirmed");
    const payments = await get("invoice_payments?invoice=" + resource.id + "&status=paid&limit=2");
    const payment = obj(Array.isArray(payments.data) && payments.data.length === 1 ? payments.data[0] : null);
    const detail = obj(payment.payment);
    if (payments.has_more !== false || payment.status !== "paid" || !id(payment.id, "inpay") ||
        ref(payment.invoice) !== invoice.id || payment.currency !== "eur" ||
        payment.amount_paid !== invoice.amount_paid || payment.amount_requested !== invoice.amount_paid ||
        detail.type !== "payment_intent" || !seconds(obj(payment.status_transitions).paid_at, now))
      return fail("unsupported_payment");
    live(payment);
    await funded(ref(detail.payment_intent), invoice.amount_paid, subscription.customer);
    return { ...common, ...correlation, kind: "subscription_invoice",
      provider_payment_id: String(invoice.id), invoice_id: String(invoice.id), subscription_id: subRef,
      amount_cents: invoice.amount_paid, paid_at: new Date(paidAt * 1000).toISOString(),
      invoice_period_start: period.start, invoice_period_end: period.end,
      billing_reason: invoice.billing_reason as "subscription_create" | "subscription_cycle",
      subscription_state: String(subscription.status), customer_id: String(ref(subscription.customer)),
      cancel_at_period_end: subscription.cancel_at_period_end === true,
      subscription_current_period_end: currentPeriodEnd, unit_amount: Number(price.unit_amount) };
  } catch (error) {
    if (error instanceof StripeReconciliationError) throw error;
    return fail("provider_unavailable");
  }
}

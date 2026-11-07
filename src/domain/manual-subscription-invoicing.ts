/**
 * Local, provider-neutral contract for ELEVADANCOR's manual TicketBAI workflow.
 *
 * This module never accepts payments, authorizes users, sends email, issues a
 * fiscal invoice or writes a database row. Call ONLY from a trusted server
 * after authenticating and reconciling a paid Stripe event. The adapter must
 * enforce unique providerPaymentId/requestId, RLS, authorization and atomic
 * compare-and-swap updates. No such adapter is connected as of 07/11/2026.
 */
export interface ConfirmedSubscriptionPayment {
  readonly providerEventId: string;
  /** Stable Stripe invoice (recurring) or checkout/payment ID (one-time). */
  readonly providerPaymentId: string;
  readonly requestId: string;
  readonly buyerCompanyId: string;
  readonly amountCents: number;
  readonly currency: "EUR";
  readonly paidAt: string;
}

export type ManualInvoiceStatus =
  | "awaiting_issue"
  | "awaiting_send"
  | "sent_reported"
  | "needs_review";

export interface ManualInvoiceDetails {
  /** Real fiscal number/series provided by GDTaller, not generated here. */
  readonly invoiceNumber: string;
  /** Reference entered from a real TicketBAI invoice; not authenticated here. */
  readonly ticketBaiReference: string;
  /** Private storage object key, never a public URL or an inline PDF. */
  readonly privatePdfKey: string;
  readonly issuedAt: string;
}

export interface ManualDispatchRecord {
  /** UUID of an operator's dispatch record; does NOT prove delivery. */
  readonly dispatchRecordId: string;
  readonly invoiceNumber: string;
  readonly sentAt: string;
}

export interface ManualInvoiceTask extends ConfirmedSubscriptionPayment {
  readonly status: ManualInvoiceStatus;
  readonly invoice?: ManualInvoiceDetails;
  readonly dispatch?: ManualDispatchRecord;
  readonly reviewReason?: ManualReviewReason;
}

export type ManualReviewReason =
  | "fiscal_issue_uncertain"
  | "customer_data_invalid"
  | "amount_mismatch"
  | "dispatch_failure";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRIPE_EVENT = /^evt_[A-Za-z0-9]{1,200}$/;
const STRIPE_PAYMENT = /^(?:in|pi|cs)_[A-Za-z0-9_]{1,200}$/;
const UTC_TIME = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?Z$/;

function timestamp(value: string): string {
  const parts = typeof value === "string" ? UTC_TIME.exec(value) : null;
  const date = parts ? new Date(value) : null;
  if (
    !parts || !date || !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== Number(parts[1]) ||
    date.getUTCMonth() + 1 !== Number(parts[2]) ||
    date.getUTCDate() !== Number(parts[3]) ||
    date.getUTCHours() !== Number(parts[4]) ||
    date.getUTCMinutes() !== Number(parts[5]) ||
    date.getUTCSeconds() !== Number(parts[6])
  ) {
    throw new Error("invalid_manual_invoice_timestamp");
  }
  return value;
}

function reference(value: string): string {
  if (
    typeof value !== "string" ||
    value.length > 200 ||
    !value.length ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new Error("invalid_manual_invoice_reference");
  return value;
}

function privatePdfKey(value: string, buyerCompanyId: string): string {
  if (
    typeof value !== "string" ||
    value.length > 250 ||
    !/^[A-Za-z0-9][A-Za-z0-9/_\-.]*\.pdf$/i.test(value) ||
    value.includes("//") ||
    value.split("/").some((part) => part === "." || part === "..") ||
    !value.startsWith("subscription-invoices/" + buyerCompanyId + "/")
  ) throw new Error("invalid_private_fiscal_pdf_key");
  return value;
}

function validatedPayment(payment: ConfirmedSubscriptionPayment): ConfirmedSubscriptionPayment {
  if (
    !payment ||
    !STRIPE_EVENT.test(payment.providerEventId) ||
    !STRIPE_PAYMENT.test(payment.providerPaymentId) ||
    !UUID.test(payment.requestId) ||
    !UUID.test(payment.buyerCompanyId) ||
    !Number.isSafeInteger(payment.amountCents) ||
    payment.amountCents <= 0 ||
    payment.currency !== "EUR"
  ) throw new Error("invalid_confirmed_subscription_payment");
  timestamp(payment.paidAt);
  return payment;
}

/**
 * Pure reducer; a duplicate event for the SAME payment must not create a task.
 * Distinct Stripe events can describe the same paid invoice, so event ID alone
 * is not an idempotency key. Persist uniqueness and snapshots transactionally.
 */
export function recordConfirmedManualPayment(
  current: ManualInvoiceTask | null,
  confirmation: ConfirmedSubscriptionPayment,
): ManualInvoiceTask {
  const payment = validatedPayment(confirmation);
  if (!current) return { ...payment, status: "awaiting_issue" };
  if (
    current.providerPaymentId !== payment.providerPaymentId ||
    current.requestId !== payment.requestId ||
    current.buyerCompanyId !== payment.buyerCompanyId ||
    current.amountCents !== payment.amountCents ||
    current.currency !== payment.currency ||
    current.paidAt !== payment.paidAt
  ) throw new Error("conflicting_confirmed_subscription_payment");
  return current;
}

export interface ManualIssueRecord extends ManualInvoiceDetails {
  readonly requestId: string;
  readonly providerPaymentId: string;
}

/** An authorized operator must enter genuine GDTaller/TicketBAI details. */
export function recordManualInvoiceIssued(
  task: ManualInvoiceTask,
  issue: ManualIssueRecord,
): ManualInvoiceTask {
  if (
    !issue ||
    task.requestId !== issue.requestId ||
    task.providerPaymentId !== issue.providerPaymentId
  ) throw new Error("manual_invoice_scope_mismatch");
  const invoice: ManualInvoiceDetails = {
    invoiceNumber: reference(issue.invoiceNumber),
    ticketBaiReference: reference(issue.ticketBaiReference),
    privatePdfKey: privatePdfKey(issue.privatePdfKey, task.buyerCompanyId),
    issuedAt: timestamp(issue.issuedAt),
  };
  if (Date.parse(invoice.issuedAt) < Date.parse(task.paidAt)) {
    throw new Error("invalid_manual_invoice_timestamp");
  }
  if (task.status === "awaiting_send" || task.status === "sent_reported") {
    if (
      !task.invoice ||
      task.invoice.invoiceNumber !== invoice.invoiceNumber ||
      task.invoice.ticketBaiReference !== invoice.ticketBaiReference ||
      task.invoice.privatePdfKey !== invoice.privatePdfKey ||
      task.invoice.issuedAt !== invoice.issuedAt
    ) throw new Error("conflicting_manual_invoice_issue");
    return task;
  }
  if (task.status !== "awaiting_issue") throw new Error("invalid_manual_invoice_transition");
  return { ...task, status: "awaiting_send", invoice };
}

export interface ManualDispatchInput extends ManualDispatchRecord {
  readonly requestId: string;
  readonly providerPaymentId: string;
}

/**
 * Records a HUMAN assertion that the PDF was sent. This is not an electronic
 * delivery receipt and must not be labelled 'delivered' in the app.
 */
export function recordManualInvoiceSent(
  task: ManualInvoiceTask,
  input: ManualDispatchInput,
): ManualInvoiceTask {
  if (
    !input ||
    task.requestId !== input.requestId ||
    task.providerPaymentId !== input.providerPaymentId ||
    !task.invoice ||
    task.invoice.invoiceNumber !== input.invoiceNumber
  ) throw new Error("manual_invoice_scope_mismatch");
  if (!UUID.test(input.dispatchRecordId)) throw new Error("invalid_manual_dispatch_record");
  const dispatch: ManualDispatchRecord = {
    dispatchRecordId: input.dispatchRecordId,
    invoiceNumber: reference(input.invoiceNumber),
    sentAt: timestamp(input.sentAt),
  };
  if (Date.parse(dispatch.sentAt) < Date.parse(task.invoice.issuedAt)) {
    throw new Error("invalid_manual_invoice_timestamp");
  }
  if (task.status === "sent_reported") {
    if (
      !task.dispatch ||
      task.dispatch.dispatchRecordId !== dispatch.dispatchRecordId ||
      task.dispatch.invoiceNumber !== dispatch.invoiceNumber ||
      task.dispatch.sentAt !== dispatch.sentAt
    ) throw new Error("conflicting_manual_invoice_dispatch");
    return task;
  }
  if (task.status !== "awaiting_send") throw new Error("invalid_manual_invoice_transition");
  return { ...task, status: "sent_reported", dispatch };
}

/** Fail closed on unresolved/manual errors; the record is not auto-reopened. */
export function requireManualInvoiceReview(
  task: ManualInvoiceTask,
  reason: ManualReviewReason,
): ManualInvoiceTask {
  if (
    !["fiscal_issue_uncertain", "customer_data_invalid", "amount_mismatch", "dispatch_failure"].includes(reason)
  ) throw new Error("invalid_manual_invoice_review_reason");
  if (task.status === "needs_review") {
    if (task.reviewReason !== reason) throw new Error("conflicting_manual_invoice_review");
    return task;
  }
  if (task.status === "sent_reported") throw new Error("invalid_manual_invoice_transition");
  return { ...task, status: "needs_review", reviewReason: reason };
}

/**
 * Internal 24–48h operational reminder only; not a legal invoice deadline.
 * No network calls, timers, notifications or automatic retry are performed.
 */
export function manualInvoiceNeedsAttention(
  task: ManualInvoiceTask,
  nowMs: number,
  operationalHours = 48,
): boolean {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isSafeInteger(operationalHours) ||
    operationalHours < 1 ||
    operationalHours > 168
  ) throw new Error("invalid_manual_invoice_reminder");
  return (
    (task.status === "awaiting_issue" || task.status === "awaiting_send") &&
    nowMs - Date.parse(task.paidAt) >= operationalHours * 3600000
  );
}

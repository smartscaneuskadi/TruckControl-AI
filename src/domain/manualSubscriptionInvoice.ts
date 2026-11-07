/**
 * Pure, offline-only validation for the proposed manual GDTaller/TicketBAI
 * subscription invoicing workflow. Not a payment, fiscal or email integration.
 */
export type ManualInvoiceStatus =
  | "pending_manual_issue"
  | "fiscal_issued"
  | "delivery_pending"
  | "delivered"
  | "needs_review"
  | "delivery_failed"
  | "refund_review";

export type ManualInvoiceEvidence = {
  fiscalNumber?: string;
  fiscalReference?: string;
  pdfStorageKey?: string;
  deliveryRecipient?: string;
  deliveryConfirmedAt?: string;
};

const allowed: Record<ManualInvoiceStatus, readonly ManualInvoiceStatus[]> = {
  pending_manual_issue: ["fiscal_issued", "needs_review", "refund_review"],
  fiscal_issued: ["delivery_pending", "needs_review", "refund_review"],
  delivery_pending: ["delivered", "delivery_failed", "needs_review", "refund_review"],
  delivered: ["refund_review"],
  needs_review: ["pending_manual_issue", "fiscal_issued", "delivery_pending", "refund_review"],
  delivery_failed: ["delivery_pending", "needs_review", "refund_review"],
  refund_review: ["needs_review"],
};

function nonempty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Caller must additionally enforce actor authorization, tenant RLS and persistence locks. */
export function manualInvoiceTransitionAllowed(
  from: ManualInvoiceStatus,
  to: ManualInvoiceStatus,
  evidence: ManualInvoiceEvidence,
): boolean {
  if (!allowed[from]?.includes(to)) return false;
  const hasFiscalEvidence =
    nonempty(evidence.fiscalNumber) &&
    nonempty(evidence.fiscalReference) &&
    nonempty(evidence.pdfStorageKey);
  if (to === "fiscal_issued" || to === "delivery_pending" || to === "delivered") {
    if (!hasFiscalEvidence) return false;
  }
  if (to === "delivered") {
    if (!nonempty(evidence.deliveryRecipient) || !nonempty(evidence.deliveryConfirmedAt)) {
      return false;
    }
    if (Number.isNaN(Date.parse(evidence.deliveryConfirmedAt!))) return false;
  }
  return true;
}

/** Stable idempotency identity; provider signatures must be verified before invoking. */
export function manualInvoicePaymentKey(
  provider: string,
  accountId: string,
  paymentId: string,
): string {
  if (![provider, accountId, paymentId].every(nonempty)) {
    throw new Error("Missing verified payment identity");
  }
  return JSON.stringify([provider, accountId, paymentId]);
}

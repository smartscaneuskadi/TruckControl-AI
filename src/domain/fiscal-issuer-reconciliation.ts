/**
 * Provider-neutral preparation for the subscription seller's fiscal issuer.
 *
 * No issuer is connected. These pure state transitions do NOT send invoices,
 * prove tax compliance, confer access, or enable checkout. Persist transitions
 * atomically and reconcile against the chosen provider before wiring an adapter.
 */
export type FiscalAttemptStatus =
  | "ready"
  | "submitted"
  | "unresolved"
  | "issued"
  | "delivered"
  | "manual_review";

export interface FiscalAttempt {
  readonly requestId: string;
  /** SHA-256 of the canonical, approved fiscal document request. No PII here. */
  readonly documentDigest: string;
  readonly status: FiscalAttemptStatus;
  /** Provider-side operation reference, NOT a Stripe payment identifier. */
  readonly providerReference?: string;
  /** Fiscal invoice identifier from the real issuer, never allocated here. */
  readonly invoiceReference?: string;
  /** Independent proof of delivery from the connected service. */
  readonly deliveryReference?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[0-9a-f]{64}$/;
/** Accept provider-specific invoice formats, but not whitespace-only or controls. */
function reference(value: string): string {
  if (
    typeof value !== "string" ||
    value.length > 200 ||
    !value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error("invalid_fiscal_reference");
  }
  return value;
}

export function newFiscalAttempt(
  requestId: string,
  documentDigest: string,
): FiscalAttempt {
  if (!UUID.test(requestId) || !DIGEST.test(documentDigest)) {
    throw new Error("invalid_fiscal_request");
  }
  return { requestId, documentDigest, status: "ready" };
}

/**
 * Only the first atomic transition to submitted authorizes one external call.
 * Replaying or timing out NEVER authorizes an automatic second call. Callers
 * must persist a compare-and-swap transition before acting on shouldSubmit.
 */
export function beginFiscalIssue(attempt: FiscalAttempt): {
  attempt: FiscalAttempt;
  shouldSubmit: boolean;
} {
  if (attempt.status === "ready") {
    return { attempt: { ...attempt, status: "submitted" }, shouldSubmit: true };
  }
  return { attempt, shouldSubmit: false };
}

/** On uncertain delivery to the issuer: reconcile externally; NEVER retry issuance. */
export function markFiscalIssueUncertain(attempt: FiscalAttempt): FiscalAttempt {
  if (attempt.status === "unresolved") return attempt;
  if (attempt.status !== "submitted") throw new Error("invalid_fiscal_transition");
  return { ...attempt, status: "unresolved" };
}

/**
 * Record a provider-confirmed invoice after submission or reconciliation.
 * Duplicate identical provider callbacks are idempotent; conflicting invoice
 * references require manual investigation. This function does not verify the
 * authenticity of a provider response; the future adapter must do so.
 */
export function recordFiscalIssue(
  attempt: FiscalAttempt,
  providerReference: string,
  invoiceReference: string,
): FiscalAttempt {
  const provider = reference(providerReference);
  const invoice = reference(invoiceReference);
  if (attempt.status === "issued" || attempt.status === "delivered") {
    if (
      attempt.providerReference !== provider ||
      attempt.invoiceReference !== invoice
    ) throw new Error("conflicting_fiscal_confirmation");
    return attempt;
  }
  if (attempt.status !== "submitted" && attempt.status !== "unresolved") {
    throw new Error("invalid_fiscal_transition");
  }
  return {
    ...attempt,
    status: "issued",
    providerReference: provider,
    invoiceReference: invoice,
  };
}

/** Delivery requires a separate confirmed receipt, not a payment success URL. */
export function recordFiscalDelivery(
  attempt: FiscalAttempt,
  deliveryReference: string,
): FiscalAttempt {
  const delivery = reference(deliveryReference);
  if (attempt.status === "delivered") {
    if (attempt.deliveryReference !== delivery) {
      throw new Error("conflicting_fiscal_delivery");
    }
    return attempt;
  }
  if (
    attempt.status !== "issued" ||
    !attempt.invoiceReference ||
    !attempt.providerReference
  ) throw new Error("invalid_fiscal_transition");
  return { ...attempt, status: "delivered", deliveryReference: delivery };
}

export function requireManualFiscalReview(attempt: FiscalAttempt): FiscalAttempt {
  if (attempt.status === "manual_review") return attempt;
  if (attempt.status !== "submitted" && attempt.status !== "unresolved") {
    throw new Error("invalid_fiscal_transition");
  }
  return { ...attempt, status: "manual_review" };
}

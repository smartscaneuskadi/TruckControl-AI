/**
 * Release 1.0 fail-closed gate for subscription checkout.
 *
 * The environment switch is an *approval*, not proof that the seller's
 * fiscal issuer can issue, sign (where applicable), and deliver invoices.
 *
 * This gate describes automatic issuance. The separate GDTaller manual
 * workflow uses manual-checkout-readiness.ts and native merchant approval.
 * Keep automatic issuance false until the
 * selected provider's real integration, idempotency and delivery tests have
 * passed, and the legal/owner acceptance is documented.
 *
 * The next implementation must replace this function with a real capability
 * supplied by the native integration, not another configurable boolean.
 * Never infer readiness from Stripe credentials or a browser-provided flag.
 */
export function nativeSubscriptionFiscalIssuerAvailable(): boolean {
  return false;
}

/** Production entrypoints must use this instead of the environment flag alone. */
export function subscriptionFiscalCheckoutAllowed(
  verifiedEnvironmentFlag: string | undefined,
): boolean {
  return (
    verifiedEnvironmentFlag === "true" &&
    nativeSubscriptionFiscalIssuerAvailable()
  );
}

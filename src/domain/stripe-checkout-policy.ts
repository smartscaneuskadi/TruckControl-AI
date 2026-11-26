import type { Catalog } from "./subscriptions";

/**
 * Product-owner release fence, independent of remote catalog flags.
 * 2026-11-22 decision: FULL is Root-only and subscription/Stripe checkout
 * remains manual. Keep the existing provider integration for a future
 * explicitly approved release; a stale/misconfigured catalog alone must
 * never enable paid checkout from a customer account.
 */
export function allowAutomaticStripeCheckout(
  _catalog: Pick<Catalog, "payments_enabled" | "prices_are_examples">,
): boolean {
  return false;
}

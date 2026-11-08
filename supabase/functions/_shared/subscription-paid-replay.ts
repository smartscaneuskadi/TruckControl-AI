import { canonicalStripeEnvelope, stripeId } from "./stripe-provider-reader.ts";
import { type StripeReconciliationConfig } from "./subscription-stripe-reconciliation.ts";

export interface KnownStripePaymentEvent {
  id: string; type: string; created: number; resource_id: string;
}
const paidTypes = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "invoice.paid"]);

/**
 * ACK a known immutable payment only after the usual HMAC and canonical account/
 * event checks. SQL must recompute and match the ORIGINAL stored proof digest.
 * No funded() bypass for a new event, no payment write and no licence effect.
 */
export async function knownStripePaymentReplay(
  raw: string, signature: string | null, config: StripeReconciliationConfig,
  lookup: (account: string, mode: "test" | "live", event: KnownStripePaymentEvent) => Promise<boolean>,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const envelope = await canonicalStripeEnvelope(raw, signature, config, paidTypes, fetcher);
  if (envelope.kind === "ignored") return false;
  const { event, snapshot } = envelope;
  if (event.type === "invoice.paid" ? !stripeId(snapshot.id, "in") :
      typeof snapshot.id !== "string" || !/^cs_[A-Za-z0-9_]{1,200}$/.test(snapshot.id))
    return false;
  return lookup(config.expectedAccountId, config.mode, {
    id: String(event.id), type: String(event.type), created: Number(event.created), resource_id: String(snapshot.id),
  });
}

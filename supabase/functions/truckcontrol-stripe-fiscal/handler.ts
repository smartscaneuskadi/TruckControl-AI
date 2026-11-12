import {
  reconcileStripeManualInvoicePayment, StripeReconciliationError,
  type StripeReconciliationConfig, type ReconciledStripePayment,
} from "../_shared/subscription-stripe-reconciliation.ts";
import { canonicalStripeEnvelope, StripeProviderBodyLimit as BodyLimit, readStripeRawBody as rawBody } from "../_shared/stripe-provider-reader.ts";
import { knownStripePaymentReplay, type KnownStripePaymentEvent } from "../_shared/subscription-paid-replay.ts";

export interface ManualStripePaymentGateway {
  /** The implementation MUST call a single transactional RPC, never separate billing/intake writes. */
  applyPayment(payment: Exclude<ReconciledStripePayment, { kind: "ignored" }>): Promise<void>;
  knownPaymentEvent?(account: string, mode: "test" | "live", event: KnownStripePaymentEvent): Promise<boolean>;
}
export interface ManualStripeWebhookConfig extends StripeReconciliationConfig {
  enabled: boolean;
  schemaAccepted: boolean;
  /** Dedicated live merchant, only for read-only delivery checks on the production project. */
  deliveryCheckAccountId?: string;
  /** Separate64 capability; false unless its read-only proof lookup passed acceptance. */
  knownPaymentEvents?: boolean;
}
/** Provider webhook only. Browser JWTs, redirect returns and client metadata confer no capability. */
export function createManualStripeWebhookHandler(
  gateway: ManualStripePaymentGateway,
  config: ManualStripeWebhookConfig,
  fetcher: typeof fetch = fetch,
) {
  return async (request: Request): Promise<Response> => {
    const respond = (body: unknown, status: number) => new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
    });
    if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405);
    if (request.headers.has("origin")) return respond({ error: "provider_webhook_only" }, 403);
    const deliveryCheck = new URL(request.url).searchParams.get("verify") === "delivery";
    if (deliveryCheck ? !config.deliveryCheckAccountId : !config.enabled || !config.schemaAccepted)
      return respond({ error: "manual_stripe_pipeline_disabled" }, 503);
    if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json")
      return respond({ error: "invalid_content_type" }, 415);
    try {
      const raw = await rawBody(request);
      if (deliveryCheck) {
        const envelope = await canonicalStripeEnvelope(raw, request.headers.get("stripe-signature"),
          { ...config, expectedAccountId: config.deliveryCheckAccountId!, mode: "live" },
          new Set(["product.created", "product.updated"]), fetcher);
        if (envelope.kind === "ignored") return respond({ error: "unexpected_delivery_check_event" }, 409);
        const product = envelope.snapshot;
        if (product.id !== "prod_TruckControlDeliveryCheck" || product.object !== "product" ||
            product.active !== false || product.default_price != null)
          return respond({ ignored: true }, 200);
        // Only the canonical provider event ID is retained as an operational receipt.
        console.info("truckcontrol_stripe_delivery_verified", envelope.event.id);
        return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      }
      if (config.knownPaymentEvents) {
        if (!gateway.knownPaymentEvent) throw Error("subscription_payment_replay_unavailable");
        if (await knownStripePaymentReplay(raw, request.headers.get("stripe-signature"), config,
          (account, mode, event) => gateway.knownPaymentEvent!(account, mode, event), fetcher))
          return respond({ received: true }, 200);
      }
      const payment = await reconcileStripeManualInvoicePayment(
        raw, request.headers.get("stripe-signature"), config, fetcher,
      );
      if (payment.kind === "ignored") return respond({ received: true }, 200);
      await gateway.applyPayment(payment);
      // Acknowledge only after durable atomic persistence. No task/customer data leaves the backend.
      return respond({ received: true }, 200);
    } catch (error) {
      if (error instanceof BodyLimit) return respond({ error: "request_too_large" }, 413);
      if (error instanceof StripeReconciliationError &&
          ["invalid_signature", "invalid_event", "provider_identity_mismatch",
           "payment_not_confirmed", "unsupported_payment", "correlation_missing"].includes(error.code))
        return respond({ error: error.code }, 400);
      // Provider/DB failure remains retryable. Never disclose raw provider or database messages.
      return respond({ error: "manual_stripe_pipeline_unavailable" }, 503);
    }
  };
}

import {
  reconcileStripeManualInvoicePayment, StripeReconciliationError,
  type StripeReconciliationConfig, type ReconciledStripePayment,
} from "../_shared/subscription-stripe-reconciliation.ts";

export interface ManualStripePaymentGateway {
  /** The implementation MUST call a single transactional RPC, never separate billing/intake writes. */
  applyPayment(payment: Exclude<ReconciledStripePayment, { kind: "ignored" }>): Promise<void>;
}
export interface ManualStripeWebhookConfig extends StripeReconciliationConfig {
  enabled: boolean;
  schemaAccepted: boolean;
}
class BodyLimit extends Error {}
async function rawBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 65536) { await reader.cancel(); throw new BodyLimit(); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
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
    if (!config.enabled || !config.schemaAccepted)
      return respond({ error: "manual_stripe_pipeline_disabled" }, 503);
    if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json")
      return respond({ error: "invalid_content_type" }, 415);
    try {
      const raw = await rawBody(request);
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

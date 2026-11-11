import { StripeReconciliationError, type StripeReconciliationConfig } from "../_shared/subscription-stripe-reconciliation.ts";
import { reconcileStripeFinancialIncident, StripeFinancialIncidentError, type StripeFinancialIncident } from "../_shared/subscription-financial-incidents.ts";
import { readStripeRawBody, StripeProviderBodyLimit } from "../_shared/stripe-provider-reader.ts";

export interface StripeIncidentGateway {
  record(account: string, mode: "test" | "live", data: StripeFinancialIncident): Promise<void>;
}
export interface StripeIncidentConfig extends StripeReconciliationConfig {
  enabled: boolean;
  schemaAccepted: boolean;
}
/** Read-only Stripe reconciliation -> durable observation, never money movement. */
export function createStripeIncidentHandler(
  gateway: StripeIncidentGateway, config: StripeIncidentConfig, fetcher: typeof fetch = fetch,
) {
  return async (request: Request): Promise<Response> => {
    const respond = (body: unknown, status: number) => new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
    });
    if (request.method !== "POST") return respond({ error: "method_not_allowed" }, 405);
    if (request.headers.has("origin")) return respond({ error: "provider_webhook_only" }, 403);
    if (!config.enabled || !config.schemaAccepted) return respond({ error: "subscription_incidents_disabled" }, 503);
    if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json")
      return respond({ error: "invalid_content_type" }, 415);
    try {
      const incident = await reconcileStripeFinancialIncident(
        await readStripeRawBody(request), request.headers.get("stripe-signature"), config, fetcher,
      );
      if (incident.kind !== "ignored") await gateway.record(incident.account, incident.mode, incident.data);
      return respond({ received: true }, 200);
    } catch (error) {
      if (error instanceof StripeProviderBodyLimit) return respond({ error: "request_too_large" }, 413);
      if (error instanceof StripeFinancialIncidentError)
        return respond({ error: error.code }, error.code === "financial_mapping_unavailable" ? 503 : 400);
      if (error instanceof StripeReconciliationError && [
        "invalid_signature", "invalid_event", "provider_identity_mismatch",
      ].includes(error.code)) return respond({ error: error.code }, 400);
      return respond({ error: "subscription_incident_pipeline_unavailable" }, 503);
    }
  };
}

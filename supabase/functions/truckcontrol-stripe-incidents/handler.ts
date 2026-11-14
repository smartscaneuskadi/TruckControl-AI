import { StripeReconciliationError, type StripeReconciliationConfig } from "../_shared/subscription-stripe-reconciliation.ts";
import { reconcileStripeFinancialIncident, StripeFinancialIncidentError, type StripeFinancialIncident } from "../_shared/subscription-financial-incidents.ts";
import { readStripeRawBody, StripeProviderBodyLimit } from "../_shared/stripe-provider-reader.ts";
import { reconcileStripeOwnedCheckout, type StripeOwnedCheckout } from "../_shared/subscription-unlinked-ownership.ts";
import type { IncidentIngestResult } from "../_shared/subscription-unlinked-persistence.ts";
import { reconcileStripeRiskSignal, stripeRiskSignalTypes, StripeRiskSignalError,
  type StripeRiskSignal } from "../_shared/subscription-risk-signals.ts";

export interface StripeIncidentGateway {
  record(account: string, mode: "test" | "live", data: StripeFinancialIncident): Promise<void>;
  ingest?(account: string, mode: "test" | "live", data: StripeFinancialIncident, binding: StripeOwnedCheckout | null): Promise<IncidentIngestResult>;
  riskSignal?(account: string, mode: "test" | "live", data: StripeRiskSignal): Promise<void>;
}
export interface StripeIncidentConfig extends StripeReconciliationConfig {
  enabled: boolean;
  schemaAccepted: boolean;
  /** Separately accepted additive quarantine schema; OFF by default. */
  unlinkedReview?: boolean;
  /** Independent schema/provider acceptance; omitted means OFF. */
  riskSignalsAccepted?: boolean;
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
      const raw = await readStripeRawBody(request), signature = request.headers.get("stripe-signature");
      const deadline = AbortSignal.timeout(25000);
      const boundedFetch: typeof fetch = (input, init) => fetcher(input, {
        ...init, signal: AbortSignal.any([deadline, ...(init?.signal ? [init.signal] : [])]),
      });
      // This untrusted discriminator selects a verifier only. It grants no authority:
      // the selected path still checks HMAC, canonical Event, account, mode and graph.
      const type = (JSON.parse(raw) as { type?: unknown })?.type;
      if (typeof type === "string" && stripeRiskSignalTypes.has(type)) {
        if (!config.riskSignalsAccepted || !gateway.riskSignal)
          return respond({ error: "subscription_risk_signals_disabled" }, 503);
        const signal = await reconcileStripeRiskSignal(raw, signature, config, boundedFetch);
        if (signal.kind !== "risk_signal") throw Error("subscription_risk_signal_unavailable");
        await gateway.riskSignal(signal.account, signal.mode, signal.data);
        return respond({ received: true }, 200);
      }
      const incident = await reconcileStripeFinancialIncident(
        raw, signature, config, boundedFetch,
      );
      if (incident.kind !== "ignored") {
        if (!config.unlinkedReview) await gateway.record(incident.account, incident.mode, incident.data);
        else {
          if (!gateway.ingest) throw Error("subscription_incident_ingest_unavailable");
          let result = await gateway.ingest(incident.account, incident.mode, incident.data, null);
          if (result === "ownership_required") {
            const binding = await reconcileStripeOwnedCheckout(raw, signature, config, incident.data, boundedFetch);
            result = await gateway.ingest(incident.account, incident.mode, incident.data, binding);
          }
          if (result !== "recorded") throw Error("subscription_incident_ingest_unavailable");
        }
      }
      return respond({ received: true }, 200);
    } catch (error) {
      if (error instanceof StripeProviderBodyLimit) return respond({ error: "request_too_large" }, 413);
      if (error instanceof StripeFinancialIncidentError)
        return respond({ error: error.code }, error.code === "financial_mapping_unavailable" ? 503 : 400);
      if (error instanceof StripeRiskSignalError)
        return respond({ error: error.code }, error.code === "risk_signal_mapping_unavailable" ? 503 : 400);
      if (error instanceof StripeReconciliationError && [
        "invalid_signature", "invalid_event", "provider_identity_mismatch",
      ].includes(error.code)) return respond({ error: error.code }, 400);
      return respond({ error: "subscription_incident_pipeline_unavailable" }, 503);
    }
  };
}

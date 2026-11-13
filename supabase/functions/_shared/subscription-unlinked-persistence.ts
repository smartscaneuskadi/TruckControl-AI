import { isUuid } from "./invoice.ts";
import type { StripeFinancialIncident } from "./subscription-financial-incidents.ts";
import type { FinancialRpc } from "./subscription-financial-persistence.ts";
import type { StripeOwnedCheckout } from "./subscription-unlinked-ownership.ts";

export type IncidentIngestResult = "recorded" | "ownership_required";
export async function ingestStripeFinancialIncident(
  rpc: FinancialRpc, account: string, mode: "test" | "live", data: StripeFinancialIncident,
  binding: StripeOwnedCheckout | null,
): Promise<IncidentIngestResult> {
  try {
    const result = await rpc("tc_subscription_incident_ingest", {
      p_account: account, p_mode: mode, p_data: data, p_binding: binding,
    });
    const value = result.data as Record<string, unknown> | null;
    if (result.error || !value || value.contract !== "subscription-incident-ingest-v1") throw Error();
    if (value.recorded === false && value.ownership_required === true && binding === null)
      return "ownership_required";
    if (value.recorded !== true || !["linked", "quarantined"].includes(String(value.target)) ||
        typeof value.duplicate !== "boolean" || !isUuid(value.case_id)) throw Error();
    return "recorded";
  } catch { throw Error("subscription_incident_persistence_unavailable"); }
}

import { isUuid } from "./invoice.ts";
import type { StripeFinancialIncident } from "./subscription-financial-incidents.ts";
import type { KnownStripePaymentEvent } from "./subscription-paid-replay.ts";

type Result = { data: unknown; error: unknown };
export type FinancialRpc = (name: string, parameters: Record<string, unknown>) => PromiseLike<Result>;
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export async function persistStripeFinancialIncident(
  rpc: FinancialRpc, account: string, mode: "test" | "live", data: StripeFinancialIncident,
): Promise<void> {
  try {
  const result = await rpc("tc_manual_subscription_record_incident", {
    p_account: account, p_mode: mode, p_data: data,
  });
  const value = obj(result.data);
  if (result.error || value.contract !== "subscription-financial-incidents-record-v1" ||
      value.received !== true || typeof value.duplicate !== "boolean" || !isUuid(value.case_id))
    throw Error("subscription_incident_persistence_unavailable");
  } catch { throw Error("subscription_incident_persistence_unavailable"); }
}
export async function lookupKnownStripePayment(
  rpc: FinancialRpc, account: string, mode: "test" | "live", event: KnownStripePaymentEvent,
): Promise<boolean> {
  try {
  const result = await rpc("tc_manual_subscription_known_payment_event", {
    p_account: account, p_mode: mode, p_event: event,
  });
  const value = obj(result.data);
  if (result.error || value.contract !== "manual-stripe-known-payment-event-v1" || typeof value.known !== "boolean")
    throw Error("subscription_payment_replay_unavailable");
  return value.known;
  } catch { throw Error("subscription_payment_replay_unavailable"); }
}

import { isUuid } from "./invoice.ts";
import { stripeObject as obj } from "./stripe-provider-reader.ts";
import type { FinancialRpc } from "./subscription-financial-persistence.ts";
import type { StripeRiskSignal } from "./subscription-risk-signals.ts";

/** No successful ACK until the native transaction confirms durable append/replay. */
export async function persistStripeRiskSignal(
  rpc: FinancialRpc,
  account: string,
  mode: "test" | "live",
  data: StripeRiskSignal,
): Promise<void> {
  try {
    const result = await rpc("tc_subscription_risk_record", {
      p_account: account,
      p_mode: mode,
      p_data: data,
    });
    const value = obj(result.data);
    if (
      result.error ||
      value.contract !== "subscription-risk-record-v1" ||
      value.received !== true ||
      typeof value.duplicate !== "boolean" ||
      !isUuid(value.case_id)
    )
      throw Error();
  } catch {
    throw Error("subscription_risk_persistence_unavailable");
  }
}

import { isUuid } from "./invoice.ts";
import type { ReconciledStripePayment } from "./subscription-stripe-reconciliation.ts";

export type ManualStripeRpc = (
  name: string, parameters: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>;

export async function persistManualStripePayment(
  rpc: ManualStripeRpc,
  payment: Exclude<ReconciledStripePayment, { kind: "ignored" }>,
): Promise<void> {
  try {
    const { kind, provider_account_id, ...data } = payment;
    const response = await rpc("tc_manual_subscription_apply_payment", {
      p_kind: kind, p_account: provider_account_id, p_data: data,
    });
    const receipt = response.data && typeof response.data === "object" && !Array.isArray(response.data)
      ? response.data as Record<string, unknown> : {};
    if (response.error || receipt.contract !== "manual-stripe-payment-bridge-v1" ||
        receipt.received !== true || typeof receipt.duplicate !== "boolean" || !isUuid(receipt.task_id))
      throw new Error("atomic_manual_stripe_unavailable");
  } catch {
    throw new Error("atomic_manual_stripe_unavailable");
  }
}

/** Paid provider events belong exclusively to the transactional fiscal bridge.
 * This native lock has no environment override. Isolated handler factories keep
 * their existing behavior; production entrypoints must always use this wrapper.
 */
export function legacyPaidWebhookMutationsAvailable(): boolean {
  return false;
}
type Channel = "one_time" | "recurring";
type Invoke = (action: string, data: Record<string, unknown>) => Promise<unknown>;

export function createLegacyStripeServer(channel: Channel, invoke: Invoke) {
  return async function server<T>(action: string, data: Record<string, unknown>): Promise<T> {
    if (channel !== "one_time" && channel !== "recurring")
      throw new Error("legacy_billing_gateway_unavailable");
    const paidMutation = channel === "one_time"
      ? action === "payment_event"
      : action === "event" && (data.invoice_paid !== false || data.event_type === "invoice.paid");
    if (paidMutation && !legacyPaidWebhookMutationsAvailable())
      throw new Error("legacy_paid_webhook_disabled");
    return await invoke(action, data) as T;
  };
}

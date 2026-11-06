import { describe, expect, it, vi } from "vitest";
import { createBillingHandler } from "../../../supabase/functions/truckcontrol-billing/handler.ts";
import { createRecurringHandler } from "../../../supabase/functions/truckcontrol-subscriptions/handler.ts";
import type { RecurringGateway } from "../../../supabase/functions/truckcontrol-subscriptions/handler.ts";

const origin = "https://billing.example";
const userId = "b1000000-0000-4000-8000-000000000001";
const requestId = "b2000000-0000-4000-8000-000000000001";
const request = (body: Record<string, unknown>) =>
  new Request(`${origin}/billing`, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer synthetic-session",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
function fixture() {
  const calls: { action: string; data: Record<string, unknown> }[] = [];
  const gateway: RecurringGateway = {
    authenticate: vi.fn(async () => ({ id: userId })),
    async server<T>(action: string, data: Record<string, unknown>): Promise<T> {
      calls.push({ action, data });
      return (
        action === "status"
          ? {
              subscription: null,
              invoices: [],
              invoice_delivery_ready: true, // A stale/untrusted status must not bypass the release gate.
            }
          : { user_id: userId, provider_id: "sub_synthetic" }
      ) as T;
    },
  };
  return { ...gateway, calls };
}
describe("emisión fiscal y entrega automática antes de nuevas compras", () => {
  it.each([undefined, false])(
    "bloquea el cobro único sin emisión verificada (%s), aunque el cliente la declare lista",
    async (invoicingVerified) => {
      const gateway = fixture(),
        fetcher = vi.fn<typeof fetch>();
      const response = await createBillingHandler(
        gateway,
        {
          appOrigin: origin,
          stripeKey: "synthetic-key",
          invoicingVerified,
        },
        fetcher,
      )(
        request({
          action: "checkout",
          request_id: requestId,
          invoicingVerified: true,
        }),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "automatic_invoicing_unavailable",
      });
      expect(gateway.calls).toHaveLength(0);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, false])(
    "bloquea la compra recurrente y conserva explícito su estado fiscal (%s)",
    async (invoicingVerified) => {
      const gateway = fixture(),
        fetcher = vi.fn<typeof fetch>();
      const handle = createRecurringHandler(
        gateway,
        {
          appOrigin: origin,
          enabled: true,
          stripeKey: "synthetic-key",
          termsVersion: "synthetic-v1",
          termsUrl: `${origin}/terms`,
          invoicingVerified,
        },
        fetcher,
      );
      const state = await (
        await handle(request({ action: "status", invoicingVerified: true }))
      ).json();
      expect(state.configured).toBe(false);
      expect(state.invoice_delivery_ready).toBe(false);
      expect(state.management_available).toBe(true);
      gateway.calls.length = 0;
      expect(
        (
          await handle(
            request({
              action: "checkout",
              request_id: requestId,
              terms_accepted: true,
              terms_version: "synthetic-v1",
              invoice_delivery_ready: true,
            }),
          )
        ).status,
      ).toBe(503);
      expect(gateway.calls).toHaveLength(0);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("permite cancelar una renovación aunque la emisión fiscal no esté disponible", async () => {
    const gateway = fixture();
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ id: "sub_synthetic", cancel_at_period_end: true }),
    );
    const handle = createRecurringHandler(
      gateway,
      { appOrigin: origin, stripeKey: "synthetic-key" },
      fetcher,
    );
    expect(
      (await handle(request({ action: "resume", operation_id: requestId })))
        .status,
    ).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      (await handle(request({ action: "cancel", operation_id: requestId })))
        .status,
    ).toBe(200);
    expect(gateway.calls.map((c) => c.action)).toEqual(["manage"]);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

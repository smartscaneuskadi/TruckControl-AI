import { describe, expect, it, vi } from "vitest";
import {
  nativeSubscriptionFiscalIssuerAvailable,
  subscriptionFiscalCheckoutAllowed,
} from "../../../supabase/functions/_shared/subscription-fiscal-gate.ts";
import { createBillingHandler } from "../../../supabase/functions/truckcontrol-billing/handler.ts";
import { createRecurringHandler } from "../../../supabase/functions/truckcontrol-subscriptions/handler.ts";

const origin = "https://billing.example";
const account = "a1000000-0000-4000-8000-000000000001";
const order = "a2000000-0000-4000-8000-000000000001";
const request = (action: string) =>
  new Request(`${origin}/billing`, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer synthetic-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      request_id: order,
      terms_accepted: true,
      terms_version: "synthetic-v1",
      invoicingVerified: true,
      invoice_delivery_ready: true,
    }),
  });
const gateway = () => {
  const calls: string[] = [];
  return {
    authenticate: vi.fn(async () => ({ id: account })),
    async server<T>(action: string, _data: Record<string, unknown>): Promise<T> {
      calls.push(action);
      return {} as T;
    },
    calls,
  };
};

describe("bloqueo nativo fiscal de suscripciones - Release 1.0", () => {
  it.each(["true", "false", "TRUE", "1", "", undefined])(
    "una variable BILLING_INVOICING_VERIFIED=%s no acredita un emisor real",
    (flag) => {
      expect(nativeSubscriptionFiscalIssuerAvailable()).toBe(false);
      expect(subscriptionFiscalCheckoutAllowed(flag)).toBe(false);
    },
  );

  it("deniega el checkout único sin llamar al proveedor o a la base aunque el flag sea true", async () => {
    const mock = gateway();
    const fetcher = vi.fn<typeof fetch>();
    const response = await createBillingHandler(
      mock,
      {
        appOrigin: origin,
        stripeKey: "synthetic-stripe-key",
        invoicingVerified: subscriptionFiscalCheckoutAllowed("true"),
      },
      fetcher,
    )(request("checkout"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "automatic_invoicing_unavailable",
    });
    expect(mock.calls).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("deniega renovación/checkout recurrente sin emisor fiscal y no comunica preparación falsa", async () => {
    const mock = gateway();
    const fetcher = vi.fn<typeof fetch>();
    const handler = createRecurringHandler(
      mock,
      {
        appOrigin: origin,
        enabled: true,
        stripeKey: "synthetic-stripe-key",
        termsVersion: "synthetic-v1",
        termsUrl: `${origin}/terms`,
        invoicingVerified: subscriptionFiscalCheckoutAllowed("true"),
      },
      fetcher,
    );
    const status = await handler(request("status"));
    expect(status.status).toBe(200);
    const body = await status.json();
    expect(body.configured).toBe(false);
    expect(body.invoice_delivery_ready).toBe(false);
    const response = await handler(request("checkout"));
    expect(response.status).toBe(503);
    expect(mock.calls).toEqual(["status"]);
    expect(fetcher).not.toHaveBeenCalled();
  });

});

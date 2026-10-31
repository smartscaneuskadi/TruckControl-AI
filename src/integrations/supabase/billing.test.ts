import { describe, expect, it, vi } from "vitest";
import {
  createBillingHandler,
  verifyStripeSignature,
} from "../../../supabase/functions/truckcontrol-billing/handler.ts";
import type { BillingGateway } from "../../../supabase/functions/truckcontrol-billing/handler.ts";
const origin = "https://truckcontrol.example",
  userId = "10000000-0000-4000-8000-000000000061",
  requestId = "20000000-0000-4000-8000-000000000061";
async function signature(body: string, stamp = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("synthetic-webhook-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${stamp}.${body}`),
    ),
  );
  return `t=${stamp},v1=${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
function fixture() {
  const calls: { action: string; data: Record<string, unknown> }[] = [];
  const gateway: BillingGateway = {
    authenticate: async (token) =>
      token === "synthetic-session" ? { id: userId } : null,
    server: async <T>(action: string, data: Record<string, unknown>) => {
      calls.push({ action, data });
      return (
        action === "checkout_order"
          ? {
              id: requestId,
              user_id: userId,
              plan_id: "full",
              quoted_cents: 90000,
              currency: "EUR",
              checkout_id: null,
            }
          : {}
      ) as T;
    },
  };
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      id: "cs_test_synthetic",
      url: "https://checkout.stripe.com/c/pay/cs_test_synthetic",
    }),
  );
  return { gateway, calls, fetcher };
}
const checkout = (token = "synthetic-session") =>
  new Request("https://project.example/functions/v1/truckcontrol-billing", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "checkout",
      request_id: requestId,
      user_id: "forged",
    }),
  });
describe("cobros mensuales opcionales", () => {
  it("no llama al proveedor si no hay configuración y rechaza sesiones falsas", async () => {
    const f = fixture(),
      handle = createBillingHandler(
        f.gateway,
        { appOrigin: origin },
        f.fetcher,
      );
    expect((await handle(checkout())).status).toBe(503);
    expect((await handle(checkout("fake"))).status).toBe(401);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("usa propietario y precio del servidor, con idempotencia y sin activar por redirección", async () => {
    const f = fixture(),
      handle = createBillingHandler(
        f.gateway,
        { appOrigin: origin, stripeKey: "synthetic-provider-key" },
        f.fetcher,
      );
    expect((await handle(checkout())).status).toBe(200);
    expect(f.calls[0].data.user_id).toBe(userId);
    const options = f.fetcher.mock.calls[0][1]!;
    const body = new URLSearchParams(String(options.body));
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("90000");
    expect(body.get("mode")).toBe("payment");
    expect(new Headers(options.headers).get("Idempotency-Key")).toContain(
      requestId,
    );
    expect(f.calls.some((c) => c.action === "payment_event")).toBe(false);
  });
  it("rechaza webhooks falsificados, manipulados o caducados", async () => {
    const raw = '{"synthetic":true}';
    const signed = await signature(raw);
    expect(
      await verifyStripeSignature(raw, signed, "synthetic-webhook-secret"),
    ).toBe(true);
    expect(
      await verifyStripeSignature(
        raw + " ",
        signed,
        "synthetic-webhook-secret",
      ),
    ).toBe(false);
    expect(
      await verifyStripeSignature(
        raw,
        await signature(raw, Math.floor(Date.now() / 1000) - 600),
        "synthetic-webhook-secret",
      ),
    ).toBe(false);
  });
  it("solo aplica un evento firmado con pago completo y metadatos del pedido", async () => {
    const f = fixture(),
      handle = createBillingHandler(
        f.gateway,
        { appOrigin: origin, webhookSecret: "synthetic-webhook-secret" },
        f.fetcher,
      );
    const raw = JSON.stringify({
      id: "evt_synthetic",
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "payment",
          payment_status: "paid",
          amount_total: 90000,
          currency: "eur",
          metadata: { tc_user_id: userId, tc_request_id: requestId },
        },
      },
    });
    const url =
      "https://project.example/functions/v1/truckcontrol-billing?webhook=stripe";
    expect(
      (
        await handle(
          new Request(url, {
            method: "POST",
            body: raw,
            headers: { "stripe-signature": "fake" },
          }),
        )
      ).status,
    ).toBe(400);
    expect(f.calls).toHaveLength(0);
    expect(
      (
        await handle(
          new Request(url, {
            method: "POST",
            body: raw,
            headers: { "stripe-signature": await signature(raw) },
          }),
        )
      ).status,
    ).toBe(200);
    expect(f.calls[0]).toMatchObject({
      action: "payment_event",
      data: { user_id: userId, request_id: requestId, amount_cents: 90000 },
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { createRecurringHandler } from "../../../supabase/functions/truckcontrol-subscriptions/handler.ts";
import type { RecurringGateway } from "../../../supabase/functions/truckcontrol-subscriptions/handler.ts";

const origin = "https://truckcontrol.example";
const user = "f0000000-0000-4000-8000-000000000001";
const requestId = "f0000000-0000-4000-8000-000000000003";
const now = Math.floor(Date.now() / 1000);
const secret = "synthetic-recurring-webhook-secret";
const config = {
  appOrigin: origin,
  enabled: true,
  stripeKey: "synthetic-test-key",
  webhookSecret: secret,
  termsVersion: "test-approved-v1",
  termsUrl: `${origin}/legal/subscription`,
};
async function sign(raw: string, stamp = now) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${stamp}.${raw}`),
    ),
  );
  return `t=${stamp},v1=${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
function fixture() {
  const calls: { action: string; data: Record<string, unknown> }[] = [];
  const order = {
    available: true,
    id: requestId,
    user_id: user,
    plan_id: "limited",
    currency: "EUR",
    quoted_cents: 1000,
    trial_end: new Date((now + 10 * 86400) * 1000).toISOString(),
    expires_at: new Date((now + 23 * 3600) * 1000).toISOString(),
  };
  const subscription = {
    id: "sub_synthetic",
    customer: "cus_synthetic",
    metadata: { tc_user_id: user, tc_request_id: requestId },
    status: "active",
    cancel_at_period_end: false,
    items: {
      has_more: false,
      data: [
        {
          id: "si_synthetic",
          quantity: 1,
          current_period_end: now + 30 * 86400,
          price: {
            id: "price_synthetic",
            unit_amount: 1000,
            currency: "eur",
            recurring: {
              interval: "month",
              interval_count: 1,
              usage_type: "licensed",
            },
          },
        },
      ],
    },
  };
  const invoice = {
    id: "in_synthetic",
    customer: "cus_synthetic",
    status: "paid",
    amount_paid: 1000,
    total: 1000,
    currency: "eur",
    billing_reason: "subscription_cycle",
    parent: { subscription_details: { subscription: "sub_synthetic" } },
    lines: {
      has_more: false,
      data: [
        {
          quantity: 1,
          pricing: { price_details: { price: "price_synthetic" } },
          period: { start: now, end: now + 30 * 86400 },
        },
      ],
    },
  };
  const gateway: RecurringGateway = {
    authenticate: async (token) =>
      token === "synthetic-session" ? { id: user } : null,
    server: async <T>(action: string, data: Record<string, unknown>) => {
      calls.push({ action, data });
      return (
        action === "prepare"
          ? order
          : action === "manage"
            ? { user_id: user, provider_id: "sub_synthetic" }
            : action === "status"
              ? { subscription: null, invoices: [] }
              : {}
      ) as T;
    },
  };
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    if (String(url) === "https://api.stripe.com/v1/checkout/sessions")
      return Response.json({
        id: "cs_test_synthetic",
        url: "https://checkout.stripe.com/c/pay/synthetic",
      });
    if (String(url) === "https://api.stripe.com/v1/invoices/in_synthetic")
      return Response.json(invoice);
    if (String(url) === "https://api.stripe.com/v1/subscriptions/sub_synthetic")
      return Response.json({
        ...subscription,
        ...(options?.method === "POST"
          ? {
              cancel_at_period_end:
                new URLSearchParams(String(options.body)).get(
                  "cancel_at_period_end",
                ) === "true",
            }
          : {}),
      });
    throw new Error("Unexpected external URL; tests never use the network");
  });
  return {
    gateway,
    calls,
    fetcher,
    order,
    subscription,
    invoice,
    handle: createRecurringHandler(gateway, config, fetcher),
  };
}
const request = (
  body: Record<string, unknown>,
  token = "synthetic-session",
  from = origin,
) =>
  new Request(
    "https://project.example/functions/v1/truckcontrol-subscriptions",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        origin: from,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
const checkout = () =>
  request({
    action: "checkout",
    request_id: requestId,
    terms_accepted: true,
    terms_version: config.termsVersion,
    user_id: "forged",
    amount_cents: 1,
  });
async function webhook(
  type: string,
  payload = { id: "in_synthetic" } as Record<string, unknown>,
  signature = true,
) {
  const raw = JSON.stringify({
    id: "evt_synthetic",
    created: now,
    type,
    data: { object: payload },
  });
  return new Request(
    "https://project.example/functions/v1/truckcontrol-subscriptions?webhook=stripe",
    {
      method: "POST",
      headers: {
        "stripe-signature": signature ? await sign(raw) : "t=0,v1=forged",
      },
      body: raw,
    },
  );
}
describe("suscripciones mensuales opcionales", () => {
  it("solo libera una reserva cuando Stripe confirma la caducidad de ese checkout", async () => {
    const f = fixture();
    const session = {
      id: "cs_test_synthetic",
      status: "open",
      mode: "subscription",
      subscription: null,
      metadata: { tc_user_id: user, tc_request_id: requestId },
    };
    f.fetcher.mockImplementation(async () => Response.json(session));
    const expired = () =>
      webhook("checkout.session.expired", { id: session.id });
    expect((await f.handle(await expired())).status).toBe(503);
    expect(f.calls).toHaveLength(0);
    session.status = "expired";
    expect((await f.handle(await expired())).status).toBe(200);
    expect(f.calls[0]).toEqual({
      action: "checkout_expired",
      data: { user_id: user, request_id: requestId, checkout_id: session.id },
    });
  });
  it("no permite usar una clave configurada sin autorización, contrato y activación", async () => {
    for (const changed of [
      { enabled: false },
      { termsVersion: undefined },
      { termsUrl: "https://other.example/terms" },
    ]) {
      const f = fixture();
      expect(
        (
          await createRecurringHandler(
            f.gateway,
            { ...config, ...changed },
            f.fetcher,
          )(checkout())
        ).status,
      ).toBe(503);
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(f.calls).toHaveLength(0);
    }
  });
  it("rechaza identidad falsa, otro origen y falta de aceptación antes del proveedor", async () => {
    const f = fixture();
    expect(
      (await f.handle(request({ action: "checkout" }, "forged"))).status,
    ).toBe(401);
    expect(
      (
        await f.handle(
          request(
            { action: "status" },
            "synthetic-session",
            "https://foreign.example",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await f.handle(
          request({
            action: "checkout",
            request_id: requestId,
            terms_accepted: false,
          }),
        )
      ).status,
    ).toBe(400);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("usa precio, identidad, periodo gratuito y reserva del servidor; jamás la vuelta del navegador", async () => {
    const f = fixture();
    expect((await f.handle(checkout())).status).toBe(200);
    const init = f.fetcher.mock.calls[0][1]!;
    const body = new URLSearchParams(String(init.body));
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][price_data][recurring][interval]")).toBe(
      "month",
    );
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("1000");
    expect(body.get("subscription_data[metadata][tc_user_id]")).toBe(user);
    expect(body.get("subscription_data[trial_end]")).toBe(
      String(now + 10 * 86400),
    );
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
      `tc-recurring-${requestId}`,
    );
    expect(init.redirect).toBe("error");
    expect(f.calls.map((c) => c.action)).toEqual(["prepare", "saved"]);
  });
  it("rechaza una reserva expirada o de otra identidad sin crear checkout", async () => {
    const f = fixture();
    f.order.available = false;
    expect((await f.handle(checkout())).status).toBe(409);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("status solo consulta la cuenta autenticada y no muestra claves", async () => {
    const f = fixture();
    const response = await f.handle(
      request({ action: "status", user_id: "forged" }),
    );
    expect(response.status).toBe(200);
    expect(f.calls[0]).toEqual({ action: "status", data: { user_id: user } });
    expect(await response.text()).not.toContain(config.stripeKey);
  });
  it("rechaza firmas falsas antes de consultar Stripe", async () => {
    const f = fixture();
    expect(
      (await f.handle(await webhook("invoice.paid", undefined, false))).status,
    ).toBe(400);
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(0);
  });
  it("reconcilia una factura pagada con la suscripción y precio actuales de Stripe", async () => {
    const f = fixture();
    expect((await f.handle(await webhook("invoice.paid"))).status).toBe(200);
    expect(f.calls).toEqual([
      {
        action: "event",
        data: expect.objectContaining({
          user_id: user,
          request_id: requestId,
          invoice_paid: true,
          invoice_amount: 1000,
          subscription_id: "sub_synthetic",
          invoice_id: "in_synthetic",
          invoice_period_start: now,
          invoice_period_end: now + 30 * 86400,
        }),
      },
    ]);
  });
  it("la factura gratuita de prueba y los impagos no amplían el acceso", async () => {
    const f = fixture();
    f.invoice.amount_paid = 0;
    f.invoice.total = 0;
    expect((await f.handle(await webhook("invoice.paid"))).status).toBe(200);
    expect(f.calls[0].data.invoice_paid).toBe(false);
    const failed = fixture();
    failed.subscription.status = "past_due";
    expect(
      (await failed.handle(await webhook("invoice.payment_failed"))).status,
    ).toBe(200);
    expect(failed.calls[0].data).toMatchObject({
      state: "past_due",
      invoice_paid: false,
    });
  });
  it("no concede acceso por finalizar checkout ni por eventos sin factura pagada", async () => {
    const f = fixture();
    expect(
      (
        await f.handle(
          await webhook("checkout.session.completed", {
            mode: "subscription",
            subscription: "sub_synthetic",
          }),
        )
      ).status,
    ).toBe(200);
    expect(f.calls[0].data.invoice_paid).toBe(false);
  });
  it("rechaza moneda, importe, cliente, múltiples precios y periodos que no sean mensuales", async () => {
    const mutations = [
      (f: ReturnType<typeof fixture>) => {
        f.invoice.total = 999;
      },
      (f: ReturnType<typeof fixture>) => {
        f.invoice.customer = "cus_foreign";
      },
      (f: ReturnType<typeof fixture>) => {
        f.invoice.currency = "usd";
      },
      (f: ReturnType<typeof fixture>) => {
        f.subscription.items.data.push(f.subscription.items.data[0]);
      },
      (f: ReturnType<typeof fixture>) => {
        f.invoice.lines.data[0].period.end = now + 365 * 86400;
      },
    ];
    for (const mutate of mutations) {
      const f = fixture();
      mutate(f);
      expect((await f.handle(await webhook("invoice.paid"))).status).toBe(503);
      expect(f.calls).toHaveLength(0);
    }
  });
  it("permite cancelar cuando nuevas ventas están apagadas y exige una operación idempotente", async () => {
    const f = fixture();
    const handle = createRecurringHandler(
      f.gateway,
      { ...config, enabled: false },
      f.fetcher,
    );
    expect(
      (await handle(request({ action: "cancel", operation_id: requestId })))
        .status,
    ).toBe(200);
    expect(
      (await handle(request({ action: "resume", operation_id: requestId })))
        .status,
    ).toBe(503);
    expect(
      new Headers(f.fetcher.mock.calls[0][1]?.headers).get("Idempotency-Key"),
    ).toBe(`tc-cancel-sub_synthetic-${requestId}`);
    expect(f.calls.some((c) => c.action === "event")).toBe(false);
  });
  it("no gestiona la suscripción de otra cuenta aunque se falsifique la respuesta de reserva", async () => {
    const f = fixture();
    f.gateway.server = async <T>() =>
      ({ user_id: "forged", provider_id: "sub_foreign" }) as T;
    expect(
      (await f.handle(request({ action: "cancel", operation_id: requestId })))
        .status,
    ).toBe(403);
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("limita el cuerpo y no filtra errores privados", async () => {
    const f = fixture();
    expect(
      (
        await f.handle(
          request({ action: "status", padding: "x".repeat(65536) }),
        )
      ).status,
    ).toBe(413);
    f.gateway.server = async () => {
      throw new Error("private-database-secret");
    };
    const response = await f.handle(request({ action: "status" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-database-secret");
  });
});

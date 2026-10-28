import { isUuid } from "../_shared/invoice.ts";
export interface BillingGateway {
  authenticate(token: string): Promise<{ id: string } | null>;
  server<T>(action: string, data: Record<string, unknown>): Promise<T>;
}
export interface BillingConfig {
  appOrigin: string;
  stripeKey?: string;
  webhookSecret?: string;
}
interface Order {
  id: string;
  user_id: string;
  plan_id: string;
  quoted_cents: number;
  currency: string;
  checkout_id: string | null;
}
async function readBody(request: Request, max = 262144) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let count = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    count += next.value.length;
    if (count > max) {
      await reader.cancel();
      throw new Error("Request too large");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
export async function verifyStripeSignature(
  body: string,
  header: string | null,
  secret: string,
  now = Date.now(),
) {
  if (!header || header.length > 2000) return false;
  const fields = header.split(",").map((x) => x.trim().split("="));
  const stamp = fields.find(([k]) => k === "t")?.[1];
  if (
    !stamp ||
    !/^\d{10}$/.test(stamp) ||
    Math.abs(now / 1000 - Number(stamp)) > 300
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
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
  return fields
    .filter(([k]) => k === "v1")
    .some(([, hex]) => {
      if (!hex || !/^[a-f0-9]{64}$/i.test(hex)) return false;
      let mismatch = 0;
      for (let i = 0; i < 32; i++)
        mismatch |= digest[i] ^ parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      return mismatch === 0;
    });
}
export function createBillingHandler(
  gateway: BillingGateway,
  config: BillingConfig,
  fetcher: typeof fetch = fetch,
) {
  const origin = new URL(config.appOrigin).origin;
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  return async (request: Request) => {
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== origin
    )
      return json({ error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return json({ error: "method_not_allowed" }, 405);
    try {
      const raw = await readBody(request);
      if (new URL(request.url).searchParams.get("webhook") === "stripe") {
        if (
          !config.webhookSecret ||
          !(await verifyStripeSignature(
            raw,
            request.headers.get("stripe-signature"),
            config.webhookSecret,
          ))
        )
          return json({ error: "invalid_signature" }, 400);
        const event = JSON.parse(raw) as {
          id?: string;
          type?: string;
          data?: { object?: Record<string, unknown> };
        };
        if (!event.id || !/^evt_[A-Za-z0-9]{1,200}$/.test(event.id))
          return json({ error: "invalid_event" }, 400);
        if (event.type !== "checkout.session.completed")
          return json({ received: true });
        const session = event.data?.object;
        if (
          !session ||
          session.payment_status !== "paid" ||
          session.mode !== "payment"
        )
          return json({ received: true });
        const metadata = session.metadata as
          Record<string, unknown> | undefined;
        if (
          !isUuid(metadata?.tc_user_id) ||
          !isUuid(metadata?.tc_request_id) ||
          typeof session.amount_total !== "number" ||
          !Number.isSafeInteger(session.amount_total) ||
          String(session.currency).toLowerCase() !== "eur"
        )
          return json({ error: "invalid_payment" }, 400);
        await gateway.server("payment_event", {
          event_id: event.id,
          event_type: event.type,
          user_id: metadata.tc_user_id,
          request_id: metadata.tc_request_id,
          amount_cents: session.amount_total,
          currency: "EUR",
        });
        return json({ received: true });
      }
      const token = request.headers
        .get("authorization")
        ?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!token) return json({ error: "authentication_required" }, 401);
      const user = await gateway.authenticate(token);
      if (!user) return json({ error: "authentication_required" }, 401);
      const body = JSON.parse(raw) as Record<string, unknown>;
      if (body.action !== "checkout" || !isUuid(body.request_id))
        return json({ error: "invalid_request" }, 400);
      if (!config.stripeKey)
        return json({ error: "payments_not_configured" }, 503);
      const order = await gateway.server<Order>("checkout_order", {
        user_id: user.id,
        request_id: body.request_id,
      });
      if (
        order.user_id !== user.id ||
        order.currency !== "EUR" ||
        order.quoted_cents < 100
      )
        return json({ error: "order_not_available" }, 403);
      const form = new URLSearchParams({
        mode: "payment",
        "payment_method_types[0]": "card",
        success_url: `${origin}/?payment_return=1`,
        cancel_url: `${origin}/`,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "eur",
        "line_items[0][price_data][unit_amount]": String(order.quoted_cents),
        "line_items[0][price_data][product_data][name]": `TruckControl AI · ${order.plan_id === "full" ? "Full" : "Limitado"} · 1 mes`,
        "metadata[tc_user_id]": user.id,
        "metadata[tc_request_id]": order.id,
      });
      const response = await fetcher(
        "https://api.stripe.com/v1/checkout/sessions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.stripeKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "Idempotency-Key": `truckcontrol-month-${order.id}`,
          },
          body: form,
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok) throw new Error("Payment provider unavailable");
      const session = (await response.json()) as { id?: string; url?: string };
      if (
        !session.id ||
        !session.url ||
        new URL(session.url).origin !== "https://checkout.stripe.com"
      )
        throw new Error("Invalid checkout");
      await gateway.server("checkout_saved", {
        user_id: user.id,
        request_id: order.id,
        checkout_id: session.id,
      });
      return json({ url: session.url });
    } catch {
      return json({ error: "billing_unavailable" }, 502);
    }
  };
}

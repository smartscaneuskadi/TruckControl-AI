import { isUuid } from "../_shared/invoice.ts";
import { verifyStripeSignature } from "../truckcontrol-billing/handler.ts";

export interface RecurringGateway {
  authenticate(token: string): Promise<{ id: string } | null>;
  server<T>(action: string, data: Record<string, unknown>): Promise<T>;
}
export interface RecurringConfig {
  appOrigin: string;
  enabled?: boolean;
  stripeKey?: string;
  webhookSecret?: string;
  termsVersion?: string;
  termsUrl?: string;
}
type Obj = Record<string, unknown>;
interface Order {
  available: boolean;
  id: string;
  user_id: string;
  plan_id: string;
  quoted_cents: number;
  currency: string;
  trial_end: string;
  expires_at: string;
  customer_id?: string | null;
}
const states = new Set([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);
const object = (value: unknown): Obj =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : {};
const providerId = (value: unknown, prefix: string): value is string =>
  typeof value === "string" &&
  new RegExp(`^${prefix}_[A-Za-z0-9]{1,200}$`).test(value);
const seconds = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
async function boundedText(source: Pick<Request, "body">, max: number) {
  const reader = source.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > max) {
      await reader.cancel();
      throw new Error("body_limit");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
const subscriptionOf = (invoice: Obj) => {
  const parent = object(object(invoice.parent).subscription_details);
  const id = parent.subscription ?? invoice.subscription;
  return typeof id === "string" ? id : object(id).id;
};

/** Provider access stays server-side. Unpaid events and redirects never grant access. */
export function createRecurringHandler(
  gateway: RecurringGateway,
  config: RecurringConfig,
  fetcher: typeof fetch = fetch,
) {
  const origin = new URL(config.appOrigin).origin;
  const termsUrl = (() => {
    try {
      const url = new URL(config.termsUrl ?? "");
      return url.origin === origin && !url.username && !url.password
        ? url.href
        : null;
    } catch {
      return null;
    }
  })();
  const configured = Boolean(
    config.enabled && config.stripeKey && config.termsVersion && termsUrl,
  );
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  async function stripe(
    path: string,
    form?: URLSearchParams,
    idempotency?: string,
  ): Promise<Obj> {
    if (!config.stripeKey) throw new Error("provider_not_configured");
    const response = await fetcher(`https://api.stripe.com/v1/${path}`, {
      method: form ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${config.stripeKey}`,
        "Stripe-Version": "2025-03-31.basil",
        ...(form
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
        ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
      },
      ...(form ? { body: form } : {}),
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("provider_unavailable");
    return object(JSON.parse(await boundedText(response, 524288)));
  }
  async function reconcile(event: Obj): Promise<void> {
    const type = event.type;
    const payload = object(object(event.data).object);
    if (type === "checkout.session.expired") {
      if (
        typeof payload.id !== "string" ||
        !/^cs_[A-Za-z0-9_]{1,200}$/.test(payload.id)
      )
        throw new Error("invalid_checkout");
      const session = await stripe(`checkout/sessions/${payload.id}`);
      const metadata = object(session.metadata);
      if (
        session.id !== payload.id ||
        session.status !== "expired" ||
        session.mode !== "subscription" ||
        session.subscription ||
        !isUuid(metadata.tc_user_id) ||
        !isUuid(metadata.tc_request_id)
      )
        throw new Error("expiration_not_confirmed");
      await gateway.server("checkout_expired", {
        user_id: metadata.tc_user_id,
        request_id: metadata.tc_request_id,
        checkout_id: session.id,
      });
      return;
    }
    let invoice: Obj | null = null;
    let id: unknown;
    if (
      type === "invoice.paid" ||
      type === "invoice.payment_failed" ||
      type === "invoice.payment_action_required"
    ) {
      if (!providerId(payload.id, "in")) throw new Error("invalid_invoice");
      invoice = await stripe(`invoices/${payload.id}`);
      if (invoice.id !== payload.id) throw new Error("invoice_mismatch");
      id = subscriptionOf(invoice);
      // Non-subscription invoices belong to other products, not TruckControl.
      if (!id) return;
    } else if (type === "checkout.session.completed") {
      if (payload.mode !== "subscription") return;
      id = payload.subscription;
    } else if (
      typeof type === "string" &&
      type.startsWith("customer.subscription.")
    ) {
      id = payload.id;
    } else return;
    if (!providerId(id, "sub")) throw new Error("invalid_subscription");
    // Fetch current provider state rather than trusting delivery order or client metadata.
    const subscription = await stripe(`subscriptions/${id}`);
    const metadata = object(subscription.metadata);
    const items = object(subscription.items);
    const item = object(
      Array.isArray(items.data) && items.data.length === 1
        ? items.data[0]
        : null,
    );
    const price = object(item.price);
    const recurring = object(price.recurring);
    const periodEnd =
      item.current_period_end ?? subscription.current_period_end;
    if (
      !isUuid(metadata.tc_user_id) ||
      !isUuid(metadata.tc_request_id) ||
      subscription.id !== id ||
      !providerId(subscription.customer, "cus") ||
      items.has_more === true ||
      item.quantity !== 1 ||
      recurring.interval !== "month" ||
      recurring.interval_count !== 1 ||
      recurring.usage_type === "metered" ||
      price.currency !== "eur" ||
      !Number.isSafeInteger(price.unit_amount) ||
      Number(price.unit_amount) < 100 ||
      !seconds(periodEnd) ||
      !states.has(String(subscription.status))
    )
      throw new Error("invalid_subscription");
    let paid = false;
    let start: number | undefined, end: number | undefined;
    if (type === "invoice.paid" && invoice) {
      const lines = object(invoice.lines);
      const line = object(
        Array.isArray(lines.data) && lines.data.length === 1
          ? lines.data[0]
          : null,
      );
      const linePrice = object(
        object(object(line.pricing).price_details).price,
      );
      const linePriceId =
        object(object(line.pricing).price_details).price ??
        object(line.price).id;
      const period = object(line.period);
      if (
        invoice.customer !== subscription.customer ||
        invoice.status !== "paid" ||
        invoice.currency !== "eur" ||
        !["subscription_create", "subscription_cycle"].includes(
          String(invoice.billing_reason),
        )
      ) {
        throw new Error("invalid_paid_invoice");
      }
      // A zero-value trial invoice grants nothing; the application's own trial remains authoritative.
      if (invoice.amount_paid !== 0 || invoice.total !== 0) {
        if (
          lines.has_more === true ||
          line.quantity !== 1 ||
          invoice.amount_paid !== price.unit_amount ||
          invoice.total !== price.unit_amount ||
          (typeof linePriceId === "string" ? linePriceId : linePrice.id) !==
            price.id ||
          !seconds(period.start) ||
          !seconds(period.end) ||
          period.end <= period.start ||
          period.end - period.start < 27 * 86400 ||
          period.end - period.start > 32 * 86400
        ) {
          throw new Error("invoice_price_or_period_mismatch");
        }
        paid = true;
        start = period.start;
        end = period.end;
      }
    }
    await gateway.server("event", {
      user_id: metadata.tc_user_id,
      request_id: metadata.tc_request_id,
      subscription_id: id,
      customer_id: subscription.customer,
      event_id: event.id,
      event_type: type,
      event_created: event.created,
      state: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end === true,
      period_end: periodEnd,
      unit_amount: price.unit_amount,
      currency: "EUR",
      invoice_paid: paid,
      ...(paid && invoice
        ? {
            invoice_id: invoice.id,
            invoice_amount: invoice.amount_paid,
            invoice_period_start: start,
            invoice_period_end: end,
          }
        : {}),
    });
  }
  return async (request: Request): Promise<Response> => {
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
      const raw = await boundedText(request, 65536);
      if (new URL(request.url).searchParams.get("webhook") === "stripe") {
        if (
          !config.webhookSecret ||
          !(await verifyStripeSignature(
            raw,
            request.headers.get("stripe-signature"),
            config.webhookSecret,
          ))
        ) {
          return json({ error: "invalid_signature" }, 400);
        }
        let event: Obj;
        try {
          event = object(JSON.parse(raw));
        } catch {
          return json({ error: "invalid_event" }, 400);
        }
        if (!providerId(event.id, "evt") || !seconds(event.created))
          return json({ error: "invalid_event" }, 400);
        await reconcile(event);
        return json({ received: true });
      }
      const token = request.headers
        .get("authorization")
        ?.match(/^Bearer ([^\s]+)$/i)?.[1];
      const user = token ? await gateway.authenticate(token) : null;
      if (!user) return json({ error: "authentication_required" }, 401);
      let body: Obj;
      try {
        body = object(JSON.parse(raw));
      } catch {
        return json({ error: "invalid_request" }, 400);
      }
      if (body.action === "status") {
        const status = await gateway.server<Obj>("status", {
          user_id: user.id,
        });
        return json({
          ...status,
          configured,
          management_available: Boolean(config.stripeKey),
          terms_version: config.termsVersion ?? null,
          terms_url: termsUrl,
        });
      }
      if (body.action === "checkout") {
        if (!configured)
          return json({ error: "recurring_not_configured" }, 503);
        if (
          !isUuid(body.request_id) ||
          body.terms_accepted !== true ||
          body.terms_version !== config.termsVersion
        ) {
          return json({ error: "terms_or_request_invalid" }, 400);
        }
        const order = await gateway.server<Order>("prepare", {
          user_id: user.id,
          request_id: body.request_id,
          terms_accepted: true,
          terms_version: config.termsVersion,
        });
        if (
          !order.available ||
          order.id !== body.request_id ||
          order.user_id !== user.id ||
          order.currency !== "EUR" ||
          !Number.isSafeInteger(order.quoted_cents) ||
          order.quoted_cents < 100
        )
          return json({ error: "order_not_available" }, 409);
        const form = new URLSearchParams({
          mode: "subscription",
          success_url: `${origin}/?subscription_return=1`,
          cancel_url: `${origin}/`,
          "line_items[0][quantity]": "1",
          "line_items[0][price_data][currency]": "eur",
          "line_items[0][price_data][unit_amount]": String(order.quoted_cents),
          "line_items[0][price_data][recurring][interval]": "month",
          "line_items[0][price_data][recurring][interval_count]": "1",
          "line_items[0][price_data][product_data][name]": `TruckControl AI · ${order.plan_id === "full" ? "Full" : "Inicial"}`,
          "subscription_data[metadata][tc_user_id]": user.id,
          "subscription_data[metadata][tc_request_id]": order.id,
          "metadata[tc_user_id]": user.id,
          "metadata[tc_request_id]": order.id,
          "metadata[tc_terms_version]": config.termsVersion!,
          expires_at: String(Math.floor(Date.parse(order.expires_at) / 1000)),
        });
        if (providerId(order.customer_id, "cus"))
          form.set("customer", order.customer_id);
        const trialEnd = Math.floor(Date.parse(order.trial_end) / 1000);
        if (trialEnd > Date.now() / 1000 + 48 * 3600)
          form.set("subscription_data[trial_end]", String(trialEnd));
        const session = await stripe(
          "checkout/sessions",
          form,
          `tc-recurring-${order.id}`,
        );
        const url =
          typeof session.url === "string" ? new URL(session.url) : null;
        if (
          typeof session.id !== "string" ||
          !/^cs_[A-Za-z0-9_]{1,200}$/.test(session.id) ||
          !url ||
          url.origin !== "https://checkout.stripe.com" ||
          url.username ||
          url.password
        )
          throw new Error("invalid_checkout");
        await gateway.server("saved", {
          user_id: user.id,
          request_id: order.id,
          checkout_id: session.id,
        });
        return json({ url: url.href });
      }
      if (body.action === "cancel" || body.action === "resume") {
        // Cancellation remains available when new sales are switched off.
        if (!config.stripeKey || (body.action === "resume" && !configured))
          return json({ error: "recurring_not_configured" }, 503);
        if (!isUuid(body.operation_id))
          return json({ error: "invalid_request" }, 400);
        const subscription = await gateway.server<Obj>("manage", {
          user_id: user.id,
          operation: body.action,
        });
        if (
          subscription.user_id !== user.id ||
          !providerId(subscription.provider_id, "sub")
        )
          return json({ error: "subscription_not_available" }, 403);
        const updated = await stripe(
          `subscriptions/${subscription.provider_id}`,
          new URLSearchParams({
            cancel_at_period_end: String(body.action === "cancel"),
          }),
          `tc-${body.action}-${subscription.provider_id}-${body.operation_id}`,
        );
        if (
          updated.id !== subscription.provider_id ||
          updated.cancel_at_period_end !== (body.action === "cancel")
        )
          throw new Error("provider_did_not_confirm");
        // Access changes only after the signed webhook has been reconciled.
        return json({ requested: true });
      }
      return json({ error: "invalid_request" }, 400);
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error && error.message === "body_limit"
              ? "request_too_large"
              : "subscription_unavailable",
        },
        error instanceof Error && error.message === "body_limit" ? 413 : 503,
      );
    }
  };
}

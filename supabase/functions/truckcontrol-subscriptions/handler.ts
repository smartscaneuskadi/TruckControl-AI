import { isUuid } from "../_shared/invoice.ts";
import { stripeServerKeyMode } from "../_shared/stripe-server-key.ts";
import { verifyStripeSignature } from "../truckcontrol-billing/handler.ts";

export interface RecurringGateway {
  manualCheckoutReady?(): Promise<boolean>;
  authenticate(
    token: string,
  ): Promise<{ id: string; session_id?: string } | null>;
  server<T>(action: string, data: Record<string, unknown>): Promise<T>;
  refreshReady?(): Promise<boolean>;
  refresh?<T>(
    action: "observe" | "commit",
    actor: { id: string; session_id: string },
    operation: string,
    data: Record<string, unknown>,
  ): Promise<T>;
}
export interface RecurringConfig {
  appOrigin: string;
  allowedOrigins?: readonly string[];
  enabled?: boolean;
  stripeKey?: string;
  webhookSecret?: string;
  termsVersion?: string;
  termsUrl?: string;
  /** Release gate, set only after fiscal issuance and automatic delivery pass acceptance. */
  invoicingVerified?: boolean;
  /** Optional kill switch; the native RPC capability must ALSO be present. */
  snapshotRefreshAccepted?: boolean;
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
  checkout_id?: string | null;
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
  const allowedOrigins = new Set(config.allowedOrigins ?? [origin]);
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
  const checkoutConfigured = Boolean(
    config.enabled && config.stripeKey && config.termsVersion && termsUrl,
  );
  async function refreshReady() {
    if (
      config.snapshotRefreshAccepted === false ||
      !config.stripeKey ||
      !gateway.refresh
    )
      return false;
    try {
      return (await gateway.refreshReady?.()) === true;
    } catch {
      return false;
    }
  }
  async function stripe(
    path: string,
    form?: URLSearchParams,
    idempotency?: string,
    budget?: AbortSignal,
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
      signal: budget
        ? AbortSignal.any([budget, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
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
    const applySnapshot = async (snapshotRevision?: string): Promise<Obj> => {
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
      return await gateway.server<Obj>("event", {
        user_id: metadata.tc_user_id,
        request_id: metadata.tc_request_id,
        subscription_id: id,
        customer_id: subscription.customer,
        event_id: event.id,
        event_type: type,
        event_created: event.created,
        ...(snapshotRevision === undefined
          ? {}
          : { snapshot_revision: snapshotRevision }),
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
    };
    // Paid events belong to the separate atomic fiscal bridge in production.
    // Its compatibility path can flag an ambiguous unversioned snapshot while
    // committing the independently verified invoice; it cannot grant lifecycle
    // webhooks permission to extend access.
    if (type === "invoice.paid") {
      await applySnapshot();
      return;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const observed = await gateway.server<Obj>("observe", {
        subscription_id: id,
      });
      if (
        typeof observed.snapshot_revision !== "string" ||
        !/^(0|[1-9][0-9]{0,18})$/.test(observed.snapshot_revision)
      )
        throw new Error("invalid_subscription_revision");
      const result = await applySnapshot(observed.snapshot_revision);
      if (result.reconcile_required !== true) return;
    }
    // Do not acknowledge a state that lost every CAS attempt. Provider retry
    // begins with a new observation and canonical GET.
    throw new Error("subscription_reconciliation_required");
  }
  return async (request: Request): Promise<Response> => {
    const requestOrigin = request.headers.get("origin");
    const headers = {
      "Access-Control-Allow-Origin":
        requestOrigin && allowedOrigins.has(requestOrigin)
          ? requestOrigin
          : origin,
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
    if (requestOrigin && !allowedOrigins.has(requestOrigin))
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
      if (body.action === "refresh") {
        if (
          !isUuid(body.operation_id) ||
          Object.keys(body).some(
            (key) => key !== "action" && key !== "operation_id",
          )
        )
          return json({ error: "invalid_request" }, 400);
        if (!isUuid(user.session_id))
          return json({ error: "authentication_required" }, 401);
        if (!gateway.refresh || !(await refreshReady()))
          return json({ error: "subscription_refresh_unavailable" }, 503);
        const actor = { id: user.id, session_id: user.session_id };
        const deadline = AbortSignal.timeout(25000);
        for (let attempt = 0; attempt < 3; attempt++) {
          const saved = await gateway.refresh<Obj>(
            "observe",
            actor,
            body.operation_id,
            {},
          );
          if (saved.throttled === true)
            return json(
              {
                error: "subscription_refresh_rate_limited",
                retry_after_seconds: 60,
              },
              429,
            );
          if (saved.refreshed === true && saved.duplicate === true)
            return json({ refreshed: true, duplicate: true });
          if (saved.available !== true)
            return json({ error: "subscription_not_available" }, 409);
          if (
            saved.user_id !== actor.id ||
            !isUuid(saved.request_id) ||
            !providerId(saved.subscription_id, "sub") ||
            !providerId(saved.customer_id, "cus") ||
            typeof saved.snapshot_revision !== "string" ||
            !/^(0|[1-9][0-9]{0,18})$/.test(saved.snapshot_revision) ||
            saved.currency !== "EUR" ||
            !Number.isSafeInteger(saved.unit_amount) ||
            Number(saved.unit_amount) < 100
          )
            throw new Error("subscription_refresh_binding_invalid");
          const canonical = await stripe(
            `subscriptions/${saved.subscription_id}`,
            undefined,
            undefined,
            deadline,
          );
          const metadata = object(canonical.metadata),
            items = object(canonical.items);
          const item = object(
            Array.isArray(items.data) && items.data.length === 1
              ? items.data[0]
              : null,
          );
          const price = object(item.price),
            recurring = object(price.recurring);
          const periodEnd =
            item.current_period_end ?? canonical.current_period_end;
          if (
            canonical.id !== saved.subscription_id ||
            canonical.customer !== saved.customer_id ||
            metadata.tc_user_id !== actor.id ||
            metadata.tc_request_id !== saved.request_id ||
            items.has_more === true ||
            item.quantity !== 1 ||
            price.currency !== "eur" ||
            price.unit_amount !== saved.unit_amount ||
            recurring.interval !== "month" ||
            recurring.interval_count !== 1 ||
            recurring.usage_type === "metered" ||
            !seconds(periodEnd) ||
            !states.has(String(canonical.status)) ||
            typeof canonical.cancel_at_period_end !== "boolean"
          )
            throw new Error("subscription_refresh_canonical_invalid");
          // Do not save a provider response into a session that was closed while
          // GET was pending. The SQL commit also locks/rechecks these Auth rows.
          const live = await gateway.authenticate(token!);
          if (live?.id !== actor.id || live.session_id !== actor.session_id)
            return json({ error: "authentication_required" }, 401);
          const result = await gateway.refresh<Obj>(
            "commit",
            actor,
            body.operation_id,
            {
              request_id: saved.request_id,
              subscription_id: saved.subscription_id,
              customer_id: saved.customer_id,
              snapshot_revision: saved.snapshot_revision,
              state: canonical.status,
              cancel_at_period_end: canonical.cancel_at_period_end,
              period_end: periodEnd,
              unit_amount: price.unit_amount,
              currency: "EUR",
            },
          );
          if (
            result.refreshed === true &&
            typeof result.duplicate === "boolean"
          )
            return json({ refreshed: true, duplicate: result.duplicate });
          if (result.reconcile_required !== true)
            throw new Error("subscription_refresh_not_saved");
          // A CAS conflict always starts a NEW observation and canonical GET.
        }
        return json({ error: "subscription_refresh_retry_required" }, 409);
      }
      const checkFiscal =
        body.action === "status" ||
        body.action === "checkout" ||
        body.action === "resume";
      const invoiceReady =
        config.invoicingVerified === true ||
        (checkFiscal && (await gateway.manualCheckoutReady?.()) === true);
      const configured = checkoutConfigured && invoiceReady;
      if (body.action === "status") {
        const status = await gateway.server<Obj>("status", {
          user_id: user.id,
        });
        return json({
          ...status,
          configured,
          invoice_delivery_ready: invoiceReady,
          management_available: Boolean(config.stripeKey),
          refresh_available: await refreshReady(),
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
        if (order.checkout_id != null) {
          const mode = stripeServerKeyMode(config.stripeKey);
          if (!mode || !/^cs_[A-Za-z0-9_]{1,200}$/.test(order.checkout_id))
            throw new Error("invalid_checkout");
          // Retrieve the saved session with the same account-scoped credential.
          // Recreating it can change trial_end after the 48-hour threshold and
          // conflict with the original Stripe idempotency key. A failed read
          // must never release this reservation or start another subscription.
          const session = await stripe(
            `checkout/sessions/${order.checkout_id}?expand%5B%5D=line_items`,
          );
          const metadata = object(session.metadata),
            lines = object(session.line_items);
          const line = object(
            Array.isArray(lines.data) && lines.data.length === 1
              ? lines.data[0]
              : null,
          );
          const price = object(line.price),
            recurring = object(price.recurring);
          const url =
            typeof session.url === "string" ? new URL(session.url) : null;
          const expires = Math.floor(Date.parse(order.expires_at) / 1000);
          if (
            session.id !== order.checkout_id ||
            session.object !== "checkout.session" ||
            session.livemode !== (mode === "live") ||
            session.mode !== "subscription" ||
            session.status !== "open" ||
            !["unpaid", "no_payment_required"].includes(
              String(session.payment_status),
            ) ||
            session.subscription != null ||
            session.payment_intent != null ||
            metadata.tc_user_id !== user.id ||
            metadata.tc_request_id !== order.id ||
            metadata.tc_terms_version !== config.termsVersion ||
            (order.customer_id != null &&
              session.customer !== order.customer_id) ||
            (session.customer != null &&
              !providerId(session.customer, "cus")) ||
            session.currency !== "eur" ||
            (session.amount_total !== 0 &&
              session.amount_total !== order.quoted_cents) ||
            session.amount_subtotal !== session.amount_total ||
            !seconds(expires) ||
            session.expires_at !== expires ||
            expires <= Date.now() / 1000 ||
            lines.has_more !== false ||
            line.quantity !== 1 ||
            line.currency !== "eur" ||
            price.currency !== "eur" ||
            !providerId(price.id, "price") ||
            price.unit_amount !== order.quoted_cents ||
            recurring.interval !== "month" ||
            recurring.interval_count !== 1 ||
            recurring.usage_type !== "licensed" ||
            !url ||
            url.origin !== "https://checkout.stripe.com" ||
            url.username ||
            url.password
          )
            throw new Error("invalid_checkout");
          return json({ url: url.href });
        }
        const form = new URLSearchParams({
          mode: "subscription",
          success_url: `${origin}/?subscription_return=1`,
          cancel_url: `${origin}/`,
          "line_items[0][quantity]": "1",
          "line_items[0][price_data][currency]": "eur",
          "line_items[0][price_data][unit_amount]": String(order.quoted_cents),
          "line_items[0][price_data][recurring][interval]": "month",
          "line_items[0][price_data][recurring][interval_count]": "1",
          "line_items[0][price_data][product_data][name]": `TruckControl AI · ${order.plan_id === "full" ? "Full" : "Básico"}`,
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

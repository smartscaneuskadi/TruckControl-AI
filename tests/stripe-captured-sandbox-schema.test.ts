import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { reconcileStripeManualInvoicePayment } from "../supabase/functions/_shared/subscription-stripe-reconciliation.ts";
import type { StripeReconciliationConfig } from "../supabase/functions/_shared/subscription-stripe-reconciliation.ts";

type Obj = Record<string, unknown>;
interface CapturedEvent extends Obj {
  id: string; type: string; created: number; api_version: string;
}
interface CapturedCase {
  event: CapturedEvent; invoice: Obj; subscription: Obj;
  invoice_payments?: Obj; payment_intent?: Obj; charge?: Obj;
}
const captured = JSON.parse(readFileSync(
  "tests/fixtures/stripe-sandbox-schema-20261108.json", "utf8",
)) as {
  schema: string; provenance: Obj; account: Obj;
  paid: CapturedCase; zero_trial: CapturedCase;
};
const origin = "https://api.stripe.com/v1/";
const localKey = "sk_test_syntheticFixture";
const localHmac = "synthetic-local-hmac-captured-schema-only";
function object(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Expected captured object");
  return value as Obj;
}
function resourceId(value: Obj, prefix: string): string {
  expect(value.id).toMatch(new RegExp("^" + prefix + "_[A-Za-z0-9]+$"));
  return String(value.id);
}
/**
 * Offline adapter contract for curated real SANDBOX objects. The in-process
 * HMAC below is synthetic, not a provider webhook acceptance or credential.
 * The fixture does not capture raw HTTP/version negotiation or prove database
 * permissions, production persistence, settlement or invoice issuance.
 */
function harness(kind: "paid" | "zero_trial" = "paid") {
  const data = structuredClone(captured[kind]);
  const invoiceId = resourceId(data.invoice, "in");
  const subscriptionId = resourceId(data.subscription, "sub");
  const records: Record<string, unknown> = {
    account: structuredClone(captured.account),
    ["events/" + data.event.id]: structuredClone(data.event),
    ["invoices/" + invoiceId]: data.invoice,
    ["subscriptions/" + subscriptionId]: data.subscription,
  };
  if (data.invoice_payments) records["invoice_payments?invoice=" + invoiceId + "&status=paid&limit=2"] = data.invoice_payments;
  if (data.payment_intent) records["payment_intents/" + resourceId(data.payment_intent, "pi")] = data.payment_intent;
  if (data.charge) records["charges/" + resourceId(data.charge, "ch")] = data.charge;
  const routes: string[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    expect(url.startsWith(origin)).toBe(true);
    const route = url.slice(origin.length);
    expect(Object.hasOwn(records, route)).toBe(true);
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer " + localKey);
    // Require an explicit provider version without pretending the curated
    // fixture attests a raw response negotiated under that header.
    expect(headers.get("Stripe-Version")).toMatch(/^\d{4}-\d{2}-\d{2}\.[a-z]+$/);
    routes.push(route);
    // There is deliberately no network fallback for an unknown endpoint.
    if (!Object.hasOwn(records, route)) throw Error("Unexpected captured fixture route");
    return new Response(JSON.stringify(records[route]), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  const config: StripeReconciliationConfig = {
    stripeKey: localKey, webhookSecret: localHmac,
    expectedAccountId: String(captured.account.id), mode: "test",
    now: (data.event.created + 1) * 1000,
  };
  async function run() {
    const raw = JSON.stringify(data.event), timestamp = String(data.event.created);
    const signature = "t=" + timestamp + ",v1=" + createHmac("sha256", localHmac)
      .update(timestamp + "." + raw).digest("hex");
    return reconcileStripeManualInvoicePayment(raw, signature, config, fetcher);
  }
  return { data, records, routes, fetcher, invoiceId, subscriptionId, run };
}

describe("esquema Stripe sandbox capturado: contrato offline del adaptador", () => {
  it("concilia la mensualidad real de sandbox de 36300 céntimos con identidad y período canónicos", async () => {
    const f = harness();
    const result = await f.run();
    expect(result.kind).toBe("subscription_invoice");
    if (result.kind !== "subscription_invoice") throw Error("Expected a funded recurring invoice");
    const metadata = object(object(f.data.invoice.parent).subscription_details).metadata as Obj;
    const line = object((object(f.data.invoice.lines).data as unknown[])[0]);
    const period = object(line.period);
    expect(result).toMatchObject({
      provider_account_id: captured.account.id, provider_event_id: f.data.event.id,
      provider_payment_id: f.invoiceId, invoice_id: f.invoiceId, subscription_id: f.subscriptionId,
      user_id: metadata.tc_user_id, request_id: metadata.tc_request_id, company_id: metadata.tc_company_id,
      customer_id: f.data.invoice.customer, amount_cents: 36300, unit_amount: 36300,
      currency: "EUR", livemode: false, billing_reason: "subscription_create",
      invoice_period_start: period.start, invoice_period_end: period.end,
      subscription_current_period_end: period.end,
      paid_at: new Date(Number(object(f.data.invoice.status_transitions).paid_at) * 1000).toISOString(),
    });
    expect(f.routes).toEqual([
      "account", "events/" + f.data.event.id, "invoices/" + f.invoiceId,
      "subscriptions/" + f.subscriptionId,
      "invoice_payments?invoice=" + f.invoiceId + "&status=paid&limit=2",
      "payment_intents/" + f.data.payment_intent?.id, "charges/" + f.data.charge?.id,
    ]);
    expect(f.fetcher).toHaveBeenCalledTimes(7);
  });

  it("ignora la factura cero de prueba de diez días sin pedir ni inventar financiación", async () => {
    const f = harness("zero_trial");
    expect(await f.run()).toEqual({ kind: "ignored", provider_event_id: f.data.event.id });
    expect(Number(f.data.subscription.trial_end) - Number(f.data.subscription.trial_start)).toBe(10 * 86400);
    expect(f.routes).toEqual([
      "account", "events/" + f.data.event.id, "invoices/" + f.invoiceId,
      "subscriptions/" + f.subscriptionId,
    ]);
    expect(f.routes.some((route) => /invoice_payments|payment_intents|charges/.test(route))).toBe(false);
    expect(f.fetcher).toHaveBeenCalledTimes(4);
  });

  it("rechaza importe inconsistente o atribución cambiada sin consultar financiación", async () => {
    for (const attack of ["amount", "correlation"] as const) {
      const f = harness();
      if (attack === "amount") f.data.invoice.total = Number(f.data.invoice.amount_paid) + 1;
      else object(f.data.subscription.metadata).tc_user_id = "fcb10000-0000-4000-8000-000000000999";
      await expect(f.run()).rejects.toMatchObject({
        code: attack === "amount" ? "payment_not_confirmed" : "correlation_missing",
      });
      expect(f.routes.some((route) => /invoice_payments|payment_intents|charges/.test(route))).toBe(false);
    }
  });

  it("rechaza el cobro reembolsado en la Charge canónica y demuestra que alcanzó esa comprobación", async () => {
    const f = harness();
    if (!f.data.charge) throw Error("Missing captured funded charge");
    f.data.charge.refunded = true;
    f.data.charge.amount_refunded = 36300;
    await expect(f.run()).rejects.toMatchObject({ code: "payment_not_confirmed" });
    // This must fail if an earlier schema incompatibility prevents reaching the
    // captured Charge: an unrelated rejection cannot stand in for this guard.
    expect(f.routes).toContain("charges/" + f.data.charge.id);
    expect(f.fetcher).toHaveBeenCalledTimes(7);
  });

  it("conserva la procedencia sandbox y excluye secretos, tarjetas, direcciones de correo y enlaces privados", () => {
    expect(captured.schema).toBe("stripe-sandbox-curated-schema-v1");
    expect(captured.provenance).toMatchObject({
      livemode: false, real_money: 0, captures_raw_wire: false,
      verifies_webhook_signature: false, verifies_backend_secret: false,
      verifies_production_persistence: false, api_keys_or_client_secrets_included: false,
      capture_whitelist_revision: 2,
    });
    // Security-relevant nullable fields must be captured explicitly, not
    // silently dropped by the collector and mistaken for an absent route.
    expect(captured.paid.payment_intent).toMatchObject({
      capture_method: "automatic", on_behalf_of: null, transfer_data: null,
    });
    expect(captured.paid.charge).toMatchObject({ on_behalf_of: null, transfer_data: null });
    const invoicePayment = object((object(captured.paid.invoice_payments).data as unknown[])[0]);
    expect(invoicePayment.status_transitions).toMatchObject({
      paid_at: object(captured.paid.invoice.status_transitions).paid_at,
    });
    expect(captured.paid.event.api_version).toBe("2026-10-28.endive");
    expect(captured.zero_trial.event.api_version).toBe("2026-10-28.endive");
    const forbidden = new Set([
      "api_key", "secret_key", "client_secret", "webhook_secret", "authorization",
      "card", "card_number", "cvc", "payment_method_details", "billing_details",
      "shipping", "email", "receipt_email", "receipt_url", "hosted_invoice_url", "invoice_pdf", "url",
    ]);
    function visit(value: unknown) {
      if (typeof value === "string") {
        expect(value).not.toMatch(/(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+|_secret_[A-Za-z0-9]+|-----BEGIN [A-Z ]*PRIVATE KEY-----/);
        expect(value).not.toMatch(/https?:\/\/|[^\s@]+@[^\s@]+\.[^\s@]+/);
      } else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") {
        for (const [key, entry] of Object.entries(value)) {
          expect(forbidden.has(key.toLowerCase().replaceAll("-", "_"))).toBe(false);
          visit(entry);
        }
      }
    }
    visit(captured);
  });
});

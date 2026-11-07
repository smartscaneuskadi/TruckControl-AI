import { describe, expect, it } from "vitest";
import {
  manualInvoiceNeedsAttention,
  recordConfirmedManualPayment,
  recordManualInvoiceIssued,
  recordManualInvoiceSent,
  requireManualInvoiceReview,
  type ConfirmedSubscriptionPayment,
  type ManualDispatchInput,
  type ManualIssueRecord,
} from "../src/domain/manual-subscription-invoicing";
import {
  nativeSubscriptionFiscalIssuerAvailable,
  subscriptionFiscalCheckoutAllowed,
} from "../supabase/functions/_shared/subscription-fiscal-gate";

const requestId = "a1000000-0000-4000-8000-000000000001";
const buyerCompanyId = "b1000000-0000-4000-8000-000000000001";
const paidAt = "2026-11-07T10:00:00Z";
const payment = (changes: Partial<ConfirmedSubscriptionPayment> = {}): ConfirmedSubscriptionPayment => ({
  providerEventId: "evt_syntheticPaid001",
  providerPaymentId: "in_syntheticInvoice001",
  requestId,
  buyerCompanyId,
  amountCents: 36300,
  currency: "EUR",
  paidAt,
  ...changes,
});
const task = () => recordConfirmedManualPayment(null, payment());
const issue = (changes: Partial<ManualIssueRecord> = {}): ManualIssueRecord => ({
  requestId,
  providerPaymentId: "in_syntheticInvoice001",
  invoiceNumber: "A-2026/123",
  ticketBaiReference: "TBAI-synthetic-reference",
  privatePdfKey: "subscription-invoices/b1000000-0000-4000-8000-000000000001/123.pdf",
  issuedAt: "2026-11-07T12:00:00Z",
  ...changes,
});
const issued = () => recordManualInvoiceIssued(task(), issue());
const sent = (changes: Partial<ManualDispatchInput> = {}): ManualDispatchInput => ({
  requestId,
  providerPaymentId: "in_syntheticInvoice001",
  invoiceNumber: "A-2026/123",
  dispatchRecordId: "c1000000-0000-4000-8000-000000000001",
  sentAt: "2026-11-07T13:00:00Z",
  ...changes,
});

describe("TicketBAI manual: contrato puro, sin emisión ni pagos", () => {
  it("prepara una tarea exclusivamente a partir de un pago confirmado por backend", () => {
    expect(task()).toEqual({ ...payment(), status: "awaiting_issue" });
    expect(task().invoice).toBeUndefined();
    expect(task().dispatch).toBeUndefined();
    expect(nativeSubscriptionFiscalIssuerAvailable()).toBe(false);
    expect(subscriptionFiscalCheckoutAllowed("true")).toBe(false);
  });

  it("no duplica tareas ante el mismo pago en eventos firmados diferentes", () => {
    const pending = task();
    expect(recordConfirmedManualPayment(pending, payment())).toBe(pending);
    expect(recordConfirmedManualPayment(pending, payment({ providerEventId: "evt_syntheticDuplicate002" }))).toBe(pending);
    const alreadyIssued = issued();
    expect(recordConfirmedManualPayment(alreadyIssued, payment({ providerEventId: "evt_laterReplayed003" }))).toBe(alreadyIssued);
  });

  it("rechaza reatribución de pago, compra, empresa, importe o instante", () => {
    for (const changes of [
      { providerPaymentId: "in_different" },
      { requestId: "a2000000-0000-4000-8000-000000000002" },
      { buyerCompanyId: "b2000000-0000-4000-8000-000000000002" },
      { amountCents: 84700 },
      { paidAt: "2026-11-07T11:00:00Z" },
    ]) {
      expect(() => recordConfirmedManualPayment(task(), payment(changes)))
        .toThrow("conflicting_confirmed_subscription_payment");
    }
  });

  it("rechaza hechos monetarios o Stripe sintácticamente inválidos", () => {
    for (const changes of [
      { providerEventId: "evt_malicious\n" },
      { providerPaymentId: "https://payment.provider" },
      { requestId: "someone-else" },
      { buyerCompanyId: "invalid" },
      { amountCents: 0 },
      { amountCents: Number.MAX_SAFE_INTEGER + 1 },
      { currency: "USD" as "EUR" },
      { paidAt: "tomorrow" },
    ]) {
      expect(() => recordConfirmedManualPayment(null, payment(changes)))
        .toThrow();
    }
  });

  it("solo admite facturas emitidas realmente por GDTaller, sin inventar número, TicketBAI ni PDF", () => {
    const confirmed = task();
    const next = recordManualInvoiceIssued(confirmed, issue());
    expect(next.status).toBe("awaiting_send");
    expect(next.invoice).toEqual({
      invoiceNumber: "A-2026/123",
      ticketBaiReference: "TBAI-synthetic-reference",
      privatePdfKey: "subscription-invoices/b1000000-0000-4000-8000-000000000001/123.pdf",
      issuedAt: "2026-11-07T12:00:00Z",
    });
    expect(recordManualInvoiceIssued(next, issue())).toBe(next);
    expect(() => recordManualInvoiceIssued(next, issue({ invoiceNumber: "A-2026/124" })))
      .toThrow("conflicting_manual_invoice_issue");
  });

  it("no mezcla facturas ni documentos de otros pagos y rechaza PDF público o rutas peligrosas", () => {
    for (const changes of [
      { requestId: "a2000000-0000-4000-8000-000000000002" },
      { providerPaymentId: "in_anotherInvoice" },
    ]) expect(() => recordManualInvoiceIssued(task(), issue(changes)))
      .toThrow("manual_invoice_scope_mismatch");
    for (const privatePdfKey of [
      "https://storage.example/123.pdf",
      "../123.pdf",
      "private/../123.pdf",
      "private//123.pdf",
      "123.pdf",
      "private/123.png",
      "subscription-invoices/b2000000-0000-4000-8000-000000000002/123.pdf",
    ]) expect(() => recordManualInvoiceIssued(task(), issue({ privatePdfKey })))
      .toThrow("invalid_private_fiscal_pdf_key");
    expect(() => recordManualInvoiceIssued(task(), issue({ ticketBaiReference: " " })))
      .toThrow("invalid_manual_invoice_reference");
    expect(() => recordManualInvoiceIssued(task(), issue({ issuedAt: "2026-02-30T12:00:00Z" })))
      .toThrow("invalid_manual_invoice_timestamp");
    expect(() => recordManualInvoiceIssued(task(), issue({ issuedAt: "2026-11-07T09:00:00Z" })))
      .toThrow("invalid_manual_invoice_timestamp");
    expect(() => recordManualInvoiceIssued(task(), issue({ invoiceNumber: "N\n001" })))
      .toThrow("invalid_manual_invoice_reference");
  });

  it("informa del envío por persona sin afirmar que el correo fue entregado", () => {
    const ready = issued();
    const next = recordManualInvoiceSent(ready, sent());
    expect(next.status).toBe("sent_reported");
    expect(next.dispatch).toEqual({
      dispatchRecordId: "c1000000-0000-4000-8000-000000000001",
      invoiceNumber: "A-2026/123",
      sentAt: "2026-11-07T13:00:00Z",
    });
    expect(recordManualInvoiceSent(next, sent())).toBe(next);
    expect(() => recordManualInvoiceSent(next, sent({ sentAt: "2026-11-07T14:00:00Z" })))
      .toThrow("conflicting_manual_invoice_dispatch");
    expect(() => recordManualInvoiceSent(task(), sent())).toThrow("manual_invoice_scope_mismatch");
    expect(() => recordManualInvoiceSent(ready, sent({ invoiceNumber: "A-2026/124" })))
      .toThrow("manual_invoice_scope_mismatch");
    expect(() => recordManualInvoiceSent(ready, sent({ sentAt: "2026-11-07T11:00:00Z" })))
      .toThrow("invalid_manual_invoice_timestamp");
    expect(() => recordManualInvoiceSent(ready, sent({ dispatchRecordId: "id" })))
      .toThrow("invalid_manual_dispatch_record");
  });

  it("las revisiones bloquean avances automáticos y conservan la factura si ya existe", () => {
    const blocked = requireManualInvoiceReview(task(), "customer_data_invalid");
    expect(blocked.status).toBe("needs_review");
    expect(blocked.reviewReason).toBe("customer_data_invalid");
    expect(requireManualInvoiceReview(blocked, "customer_data_invalid")).toBe(blocked);
    expect(() => requireManualInvoiceReview(blocked, "amount_mismatch"))
      .toThrow("conflicting_manual_invoice_review");
    expect(() => recordManualInvoiceIssued(blocked, issue()))
      .toThrow("invalid_manual_invoice_transition");
    const issueBlocked = requireManualInvoiceReview(issued(), "dispatch_failure");
    expect(issueBlocked.invoice?.invoiceNumber).toBe("A-2026/123");
    expect(() => recordManualInvoiceSent(issueBlocked, sent()))
      .toThrow("invalid_manual_invoice_transition");
    expect(() => requireManualInvoiceReview(recordManualInvoiceSent(issued(), sent()), "dispatch_failure"))
      .toThrow("invalid_manual_invoice_transition");
    expect(() => requireManualInvoiceReview(task(), "paid" as never))
      .toThrow("invalid_manual_invoice_review_reason");
  });

  it("alerta solo por plazo operativo, no crea facturas ni fija un plazo legal", () => {
    const deadline = Date.parse(paidAt) + 48 * 3600000;
    expect(manualInvoiceNeedsAttention(task(), deadline - 1)).toBe(false);
    expect(manualInvoiceNeedsAttention(task(), deadline)).toBe(true);
    expect(manualInvoiceNeedsAttention(issued(), deadline)).toBe(true);
    expect(manualInvoiceNeedsAttention(recordManualInvoiceSent(issued(), sent()), deadline)).toBe(false);
    expect(manualInvoiceNeedsAttention(requireManualInvoiceReview(task(), "amount_mismatch"), deadline)).toBe(false);
    expect(manualInvoiceNeedsAttention(task(), Date.parse(paidAt) + 24 * 3600000, 24)).toBe(true);
    expect(() => manualInvoiceNeedsAttention(task(), Number.NaN)).toThrow("invalid_manual_invoice_reminder");
    expect(() => manualInvoiceNeedsAttention(task(), deadline, 0)).toThrow("invalid_manual_invoice_reminder");
  });
});

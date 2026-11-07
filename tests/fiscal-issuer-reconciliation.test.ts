import { describe, expect, it, vi } from "vitest";
import {
  beginFiscalIssue,
  type FiscalIssueEvidence,
  type FiscalDeliveryEvidence,
  markFiscalIssueUncertain,
  newFiscalAttempt,
  recordFiscalDelivery,
  recordFiscalIssue,
  requireManualFiscalReview,
} from "../src/domain/fiscal-issuer-reconciliation";

const requestId = "a2000000-0000-4000-8000-000000000001";
const digest = "a".repeat(64);
const fresh = () => newFiscalAttempt(requestId, digest);
const submitted = () => beginFiscalIssue(fresh()).attempt;
const issueEvidence = (changes: Partial<FiscalIssueEvidence> = {}): FiscalIssueEvidence => ({
  requestId,
  documentDigest: digest,
  providerReference: "provider-op-1",
  invoiceReference: "T-2026/001",
  ...changes,
});
const deliveryEvidence = (changes: Partial<FiscalDeliveryEvidence> = {}): FiscalDeliveryEvidence => ({
  ...issueEvidence(),
  deliveryReference: "receipt-01",
  ...changes,
});
const issued = () => recordFiscalIssue(submitted(), issueEvidence());

describe("contrato sin proveedor: emisión fiscal de suscripciones", () => {
  it("no crea ninguna factura ni infiere datos fiscales; exige clave y digest válidos", () => {
    expect(fresh()).toEqual({ requestId, documentDigest: digest, status: "ready" });
    expect(() => newFiscalAttempt("not-a-uuid", digest)).toThrow("invalid_fiscal_request");
    expect(() => newFiscalAttempt(requestId, "1234")).toThrow("invalid_fiscal_request");
  });

  it("autoriza una única presentación lógica y ninguna al repetirla", () => {
    const first = beginFiscalIssue(fresh());
    expect(first.shouldSubmit).toBe(true);
    expect(first.attempt.status).toBe("submitted");
    const replay = beginFiscalIssue(first.attempt);
    expect(replay.shouldSubmit).toBe(false);
    expect(replay.attempt).toBe(first.attempt);
  });

  it("no repite una llamada externa tras incertidumbre del emisor", () => {
    const pretendProviderCall = vi.fn();
    let current = fresh();
    const first = beginFiscalIssue(current);
    current = first.attempt;
    if (first.shouldSubmit) pretendProviderCall();
    current = markFiscalIssueUncertain(current);
    const second = beginFiscalIssue(current);
    if (second.shouldSubmit) pretendProviderCall();
    expect(second.shouldSubmit).toBe(false);
    expect(current.status).toBe("unresolved");
    expect(markFiscalIssueUncertain(current)).toBe(current);
    expect(pretendProviderCall).toHaveBeenCalledTimes(1);
  });

  it("admite conciliación posterior a una respuesta incierta sin crear otro intento", () => {
    const unknown = markFiscalIssueUncertain(submitted());
    const confirmed = recordFiscalIssue(unknown, issueEvidence({ providerReference: "external-id", invoiceReference: "factura-real-proveedor" }));
    expect(confirmed.status).toBe("issued");
    expect(beginFiscalIssue(confirmed).shouldSubmit).toBe(false);
  });

  it("requiere emisor y referencia de factura: no confunde un pago con emisión", () => {
    expect(() => recordFiscalIssue(fresh(), issueEvidence({ providerReference: "paid", invoiceReference: "invoice" }))).toThrow("invalid_fiscal_transition");
    expect(() => recordFiscalIssue(submitted(), issueEvidence({ providerReference: "", invoiceReference: "T-001" }))).toThrow("invalid_fiscal_reference");
    expect(() => recordFiscalIssue(submitted(), issueEvidence({ providerReference: "provider", invoiceReference: "\n" }))).toThrow("invalid_fiscal_reference");
    expect(() => recordFiscalDelivery(submitted(), deliveryEvidence({ deliveryReference: "sent" }))).toThrow("invalid_fiscal_transition");
    expect(() => recordFiscalDelivery(fresh(), deliveryEvidence({ deliveryReference: "sent" }))).toThrow("invalid_fiscal_transition");
  });

  it("rechaza una factura distinta para la misma operación", () => {
    const once = issued();
    expect(recordFiscalIssue(once, issueEvidence({ providerReference: "provider-op-1", invoiceReference: "T-2026/001" }))).toBe(once);
    expect(() => recordFiscalIssue(once, issueEvidence({ providerReference: "provider-op-1", invoiceReference: "T-2026/002" })))
      .toThrow("conflicting_fiscal_confirmation");
    expect(() => recordFiscalIssue(once, issueEvidence({ providerReference: "provider-op-2", invoiceReference: "T-2026/001" })))
      .toThrow("conflicting_fiscal_confirmation");
  });

  it("requiere recibo independiente para entrega e idempotencia", () => {
    const document = issued();
    expect(document.deliveryReference).toBeUndefined();
    const delivered = recordFiscalDelivery(document, deliveryEvidence({ deliveryReference: "receipt-01" }));
    expect(delivered.status).toBe("delivered");
    expect(delivered.invoiceReference).toBe("T-2026/001");
    expect(recordFiscalDelivery(delivered, deliveryEvidence({ deliveryReference: "receipt-01" }))).toBe(delivered);
    expect(recordFiscalIssue(delivered, issueEvidence({ providerReference: "provider-op-1", invoiceReference: "T-2026/001" }))).toBe(delivered);
    expect(() => recordFiscalDelivery(delivered, deliveryEvidence({ deliveryReference: "receipt-02" })))
      .toThrow("conflicting_fiscal_delivery");
  });


  it("no mezcla confirmaciones de otra solicitud o digest aprobado", () => {
    const original = submitted();
    const foreign = "b2000000-0000-4000-8000-000000000002";
    expect(() => recordFiscalIssue(original, issueEvidence({ requestId: foreign })))
      .toThrow("fiscal_request_mismatch");
    expect(() => recordFiscalIssue(original, issueEvidence({ documentDigest: "b".repeat(64) })))
      .toThrow("fiscal_request_mismatch");
    expect(() => recordFiscalIssue(original, null as unknown as FiscalIssueEvidence))
      .toThrow("fiscal_request_mismatch");
    expect(recordFiscalIssue(original, issueEvidence()).status).toBe("issued");
  });

  it("rechaza acuses de entrega ajenos a la factura, proveedor o solicitud", () => {
    const confirmed = issued();
    expect(() => recordFiscalDelivery(confirmed, deliveryEvidence({ requestId: "b2000000-0000-4000-8000-000000000002" })))
      .toThrow("fiscal_request_mismatch");
    expect(() => recordFiscalDelivery(confirmed, deliveryEvidence({ documentDigest: "b".repeat(64) })))
      .toThrow("fiscal_request_mismatch");
    expect(() => recordFiscalDelivery(confirmed, deliveryEvidence({ providerReference: "different-provider" })))
      .toThrow("conflicting_fiscal_delivery");
    expect(() => recordFiscalDelivery(confirmed, deliveryEvidence({ invoiceReference: "T-2026/002" })))
      .toThrow("conflicting_fiscal_delivery");
    const delivered = recordFiscalDelivery(confirmed, deliveryEvidence());
    expect(recordFiscalDelivery(delivered, deliveryEvidence())).toBe(delivered);
    expect(() => recordFiscalDelivery(delivered, deliveryEvidence({ invoiceReference: "T-2026/002" })))
      .toThrow("conflicting_fiscal_delivery");
  });

  it("no permite recuperar automáticamente un intento marcado para revisión manual", () => {
    const blocked = requireManualFiscalReview(markFiscalIssueUncertain(submitted()));
    expect(blocked.status).toBe("manual_review");
    expect(requireManualFiscalReview(blocked)).toBe(blocked);
    expect(beginFiscalIssue(blocked).shouldSubmit).toBe(false);
    expect(() => recordFiscalIssue(blocked, issueEvidence({ providerReference: "provider-id", invoiceReference: "T-2026/005" })))
      .toThrow("invalid_fiscal_transition");
    expect(() => recordFiscalDelivery(blocked, deliveryEvidence({ deliveryReference: "receipt" })))
      .toThrow("invalid_fiscal_transition");
  });

  it("impide transiciones inválidas fuera de secuencia", () => {
    expect(() => markFiscalIssueUncertain(fresh())).toThrow("invalid_fiscal_transition");
    expect(() => requireManualFiscalReview(fresh())).toThrow("invalid_fiscal_transition");
    expect(() => requireManualFiscalReview(issued())).toThrow("invalid_fiscal_transition");
    expect(() => markFiscalIssueUncertain(issued())).toThrow("invalid_fiscal_transition");
  });
});

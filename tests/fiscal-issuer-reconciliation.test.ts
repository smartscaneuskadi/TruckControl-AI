import { describe, expect, it, vi } from "vitest";
import {
  beginFiscalIssue,
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
const issued = () => recordFiscalIssue(submitted(), "provider-op-1", "T-2026/001");

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
    const confirmed = recordFiscalIssue(unknown, "external-id", "factura-real-proveedor");
    expect(confirmed.status).toBe("issued");
    expect(beginFiscalIssue(confirmed).shouldSubmit).toBe(false);
  });

  it("requiere emisor y referencia de factura: no confunde un pago con emisión", () => {
    expect(() => recordFiscalIssue(fresh(), "paid", "invoice")).toThrow("invalid_fiscal_transition");
    expect(() => recordFiscalIssue(submitted(), "", "T-001")).toThrow("invalid_fiscal_reference");
    expect(() => recordFiscalIssue(submitted(), "provider", "\n")).toThrow("invalid_fiscal_reference");
    expect(() => recordFiscalDelivery(submitted(), "sent")).toThrow("invalid_fiscal_transition");
    expect(() => recordFiscalDelivery(fresh(), "sent")).toThrow("invalid_fiscal_transition");
  });

  it("rechaza una factura distinta para la misma operación", () => {
    const once = issued();
    expect(recordFiscalIssue(once, "provider-op-1", "T-2026/001")).toBe(once);
    expect(() => recordFiscalIssue(once, "provider-op-1", "T-2026/002"))
      .toThrow("conflicting_fiscal_confirmation");
    expect(() => recordFiscalIssue(once, "provider-op-2", "T-2026/001"))
      .toThrow("conflicting_fiscal_confirmation");
  });

  it("requiere recibo independiente para entrega e idempotencia", () => {
    const document = issued();
    expect(document.deliveryReference).toBeUndefined();
    const delivered = recordFiscalDelivery(document, "receipt-01");
    expect(delivered.status).toBe("delivered");
    expect(delivered.invoiceReference).toBe("T-2026/001");
    expect(recordFiscalDelivery(delivered, "receipt-01")).toBe(delivered);
    expect(recordFiscalIssue(delivered, "provider-op-1", "T-2026/001")).toBe(delivered);
    expect(() => recordFiscalDelivery(delivered, "receipt-02"))
      .toThrow("conflicting_fiscal_delivery");
  });

  it("no permite recuperar automáticamente un intento marcado para revisión manual", () => {
    const blocked = requireManualFiscalReview(markFiscalIssueUncertain(submitted()));
    expect(blocked.status).toBe("manual_review");
    expect(requireManualFiscalReview(blocked)).toBe(blocked);
    expect(beginFiscalIssue(blocked).shouldSubmit).toBe(false);
    expect(() => recordFiscalIssue(blocked, "provider-id", "T-2026/005"))
      .toThrow("invalid_fiscal_transition");
    expect(() => recordFiscalDelivery(blocked, "receipt"))
      .toThrow("invalid_fiscal_transition");
  });

  it("impide transiciones inválidas fuera de secuencia", () => {
    expect(() => markFiscalIssueUncertain(fresh())).toThrow("invalid_fiscal_transition");
    expect(() => requireManualFiscalReview(fresh())).toThrow("invalid_fiscal_transition");
    expect(() => requireManualFiscalReview(issued())).toThrow("invalid_fiscal_transition");
    expect(() => markFiscalIssueUncertain(issued())).toThrow("invalid_fiscal_transition");
  });
});

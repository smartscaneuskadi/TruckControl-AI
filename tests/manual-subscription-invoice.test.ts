import { describe, expect, it } from "vitest";
import {
  manualInvoicePaymentKey,
  manualInvoiceTransitionAllowed,
  type ManualInvoiceEvidence,
} from "../src/domain/manualSubscriptionInvoice";

const fiscal: ManualInvoiceEvidence = {
  fiscalNumber: "T-2026-1",
  fiscalReference: "TEST-ONLY",
  pdfStorageKey: "private/test.pdf",
};
describe("manual TicketBAI invoice workflow (pure safety rules)", () => {
  it("does not allow delivery without fiscal evidence", () => {
    expect(manualInvoiceTransitionAllowed("delivery_pending", "delivered", {
      deliveryRecipient: "example@example.com",
      deliveryConfirmedAt: "2026-11-07T12:00:00Z",
    })).toBe(false);
  });
  it("requires confirmed delivery details", () => {
    expect(manualInvoiceTransitionAllowed("delivery_pending", "delivered", fiscal)).toBe(false);
    expect(manualInvoiceTransitionAllowed("delivery_pending", "delivered", {
      ...fiscal, deliveryRecipient: "example@example.com", deliveryConfirmedAt: "invalid",
    })).toBe(false);
    expect(manualInvoiceTransitionAllowed("delivery_pending", "delivered", {
      ...fiscal, deliveryRecipient: "example@example.com", deliveryConfirmedAt: "2026-11-07T12:00:00Z",
    })).toBe(true);
  });
  it("rejects skipping fiscal issue or repeating terminal delivery", () => {
    expect(manualInvoiceTransitionAllowed("pending_manual_issue", "delivered", fiscal)).toBe(false);
    expect(manualInvoiceTransitionAllowed("delivered", "delivered", fiscal)).toBe(false);
    expect(manualInvoiceTransitionAllowed("pending_manual_issue", "fiscal_issued", fiscal)).toBe(true);
  });
  it("allows review after a failed delivery, but no direct success", () => {
    expect(manualInvoiceTransitionAllowed("delivery_failed", "delivered", fiscal)).toBe(false);
    expect(manualInvoiceTransitionAllowed("delivery_failed", "delivery_pending", fiscal)).toBe(true);
  });
  it("rejects incomplete fiscal references and blank PDFs", () => {
    expect(manualInvoiceTransitionAllowed("pending_manual_issue", "fiscal_issued", {
      ...fiscal, fiscalReference: " ",
    })).toBe(false);
    expect(manualInvoiceTransitionAllowed("pending_manual_issue", "fiscal_issued", {
      ...fiscal, pdfStorageKey: "",
    })).toBe(false);
  });
  it("isolates payment keys by provider and merchant account", () => {
    const key = manualInvoicePaymentKey("stripe", "seller-a", "payment-1");
    expect(key).toBe(manualInvoicePaymentKey("stripe", "seller-a", "payment-1"));
    expect(key).not.toBe(manualInvoicePaymentKey("stripe", "seller-b", "payment-1"));
    expect(() => manualInvoicePaymentKey("stripe", "", "payment-1")).toThrow();
  });
});

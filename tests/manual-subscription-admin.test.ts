import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/database.types";
import {
  loadManualInvoiceCapabilities,
  loadManualSubscriptionInvoices,
  mutateManualSubscriptionInvoice,
} from "../src/integrations/supabase/manual-subscription-admin";
import {
  manualSubscriptionTaskSchema,
  validateManualInvoiceCommand,
} from "../src/domain/manual-subscription-admin";
import type { ManualSubscriptionTask } from "../src/domain/manual-subscription-admin";

const org = "fc610000-0000-4000-8000-000000000001";
const id = "fc610000-0000-4000-8000-000000000011";
const op = "fc610000-0000-4000-8000-000000000021";
const stamp = "2026-11-08T08:00:00Z";
function task(): ManualSubscriptionTask {
  return {
    id, buyer_company_id: org, buyer_company_name: "Comprador ficticio",
    buyer_tax_id: "DEMO-TEST", buyer_address: "Domicilio ficticio 50",
    buyer_email: "buyer@example.invalid", buyer_validated: false,
    buyer_snapshot_origin: "profile_at_intake",
    provider_payment_id: "in_synthetic001", provider_invoice_id: "in_synthetic001",
    period_start: "2026-11-01T00:00:00Z", period_end: "2026-12-01T00:00:00Z",
    amount_cents: 36300, net_cents: 30000, vat_cents: 6300, vat_rate_bps: 2100,
    currency: "EUR", paid_at: stamp, status: "awaiting_issue", row_version: 1,
    invoice: null, dispatch: null, review_reason: null,
  };
}
const buyer = {
  company_name: "Comprador ficticio", tax_id: "DEMO-TEST",
  address: "Domicilio ficticio 50", email: "buyer@example.invalid",
  evidence_reference: "Soporte ficticio 001",
};
function client(data: unknown, error: { code?: string; message?: string } | null = null) {
  const aborted = vi.fn();
  const rpc = vi.fn(() => {
    const pending = Promise.resolve({ data, error });
    return Object.assign(pending, {
      abortSignal: (signal: AbortSignal) => { aborted(signal); return pending; },
    });
  });
  return { value: { rpc } as unknown as SupabaseClient<Database>, rpc, aborted };
}
function validated() {
  return { ...task(), buyer_validated: true, buyer_snapshot_origin: "operator_validated" as const, row_version: 2 };
}
function issued() {
  return { ...validated(), status: "awaiting_send" as const, row_version: 3,
    invoice: { invoice_number: "F-DEMO-001", ticketbai_reference: "TBAI-DEMO-001",
      issued_at: "2026-11-08T09:00:00Z",
      pdf_object_key: "subscription-invoices/" + org + "/" + id + "/fiscal.pdf",
      pdf_sha256: "a".repeat(64) } };
}

describe("administración fiscal manual con CAS, ámbito y evidencia honesta", () => {
  it("comprueba capacidad real y aborta lecturas sin inventar disponibilidad documental", async () => {
    const f = client({ available: true, document_upload_ready: false });
    const signal = new AbortController().signal;
    expect(await loadManualInvoiceCapabilities(f.value, signal)).toEqual({ available: true, document_upload_ready: false });
    expect(f.aborted).toHaveBeenCalledWith(signal);
    expect(f.rpc).toHaveBeenCalledWith("tc_admin_manual_subscription_invoices",
      { p_action: "capabilities", p_task_id: null, p_expected: null, p_request_id: null, p_data: {}, p_after: null });
  });
  it("un backend ausente no presenta una conexión activa ni filtra su mensaje interno", async () => {
    const f = client(null, { code: "PGRST202", message: "private synthetic secret" });
    await expect(loadManualInvoiceCapabilities(f.value)).rejects.toThrow("preparación");
    await expect(loadManualInvoiceCapabilities(f.value)).rejects.not.toThrow("synthetic secret");
    expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it("rechaza páginas duplicadas, sin avance o con cursor de otra fila", async () => {
    for (const value of [
      { items: [task(), task()], next_cursor: null },
      { items: [task()], next_cursor: op },
    ]) await expect(loadManualSubscriptionInvoices(client(value).value)).rejects.toThrow();
    await expect(loadManualSubscriptionInvoices(client({ items: [task()], next_cursor: id }).value, id)).rejects.toThrow();
  });
  it("envía exclusivamente la operación, versión y datos confirmados; no poderes administrativos", async () => {
    const f = client({ task: validated(), replayed: false });
    expect(await mutateManualSubscriptionInvoice(f.value, task(), "validate_buyer", buyer, op)).toEqual(validated());
    expect(f.rpc).toHaveBeenCalledWith("tc_admin_manual_subscription_invoices", {
      p_action: "validate_buyer", p_task_id: id, p_expected: 1, p_request_id: op,
      p_data: buyer, p_after: null,
    });
  });
  it("rechaza confirmaciones de otra empresa o pago y respuestas que no aplican la versión", async () => {
    for (const next of [
      { ...validated(), buyer_company_id: op },
      { ...validated(), provider_payment_id: "in_foreign" },
      { ...validated(), row_version: 1 },
      { ...validated(), amount_cents: 36301, net_cents: 30001 },
      task(),
    ]) await expect(mutateManualSubscriptionInvoice(client({ task: next, replayed: false }).value, task(), "validate_buyer", buyer, op)).rejects.toThrow();
  });
  it("exige que el servidor confirme exactamente el comprador contrastado", async () => {
    await expect(mutateManualSubscriptionInvoice(
      client({ task: { ...validated(), buyer_email: "other@example.invalid" }, replayed: false }).value,
      task(), "validate_buyer", buyer, op,
    )).rejects.toThrow("identidad fiscal");
  });
  it("conflicto y denegación nunca reintentan la mutación ni muestran errores privados", async () => {
    for (const code of ["40001", "42501"]) {
      const f = client(null, { code, message: "credential-synthetic-must-not-leak" });
      await expect(mutateManualSubscriptionInvoice(f.value, task(), "validate_buyer", buyer, op)).rejects.not.toThrow("credential");
      expect(f.rpc).toHaveBeenCalledTimes(1);
    }
  });
  it("rechaza campos extra, operación inválida y revalidaciones antes de llamar a red", async () => {
    const f = client({ task: validated(), replayed: false });
    await expect(mutateManualSubscriptionInvoice(f.value, task(), "validate_buyer", { ...buyer, is_admin: true }, op)).rejects.toThrow();
    await expect(mutateManualSubscriptionInvoice(f.value, task(), "validate_buyer", buyer, "bad-operation")).rejects.toThrow();
    await expect(mutateManualSubscriptionInvoice(f.value, validated(), "validate_buyer", buyer, op)).rejects.toThrow();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("conserva la mensualidad independiente y rechaza períodos truncados o incoherentes", () => {
    expect(manualSubscriptionTaskSchema.parse(task()).provider_invoice_id).toBe("in_synthetic001");
    for (const invalid of [
      { ...task(), period_end: null },
      { ...task(), period_end: task().period_start },
      { ...task(), vat_cents: 6301 },
    ]) expect(() => manualSubscriptionTaskSchema.parse(invalid)).toThrow();
  });
  it("no acepta como emitida una factura sin validación o con PDF público/ajeno", () => {
    for (const invalid of [
      { ...issued(), buyer_validated: false },
      { ...issued(), invoice: { ...issued().invoice, pdf_object_key: "https://foreign.invalid/fiscal.pdf" } },
      { ...issued(), invoice: { ...issued().invoice, pdf_object_key: "subscription-invoices/" + op + "/fiscal.pdf" } },
      { ...issued(), invoice: { ...issued().invoice, pdf_object_key: "subscription-invoices/" + org + "/../fiscal.pdf" } },
    ]) expect(() => manualSubscriptionTaskSchema.parse(invalid)).toThrow();
  });
  it("la declaración de envío requiere factura, destinatario y fecha coherentes; nunca se etiqueta delivered", () => {
    const sent = { sent_at: "2026-11-08T09:30:00Z", recipient: buyer.email, reference: "Correo ficticio 001" };
    expect(validateManualInvoiceCommand(issued(), "report_sent", sent)).toEqual(sent);
    expect(() => validateManualInvoiceCommand(task(), "report_sent", sent)).toThrow();
    expect(() => validateManualInvoiceCommand(issued(), "report_sent", { ...sent, recipient: "foreign@example.invalid" })).toThrow();
    expect(() => validateManualInvoiceCommand(issued(), "report_sent", { ...sent, sent_at: stamp })).toThrow();
    expect(() => manualSubscriptionTaskSchema.parse({ ...issued(), status: "delivered", dispatch: sent })).toThrow();
  });
  it("una incidencia cierra el circuito sin borrar el pago ni autorizar licencias", async () => {
    const next = { ...task(), status: "needs_review", row_version: 2, review_reason: "customer_data_invalid" };
    const f = client({ task: next, replayed: false });
    expect((await mutateManualSubscriptionInvoice(f.value, task(), "needs_review", { reason: "customer_data_invalid" }, op)).status).toBe("needs_review");
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(() => validateManualInvoiceCommand(manualSubscriptionTaskSchema.parse(next), "needs_review", { reason: "dispatch_failure" })).toThrow();
  });
});

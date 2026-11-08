import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/database.types";
import type { ManualSubscriptionTask } from "../src/domain/manual-subscription-admin";
import { scopedManualDocumentAck } from "../src/domain/manual-fiscal-documents";
import {
  downloadManualFiscalPdf, loadManualDocumentCapabilities, manualPdfHash,
  ManualDocumentError, uploadManualFiscalPdf,
} from "../src/integrations/supabase/manual-fiscal-documents";
import { loadManualSubscriptionTask, ManualInvoiceAdminError, mutateManualSubscriptionInvoice } from "../src/integrations/supabase/manual-subscription-admin";
const uid = "fc640000-0000-4000-8000-000000000001";
const org = "fc640000-0000-4000-8000-000000000002";
const tid = "fc640000-0000-4000-8000-000000000003";
const doc = "fc640000-0000-4000-8000-000000000004";
const operation = "fc640000-0000-4000-8000-000000000005";
const file = () => new File(["%PDF-1.7\nDocumento ficticio, no fiscal.\n%%EOF\n"], "factura-ficticia.pdf", { type: "application/pdf" });
function task(): ManualSubscriptionTask {
  return { id: tid, buyer_company_id: org, buyer_company_name: "Comprador ficticio",
    buyer_tax_id: "DEMO-PDF", buyer_address: "Domicilio ficticio 50", buyer_email: "buyer@example.invalid",
    buyer_validated: true, buyer_snapshot_origin: "operator_validated", provider_payment_id: "pi_TestPdf",
    provider_invoice_id: null, period_start: null, period_end: null, amount_cents: 36300,
    currency: "EUR", paid_at: "2026-11-08T08:00:00Z", status: "awaiting_issue", row_version: 2,
    invoice: null, dispatch: null, review_reason: null };
}
async function ack() {
  const pdf = file();
  return { document: { document_id: doc, task_id: tid, object_key: "subscription-invoices/" + org + "/" + tid + "/" + doc + ".pdf",
    sha256: await manualPdfHash(pdf), size_bytes: pdf.size }, fiscal_validity_verified: false };
}
function fixture(data: unknown, error: unknown = null, response?: Response) {
  const invoke = vi.fn().mockResolvedValue({ data, error, response });
  const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: uid }, access_token: "synthetic-user-token" } }, error: null });
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: uid } }, error: null });
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  return { value: { functions: { invoke }, auth: { getSession, getUser }, rpc } as unknown as SupabaseClient<Database>, invoke, getSession, getUser, rpc };
}
async function issued() {
  const proof = await ack();
  return { ...task(), row_version: 3, status: "awaiting_send" as const, invoice: {
    invoice_number: "DEMO-001", ticketbai_reference: "DEMO-TBAI-001", issued_at: "2026-11-08T09:00:00Z",
    pdf_object_key: proof.document.object_key, pdf_sha256: proof.document.sha256,
  } };
}
describe("cliente de PDF privado: identidad vinculada, ACK scoped y resultados inciertos", () => {
  it("readiness procede del worker nuevo y respeta los dos flags", async () => {
    const f = fixture({ available: true, document_upload_ready: false, downloads_ready: false });
    expect(await loadManualDocumentCapabilities(f.value, uid)).toEqual({ available: true, document_upload_ready: false, downloads_ready: false });
    expect(f.invoke).toHaveBeenCalledWith("company-manual-invoices/capabilities", {
      body: {}, headers: { Authorization: "Bearer synthetic-user-token" }, signal: undefined, timeout: 12000,
    });
    expect(f.getUser).toHaveBeenCalledWith("synthetic-user-token");
  });
  it("no acepta readiness contradictorio o un worker ausente como activo", async () => {
    for (const data of [
      { available: false, document_upload_ready: true, downloads_ready: true },
      { available: true, document_upload_ready: true, downloads_ready: false },
      { available: true },
    ]) await expect(loadManualDocumentCapabilities(fixture(data).value, uid)).rejects.toBeInstanceOf(ManualDocumentError);
    await expect(loadManualDocumentCapabilities(fixture(null, Error("private"), new Response(null, { status: 404 })).value, uid)).rejects.toMatchObject({ kind: "unavailable" });
  });
  it("envía sólo archivo, tarea, versión y operación; rutas y hashes vienen del ACK", async () => {
    const proof = await ack(), f = fixture(proof), pdf = file();
    expect(await uploadManualFiscalPdf(f.value, task(), pdf, operation, uid)).toEqual(proof);
    const options = f.invoke.mock.calls[0][1] as { body: FormData; headers: Record<string, string> };
    expect([...options.body.keys()].sort()).toEqual(["action", "expected_version", "file", "operation_id", "task_id"]);
    expect(options.body.get("file")).toBe(pdf);
    expect(options.body.get("expected_version")).toBe("2");
    expect(options.body.get("operation_id")).toBe(operation);
    expect(options.headers).toEqual({ Authorization: "Bearer synthetic-user-token" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("rechaza ACK ajeno, incompleto o que alegue certificación fiscal", async () => {
    const proof = await ack();
    for (const invalid of [
      { ...proof, document: { ...proof.document, task_id: uid } },
      { ...proof, document: { ...proof.document, object_key: "subscription-invoices/" + uid + "/" + tid + "/" + doc + ".pdf" } },
      { ...proof, document: { ...proof.document, document_id: uid } },
      { ...proof, document: { ...proof.document, size_bytes: proof.document.size_bytes + 1 } },
      { ...proof, document: { ...proof.document, sha256: "a".repeat(64) } },
      { ...proof, fiscal_validity_verified: true },
      { ...proof, nonce: "private-not-for-browser" },
    ]) await expect(uploadManualFiscalPdf(fixture(invalid).value, task(), file(), operation, uid)).rejects.toMatchObject({ kind: "invalid" });
  });
  it("el origen y la identidad de tarea se verifican incluso al validar un ACK sin red", async () => {
    const proof = await ack();
    expect(() => scopedManualDocumentAck(proof, { ...task(), id: uid }, file().size)).toThrow();
    expect(() => scopedManualDocumentAck(proof, { ...task(), buyer_company_id: uid }, file().size)).toThrow();
  });
  it("no inicia cargas con comprador sin contrastar o un archivo inválido", async () => {
    const f = fixture(await ack());
    for (const [row, pdf] of [
      [{ ...task(), buyer_validated: false }, file()],
      [task(), new File(["texto"], "not-pdf.txt", { type: "text/plain" })],
    ] as const) await expect(uploadManualFiscalPdf(f.value, row, pdf, operation, uid)).rejects.toMatchObject({ kind: "invalid" });
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it("no envía el PDF si la sesión cambió de usuario aunque conserve la misma interfaz", async () => {
    const f = fixture(await ack());
    f.getSession.mockResolvedValue({ data: { session: { user: { id: org }, access_token: "another-synthetic-token" } }, error: null });
    await expect(uploadManualFiscalPdf(f.value, task(), file(), operation, uid)).rejects.toMatchObject({ kind: "denied" });
    expect(f.invoke).not.toHaveBeenCalled();
    expect(f.getUser).not.toHaveBeenCalled();
  });
  it("tampoco acepta la identidad de sesión sin verificarla en Auth", async () => {
    const f = fixture(await ack());
    f.getUser.mockResolvedValue({ data: { user: { id: org } }, error: null });
    await expect(uploadManualFiscalPdf(f.value, task(), file(), operation, uid)).rejects.toMatchObject({ kind: "denied" });
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it("un resultado incierto no reintenta automáticamente y un reintento explícito conserva operation_id", async () => {
    const proof = await ack(), f = fixture(proof);
    f.invoke.mockResolvedValueOnce({ data: null, error: Error("private-provider-detail"), response: new Response(null, { status: 503 }) });
    await expect(uploadManualFiscalPdf(f.value, task(), file(), operation, uid)).rejects.toMatchObject({ kind: "uncertain" });
    expect(f.invoke).toHaveBeenCalledTimes(1);
    expect(await uploadManualFiscalPdf(f.value, task(), file(), operation, uid)).toEqual(proof);
    expect(f.invoke).toHaveBeenCalledTimes(2);
    expect(f.invoke.mock.calls.map((call) => (call[1].body as FormData).get("operation_id"))).toEqual([operation, operation]);
  });
  it("la cancelación de contexto descarta un ACK tardío sin devolver metadatos", async () => {
    const controller = new AbortController(), proof = await ack(), f = fixture(proof);
    f.invoke.mockImplementationOnce(async () => { controller.abort(); return { data: proof, error: null }; });
    await expect(uploadManualFiscalPdf(f.value, task(), file(), operation, uid, controller.signal)).rejects.toMatchObject({ kind: "cancelled" });
    expect(f.invoke).toHaveBeenCalledTimes(1);
  });
  it("devuelve un Blob comprobado y pide la descarga por IDs, sin URL o path del cliente", async () => {
    const row = await issued(), blob = file();
    const response = new Response(blob, { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store, private" } });
    const f = fixture(blob, null, response);
    expect(await downloadManualFiscalPdf(f.value, row, uid)).toBe(blob);
    const options = f.invoke.mock.calls[0][1] as { body: Record<string, unknown> };
    expect(options.body).toMatchObject({ action: "download", task_id: tid, expected_version: 3, document_id: doc });
    expect(options.body).not.toHaveProperty("object_key");
    expect(options.body).not.toHaveProperty("sha256");
  });
  it("no descarga sin privacidad de caché, MIME o hash coherentes", async () => {
    const row = await issued();
    for (const [blob, type, cache] of [
      [file(), "application/pdf", "public, max-age=600"],
      [file(), "text/html", "no-store, private"],
      [new Blob(["%PDF-1.7\nDocumento alterado\n%%EOF"], { type: "application/pdf" }), "application/pdf", "no-store, private"],
    ] as const) {
      const f = fixture(blob, null, new Response(blob, { headers: { "Content-Type": type, "Cache-Control": cache } }));
      await expect(downloadManualFiscalPdf(f.value, row, uid)).rejects.toMatchObject({ kind: "invalid" });
    }
  });
  it("una lectura de otra identidad se rechaza sin llamar al worker", async () => {
    const f = fixture(file());
    f.getUser.mockResolvedValue({ data: { user: { id: org } }, error: null });
    await expect(downloadManualFiscalPdf(f.value, await issued(), uid)).rejects.toMatchObject({ kind: "denied" });
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it("errores HTTP o lanzados no filtran detalles privados de transporte", async () => {
    const f = fixture(null, Error("private-provider-key"), new Response(null, { status: 403 }));
    await expect(uploadManualFiscalPdf(f.value, task(), file(), operation, uid)).rejects.not.toThrow("private-provider-key");
    f.invoke.mockRejectedValueOnce(Error("private-provider-thrown"));
    await expect(uploadManualFiscalPdf(f.value, task(), file(), operation, uid)).rejects.not.toThrow("private-provider-thrown");
  });
  it("fija el token también en el RPC de registro aunque se instale otra sesión entre awaits", async () => {
    const f = fixture(null);
    f.getUser.mockImplementationOnce(async () => {
      f.getSession.mockResolvedValue({ data: { session: { user: { id: org }, access_token: "new-session-synthetic" } }, error: null });
      return { data: { user: { id: uid } }, error: null };
    });
    const next = { ...task(), row_version: 3, status: "needs_review" as const, review_reason: "amount_mismatch" as const };
    const pending = Promise.resolve({ data: { task: next, replayed: false }, error: null });
    const setHeader = vi.fn(() => pending);
    Object.assign(pending, { setHeader });
    f.rpc.mockReturnValue(pending);
    expect(await mutateManualSubscriptionInvoice(f.value, task(), "needs_review", { reason: "amount_mismatch" }, operation, uid)).toEqual(next);
    expect(setHeader).toHaveBeenCalledWith("Authorization", "Bearer synthetic-user-token");
    expect(f.rpc.mock.calls[0][1].p_data).toEqual({ reason: "amount_mismatch" });
    expect(f.rpc.mock.calls[0][1]).not.toHaveProperty("actor_id");
  });
  it("un refresh de otra cuenta se detiene antes del RPC y se etiqueta para limpiar el formulario", async () => {
    const f = fixture(null);
    f.getSession.mockResolvedValue({ data: { session: { user: { id: org }, access_token: "other-session-synthetic" } }, error: null });
    await expect(loadManualSubscriptionTask(f.value, tid, undefined, uid)).rejects.toMatchObject({ permissionDenied: true });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("consulta el estado incierto por tarea exacta y preserva denegación tipada", async () => {
    const f = fixture(null);
    f.rpc.mockResolvedValueOnce({ data: { items: [task()], next_cursor: null }, error: null });
    expect(await loadManualSubscriptionTask(f.value, tid)).toEqual(task());
    f.rpc.mockResolvedValueOnce({ data: { items: [{ ...task(), id: uid }], next_cursor: null }, error: null });
    await expect(loadManualSubscriptionTask(f.value, tid)).rejects.toThrow();
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "private" } });
    await expect(loadManualSubscriptionTask(f.value, tid)).rejects.toBeInstanceOf(ManualInvoiceAdminError);
  });
});

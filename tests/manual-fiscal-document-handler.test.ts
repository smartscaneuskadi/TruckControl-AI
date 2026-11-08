import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createManualFiscalDocumentHandler, MAX_FISCAL_PDF_BYTES } from "../supabase/functions/company-manual-invoices/handler.ts";
import type { FiscalDocumentGateway, FiscalDocumentIdentity, FiscalDocumentTask, FiscalDocumentReservation, StoredFiscalDocument } from "../supabase/functions/company-manual-invoices/handler.ts";
const actor: FiscalDocumentIdentity = { id: "fc620000-0000-4000-8000-000000000001", session_id: "fc620000-0000-4000-8000-000000000002" };
const task: FiscalDocumentTask = { id: "fc620000-0000-4000-8000-000000000003", buyer_company_id: "fc620000-0000-4000-8000-000000000004",
  row_version: 2, status: "awaiting_issue", buyer_validated: true };
const operation = "fc620000-0000-4000-8000-000000000005";
const docId = "fc620000-0000-4000-8000-000000000006";
const nonce = "fc620000-0000-4000-8000-000000000007";
const pdf = new TextEncoder().encode("%PDF-1.7\nDocumento ficticio, NO factura fiscal.\n%%EOF\n");
const hash = createHash("sha256").update(pdf).digest("hex");
const doc: StoredFiscalDocument = { document_id: docId, task_id: task.id, sha256: hash, size_bytes: pdf.byteLength,
  object_key: "subscription-invoices/" + task.buyer_company_id + "/" + task.id + "/" + docId + ".pdf" };
const reservation: FiscalDocumentReservation = { ...doc, operation_id: operation, nonce };
const headers = { Origin: "https://truckcontrolai.com", Authorization: "Bearer synthetic.jwt.token.long.enough" };
function fixture() {
  const objects = new Map<string, Uint8Array>();
  const gateway: FiscalDocumentGateway = {
    authenticate: vi.fn(async () => actor),
    task: vi.fn(async () => ({ ...task })),
    reserve: vi.fn(async () => ({ ...reservation })),
    complete: vi.fn(async () => ({ ...doc, nonce: "must-never-return-to-browser" })),
    document: vi.fn(async () => ({ ...doc })),
    read: vi.fn(async (path) => objects.get(path) ?? null),
    put: vi.fn(async (path, bytes) => { if (objects.has(path)) throw Error("No overwrite"); objects.set(path, new Uint8Array(bytes)); }),
  };
  return { gateway, objects, handler: createManualFiscalDocumentHandler(gateway) };
}
function upload(file: Uint8Array = pdf, type = "application/pdf", metadata: Record<string, string> = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries({ action: "upload", task_id: task.id, expected_version: "2", operation_id: operation, ...metadata })) form.set(name, value);
  form.set("file", new File([new Uint8Array(file)], "ignored-original-name.pdf", { type }));
  return new Request("https://edge.invalid/company-manual-invoices", { method: "POST", headers, body: form });
}
function download(changes: Record<string, unknown> = {}) {
  return new Request("https://edge.invalid/company-manual-invoices", { method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "download", task_id: task.id, expected_version: 2, operation_id: operation, document_id: docId, ...changes }) });
}
describe("PDF fiscal privado: transporte e integridad, nunca certificación TicketBAI", () => {
  it("rechaza orígenes ajenos y la demo antes de autenticar o acceder a almacenamiento", async () => {
    for (const origin of ["https://foreign.invalid", "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site"]) {
      const f = fixture(), request = upload();
      const result = await f.handler(new Request(request, { headers: { ...Object.fromEntries(request.headers), Origin: origin } }));
      expect(result.status).toBe(403);
      expect(f.gateway.authenticate).not.toHaveBeenCalled();
      expect(f.gateway.put).not.toHaveBeenCalled();
      expect(result.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });
  it("requiere JWT y sesión verificados sin aceptar identidad del cuerpo", async () => {
    const f = fixture(), request = upload();
    expect((await f.handler(new Request(request, { headers: { Origin: headers.Origin } }))).status).toBe(401);
    vi.mocked(f.gateway.authenticate).mockResolvedValue(null);
    expect((await f.handler(upload())).status).toBe(401);
    expect(f.gateway.reserve).not.toHaveBeenCalled();
  });
  it("el hash se calcula en servidor y el registro no certifica la validez fiscal", async () => {
    const f = fixture(), result = await f.handler(upload());
    expect(result.status).toBe(200);
    const payload = await result.json();
    expect(payload).toEqual({ document: doc, fiscal_validity_verified: false });
    expect(JSON.stringify(payload)).not.toContain("nonce");
    expect(f.gateway.reserve).toHaveBeenCalledWith(actor, task, operation, hash, pdf.byteLength);
    expect(f.gateway.put).toHaveBeenCalledOnce();
    expect(f.gateway.complete).toHaveBeenCalledWith(actor, task, reservation);
    expect(f.gateway.task).toHaveBeenCalledTimes(2);
    expect(result.headers.get("Cache-Control")).toBe("no-store, private");
  });
  it("rechaza MIME y contenido que no sea transporte PDF antes de reservar", async () => {
    const f = fixture();
    expect((await f.handler(upload(pdf, "text/html"))).status).toBe(415);
    expect((await f.handler(upload(new TextEncoder().encode("<script>not a PDF</script>")))).status).toBe(415);
    expect(f.gateway.reserve).not.toHaveBeenCalled();
    expect(f.gateway.put).not.toHaveBeenCalled();
  });
  it("aplica el límite real de 10MiB aunque Content-Length no exista", async () => {
    const f = fixture(), bytes = new Uint8Array(MAX_FISCAL_PDF_BYTES + 1);
    bytes.set(new TextEncoder().encode("%PDF-1.7"));
    expect((await f.handler(upload(bytes))).status).toBe(413);
    expect(f.gateway.reserve).not.toHaveBeenCalled();
  });
  it("cuenta el cuerpo real aunque el cliente mienta en Content-Length", async () => {
    const f = fixture();
    const request = new Request("https://edge.invalid/", { method: "POST",
      headers: { ...headers, "Content-Type": "application/json", "Content-Length": "1" }, body: "x".repeat(5000) });
    expect((await f.handler(request)).status).toBe(413);
    expect(f.gateway.document).not.toHaveBeenCalled();
  });
  it("requiere validación de comprador y CAS antes de escribir bytes", async () => {
    for (const state of [{ ...task, buyer_validated: false }, { ...task, row_version: 3 }, { ...task, status: "needs_review" }]) {
      const f = fixture(); vi.mocked(f.gateway.task).mockResolvedValue(state);
      expect((await f.handler(upload())).status).toBe(409);
      expect(f.gateway.reserve).not.toHaveBeenCalled();
      expect(f.gateway.put).not.toHaveBeenCalled();
    }
  });
  it("no admite rutas, hashes o nonces de una reserva ajena", async () => {
    for (const changed of [
      { ...reservation, task_id: actor.id }, { ...reservation, object_key: "https://public.invalid/fiscal.pdf" },
      { ...reservation, sha256: "b".repeat(64) }, { ...reservation, nonce: "" },
      { ...reservation, operation_id: actor.id }, { ...reservation, document_id: actor.id },
    ]) {
      const f = fixture(); vi.mocked(f.gateway.reserve).mockResolvedValue(changed);
      expect((await f.handler(upload())).status).toBe(409);
      expect(f.gateway.put).not.toHaveBeenCalled();
      expect(f.gateway.complete).not.toHaveBeenCalled();
    }
  });
  it("un servicio sin habilitar no crea objetos ni prueba disponibilidad comercial", async () => {
    const f = fixture(); vi.mocked(f.gateway.reserve).mockResolvedValue(null);
    expect((await f.handler(upload())).status).toBe(503);
    expect(f.gateway.put).not.toHaveBeenCalled();
  });
  it("recupera un objeto idéntico por la misma reserva sin sobrescribirlo", async () => {
    const f = fixture(); f.objects.set(doc.object_key, pdf);
    expect((await f.handler(upload())).status).toBe(200);
    expect(f.gateway.put).not.toHaveBeenCalled();
    expect(f.gateway.complete).toHaveBeenCalledOnce();
  });
  it("un objeto previo distinto queda privado sin sobrescritura ni evidencia confirmada", async () => {
    const f = fixture(); f.objects.set(doc.object_key, new TextEncoder().encode("%PDF-1.7\nContenido distinto\n%%EOF"));
    expect((await f.handler(upload())).status).toBe(409);
    expect(f.gateway.put).not.toHaveBeenCalled();
    expect(f.gateway.complete).not.toHaveBeenCalled();
  });
  it("una confirmación incierta conserva el objeto y un reintento explícito no repite upload", async () => {
    const f = fixture(); vi.mocked(f.gateway.complete).mockResolvedValueOnce(null);
    expect((await f.handler(upload())).status).toBe(503);
    expect(f.objects.has(doc.object_key)).toBe(true);
    expect((await f.handler(upload())).status).toBe(200);
    expect(f.gateway.put).toHaveBeenCalledTimes(1);
    expect(f.gateway.complete).toHaveBeenCalledTimes(2);
  });
  it("rol o versión revocados durante la carga impiden confirmar la evidencia", async () => {
    for (const next of [null, { ...task, row_version: 3 }]) {
      const f = fixture(); vi.mocked(f.gateway.task).mockResolvedValueOnce(task).mockResolvedValueOnce(next);
      expect([403, 409]).toContain((await f.handler(upload())).status);
      expect(f.gateway.complete).not.toHaveBeenCalled();
      expect(f.objects.has(doc.object_key)).toBe(true);
    }
  });
  it("sirve los bytes autorizados sin URL firmada/pública y sin caché", async () => {
    const f = fixture(); f.objects.set(doc.object_key, pdf);
    const result = await f.handler(download());
    expect(result.status).toBe(200);
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(pdf);
    expect(result.headers.get("Content-Type")).toBe("application/pdf");
    expect(result.headers.get("Cache-Control")).toBe("no-store, private");
    expect(result.headers.get("Content-Disposition")).toBe('attachment; filename="factura-fiscal.pdf"');
    expect(result.headers.get("Location")).toBeNull();
    expect(f.gateway.task).toHaveBeenCalledTimes(2);
  });
  it("no devuelve documentos ajenos o alterados y vuelve a comprobar el rol antes de exponer bytes", async () => {
    const foreign = fixture(); vi.mocked(foreign.gateway.document).mockResolvedValue({ ...doc, task_id: actor.id });
    expect((await foreign.handler(download())).status).toBe(403);
    expect(foreign.gateway.read).not.toHaveBeenCalled();
    const changed = fixture(); changed.objects.set(doc.object_key, new TextEncoder().encode("%PDF-1.7\nAlterado\n%%EOF"));
    expect((await changed.handler(download())).status).toBe(409);
    const revoked = fixture(); revoked.objects.set(doc.object_key, pdf);
    vi.mocked(revoked.gateway.task).mockResolvedValueOnce(task).mockResolvedValueOnce(null);
    expect((await revoked.handler(download())).status).toBe(403);
  });
  it("no filtra diagnósticos, credenciales o errores privados del proveedor", async () => {
    const f = fixture(); vi.mocked(f.gateway.reserve).mockRejectedValue(Error("private-secret-synthetic"));
    const result = await f.handler(upload());
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private-secret");
    expect(f.gateway.put).not.toHaveBeenCalled();
  });
});

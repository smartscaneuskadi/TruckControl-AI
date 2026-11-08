import { productionBillingOrigins } from "../_shared/billing-origins.ts";

/** Transport checks never certify a PDF as a valid TicketBAI invoice. */
export const MAX_FISCAL_PDF_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_FISCAL_PDF_BYTES + 65536;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hashPattern = /^[a-f0-9]{64}$/;
export interface FiscalDocumentIdentity { id: string; session_id: string }
export interface FiscalDocumentTask {
  id: string; buyer_company_id: string; row_version: number;
  status: string; buyer_validated: boolean;
}
export interface StoredFiscalDocument {
  document_id: string; task_id: string; object_key: string; sha256: string; size_bytes: number;
}
export interface FiscalDocumentReservation extends StoredFiscalDocument {
  operation_id: string; nonce: string;
}
export interface FiscalDocumentGateway {
  authenticate(token: string): Promise<FiscalDocumentIdentity | null>;
  task(token: string, task: string): Promise<FiscalDocumentTask | null>;
  reserve(actor: FiscalDocumentIdentity, task: FiscalDocumentTask, operation: string, sha256: string, size: number): Promise<FiscalDocumentReservation | null>;
  complete(actor: FiscalDocumentIdentity, task: FiscalDocumentTask, reservation: FiscalDocumentReservation): Promise<StoredFiscalDocument | null>;
  document(actor: FiscalDocumentIdentity, task: FiscalDocumentTask, operation: string, document: string): Promise<StoredFiscalDocument | null>;
  read(path: string): Promise<Uint8Array | null>;
  put(path: string, bytes: Uint8Array): Promise<void>;
}
class Fault extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
async function boundedBody(request: Request, maximum: number) {
  const claimed = request.headers.get("Content-Length");
  if (claimed && (!/^\d+$/.test(claimed) || Number(claimed) > maximum)) throw new Fault(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new Fault(400, "invalid_request");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) throw new Fault(413, "body_too_large");
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
async function sha256(bytes: Uint8Array) {
  const result = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function validPdf(bytes: Uint8Array) {
  return bytes.byteLength >= 8 && bytes.byteLength <= MAX_FISCAL_PDF_BYTES &&
    String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}
function documentMatches(document: StoredFiscalDocument | null, task: FiscalDocumentTask) {
  return Boolean(document && uuid.test(document.document_id) && document.task_id === task.id &&
    document.object_key === "subscription-invoices/" + task.buyer_company_id + "/" + task.id + "/" + document.document_id + ".pdf" &&
    hashPattern.test(document.sha256) && Number.isSafeInteger(document.size_bytes) &&
    document.size_bytes >= 8 && document.size_bytes <= MAX_FISCAL_PDF_BYTES);
}
function sameDocument(first: StoredFiscalDocument, second: StoredFiscalDocument) {
  return first.document_id === second.document_id && first.task_id === second.task_id &&
    first.object_key === second.object_key && first.sha256 === second.sha256 &&
    first.size_bytes === second.size_bytes;
}
async function checkedTask(gateway: FiscalDocumentGateway, token: string, id: string, version: number, upload: boolean) {
  const task = await gateway.task(token, id);
  if (!task || task.id !== id || !uuid.test(task.buyer_company_id)) throw new Fault(403, "operator_required");
  if (!Number.isSafeInteger(task.row_version) || task.row_version !== version) throw new Fault(409, "version_conflict");
  if (upload && (task.status !== "awaiting_issue" || !task.buyer_validated)) throw new Fault(409, "buyer_validation_required");
  return task;
}
function version(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value < Number.MAX_SAFE_INTEGER;
}
export function createManualFiscalDocumentHandler(gateway: FiscalDocumentGateway) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("Origin");
    const allowed = origin !== null && (productionBillingOrigins as readonly string[]).includes(origin);
    const headers: Record<string, string> = {
      "Cache-Control": "no-store, private", "Pragma": "no-cache", "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff", "Vary": "Origin", "Content-Type": "application/json",
      ...(allowed ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
        "Access-Control-Allow-Methods": "POST,OPTIONS" } : {}),
    };
    const reply = (status: number, value: object) => Response.json(value, { status, headers });
    if (!allowed) return reply(403, { error: "origin_denied" });
    if (request.method === "OPTIONS") return reply(200, {});
    if (request.method !== "POST") return reply(405, { error: "method_not_allowed" });
    const token = /^Bearer ([A-Za-z0-9._-]{20,16384})$/.exec(request.headers.get("Authorization") ?? "")?.[1];
    if (!token) return reply(401, { error: "authentication_required" });
    try {
      const actor = await gateway.authenticate(token);
      if (!actor || !uuid.test(actor.id) || !uuid.test(actor.session_id)) return reply(401, { error: "authentication_required" });
      const contentType = request.headers.get("Content-Type") ?? "";
      if (contentType.toLowerCase().startsWith("multipart/form-data;")) {
        const bytes = await boundedBody(request, MAX_MULTIPART_BYTES);
        let form: FormData;
        try { form = await new Request("https://upload.invalid/", { method: "POST", headers: { "Content-Type": contentType }, body: bytes }).formData(); }
        catch { throw new Fault(400, "invalid_request"); }
        const allowedKeys = new Set(["action", "task_id", "expected_version", "operation_id", "file"]);
        if ([...form.keys()].some((key) => !allowedKeys.has(key)) || [...allowedKeys].some((key) => form.getAll(key).length !== 1) ||
            form.get("action") !== "upload") throw new Fault(400, "invalid_request");
        const taskId = form.get("task_id"), operation = form.get("operation_id"), expectedText = form.get("expected_version");
        const expected = typeof expectedText === "string" && /^[1-9]\d{0,15}$/.test(expectedText) ? Number(expectedText) : null;
        if (typeof taskId !== "string" || !uuid.test(taskId) || typeof operation !== "string" || !uuid.test(operation) || !version(expected)) throw new Fault(400, "invalid_request");
        let task = await checkedTask(gateway, token, taskId, expected as number, true);
        const file = form.get("file");
        if (!(file instanceof File) || file.type !== "application/pdf") throw new Fault(415, "pdf_required");
        if (file.size > MAX_FISCAL_PDF_BYTES) throw new Fault(413, "pdf_too_large");
        const pdf = new Uint8Array(await file.arrayBuffer());
        if (!validPdf(pdf)) throw new Fault(415, "invalid_pdf_transport");
        const hash = await sha256(pdf);
        const reserved = await gateway.reserve(actor, task, operation, hash, pdf.byteLength);
        if (!reserved) throw new Fault(503, "document_upload_unavailable");
        if (!documentMatches(reserved, task) || reserved.operation_id !== operation || !uuid.test(reserved.nonce) ||
            reserved.sha256 !== hash || reserved.size_bytes !== pdf.byteLength) throw new Fault(409, "reservation_mismatch");
        // Explicit retries can recover the same immutable object. Never upsert,
        // auto-retry an uncertain write or delete an object after an uncertain RPC.
        let stored = await gateway.read(reserved.object_key);
        if (stored === null) {
          await gateway.put(reserved.object_key, pdf);
          stored = await gateway.read(reserved.object_key);
        }
        if (!stored || !validPdf(stored) || stored.byteLength !== pdf.byteLength || await sha256(stored) !== hash) throw new Fault(409, "stored_document_mismatch");
        const rechecked = await checkedTask(gateway, token, taskId, expected as number, true);
        if (rechecked.buyer_company_id !== task.buyer_company_id) throw new Fault(403, "operator_required");
        task = rechecked;
        const completed = await gateway.complete(actor, task, reserved);
        if (!documentMatches(completed, task) || !sameDocument(reserved, completed!)) throw new Fault(503, "document_confirmation_unavailable");
        return reply(200, { document: { document_id: completed!.document_id, task_id: completed!.task_id,
          object_key: completed!.object_key, sha256: completed!.sha256, size_bytes: completed!.size_bytes }, fiscal_validity_verified: false });
      }
      if (!/^application\/json(?:\s*;|$)/i.test(contentType)) throw new Fault(415, "unsupported_content_type");
      const raw = new TextDecoder("utf-8", { fatal: true }).decode(await boundedBody(request, 4096));
      let input: Record<string, unknown>;
      try { input = JSON.parse(raw) as Record<string, unknown>; } catch { throw new Fault(400, "invalid_request"); }
      if (!input || Array.isArray(input) || typeof input !== "object" ||
          Object.keys(input).some((key) => !["action", "task_id", "expected_version", "operation_id", "document_id"].includes(key)) ||
          input.action !== "download" || typeof input.task_id !== "string" || !uuid.test(input.task_id) ||
          !version(input.expected_version) || typeof input.operation_id !== "string" || !uuid.test(input.operation_id) ||
          typeof input.document_id !== "string" || !uuid.test(input.document_id)) throw new Fault(400, "invalid_request");
      const task = await checkedTask(gateway, token, input.task_id, input.expected_version as number, false);
      const document = await gateway.document(actor, task, input.operation_id, input.document_id);
      if (!documentMatches(document, task) || document!.document_id !== input.document_id) throw new Fault(403, "document_denied");
      const bytes = await gateway.read(document!.object_key);
      if (!bytes || !validPdf(bytes) || bytes.byteLength !== document!.size_bytes || await sha256(bytes) !== document!.sha256) throw new Fault(409, "stored_document_mismatch");
      // Revalidate the live role/session/version immediately before returning PII.
      const fresh = await checkedTask(gateway, token, input.task_id, input.expected_version as number, false);
      if (fresh.buyer_company_id !== task.buyer_company_id) throw new Fault(403, "operator_required");
      return new Response(new Uint8Array(bytes), { status: 200, headers: {
        ...headers, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="factura-fiscal.pdf"',
        "Content-Length": String(bytes.byteLength),
      } });
    } catch (error) {
      return error instanceof Fault ? reply(error.status, { error: error.code }) : reply(503, { error: "document_service_unavailable" });
    }
  };
}

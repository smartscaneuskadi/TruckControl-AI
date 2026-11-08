import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { z } from "zod";
import {
  MAX_MANUAL_FISCAL_PDF_BYTES, manualDocumentCapabilitiesSchema,
  manualInvoiceDocumentId, scopedManualDocumentAck,
} from "../../domain/manual-fiscal-documents";
import { manualSubscriptionTaskSchema } from "../../domain/manual-subscription-admin";
import type { ManualSubscriptionTask } from "../../domain/manual-subscription-admin";
export class ManualDocumentError extends Error {
  constructor(readonly kind: "denied" | "unavailable" | "conflict" | "uncertain" | "invalid" | "cancelled") {
    super(kind === "denied" ? "Tu sesión ya no permite gestionar estas facturas. Actualiza el acceso."
      : kind === "unavailable" ? "El servicio privado de PDF todavía no está disponible."
        : kind === "conflict" ? "La solicitud ha cambiado. Comprueba su estado antes de continuar."
          : kind === "uncertain" ? "El resultado no está confirmado. Conservamos este intento para que puedas comprobarlo o repetirlo expresamente."
            : kind === "cancelled" ? "La operación se ha interrumpido al cambiar el contexto."
              : "No se ha podido comprobar el PDF de esta solicitud.");
    this.name = "ManualDocumentError";
  }
}
function transportFailure(result: { error: unknown; response?: Response }, writing: boolean, signal?: AbortSignal): never {
  if (signal?.aborted) throw new ManualDocumentError("cancelled");
  const context = result.error && typeof result.error === "object" && "context" in result.error ? result.error.context : null;
  const status = result.response?.status ?? (context instanceof Response ? context.status : null);
  throw new ManualDocumentError(status === 401 || status === 403 ? "denied"
    : status === 409 ? "conflict" : status === 404 ? "unavailable" : status === 503 ? (writing ? "uncertain" : "unavailable")
      : status === 400 || status === 413 || status === 415 ? "invalid" : writing ? "uncertain" : "unavailable");
}
export async function manualInvoiceCredentials(client: SupabaseClient<Database>, expectedUserId: string, signal?: AbortSignal) {
  z.uuid().parse(expectedUserId);
  try {
  const session = await client.auth.getSession();
  const identity = session.data.session;
  if (session.error || !identity || identity.user.id !== expectedUserId) throw new ManualDocumentError("denied");
  const verified = await client.auth.getUser(identity.access_token);
  if (verified.error || verified.data.user?.id !== expectedUserId) throw new ManualDocumentError("denied");
  if (signal?.aborted) throw new ManualDocumentError("cancelled");
  // Bind this request to the verified user's token even if another session is
  // installed before the SDK fetch starts. Never persist or log the token here.
  return { Authorization: "Bearer " + identity.access_token };
  } catch (failure) { if (failure instanceof ManualDocumentError) throw failure; throw new ManualDocumentError("unavailable"); }
}
export async function manualPdfHash(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}
export async function loadManualDocumentCapabilities(client: SupabaseClient<Database>, userId: string, signal?: AbortSignal) {
  const headers = await manualInvoiceCredentials(client, userId, signal);
  const result = await client.functions.invoke("company-manual-invoices/capabilities", { body: {}, headers, signal, timeout: 12000 }).catch(() => { throw new ManualDocumentError(signal?.aborted ? "cancelled" : "unavailable"); });
  if (result.error) transportFailure(result, false, signal);
  if (signal?.aborted) throw new ManualDocumentError("cancelled");
  const parsed = manualDocumentCapabilitiesSchema.safeParse(result.data);
  if (!parsed.success) throw new ManualDocumentError("unavailable");
  return parsed.data;
}
export async function uploadManualFiscalPdf(
  client: SupabaseClient<Database>, taskInput: ManualSubscriptionTask, file: File,
  operationId: string, userId: string, signal?: AbortSignal,
) {
  const task = manualSubscriptionTaskSchema.parse(taskInput);
  z.uuid().parse(operationId);
  if (task.status !== "awaiting_issue" || !task.buyer_validated || !(file instanceof File) ||
      file.type !== "application/pdf" || file.size < 8 || file.size > MAX_MANUAL_FISCAL_PDF_BYTES) throw new ManualDocumentError("invalid");
  const headers = await manualInvoiceCredentials(client, userId, signal);
  const expectedHash = await manualPdfHash(file);
  if (signal?.aborted) throw new ManualDocumentError("cancelled");
  const form = new FormData();
  form.set("action", "upload"); form.set("task_id", task.id);
  form.set("expected_version", String(task.row_version)); form.set("operation_id", operationId);
  form.set("file", file);
  const result = await client.functions.invoke("company-manual-invoices", { body: form, headers, signal, timeout: 120000 }).catch(() => { throw new ManualDocumentError(signal?.aborted ? "cancelled" : "uncertain"); });
  if (result.error) transportFailure(result, true, signal);
  if (signal?.aborted) throw new ManualDocumentError("cancelled");
  try {
    const ack = scopedManualDocumentAck(result.data, task, file.size);
    if (ack.document.sha256 !== expectedHash) throw new ManualDocumentError("invalid");
    return ack;
  } catch { throw new ManualDocumentError("invalid"); }
}
export async function downloadManualFiscalPdf(
  client: SupabaseClient<Database>, taskInput: ManualSubscriptionTask, userId: string, signal?: AbortSignal,
) {
  const task = manualSubscriptionTaskSchema.parse(taskInput);
  if (!task.invoice) throw new ManualDocumentError("invalid");
  const documentId = manualInvoiceDocumentId(task);
  const headers = await manualInvoiceCredentials(client, userId, signal);
  const result = await client.functions.invoke<Blob>("company-manual-invoices", {
    body: { action: "download", task_id: task.id, expected_version: task.row_version,
      operation_id: crypto.randomUUID(), document_id: documentId }, headers, signal, timeout: 30000,
  }).catch(() => { throw new ManualDocumentError(signal?.aborted ? "cancelled" : "unavailable"); });
  if (result.error) transportFailure(result, false, signal);
  if (signal?.aborted) throw new ManualDocumentError("cancelled");
  const blob = result.data, type = result.response?.headers.get("Content-Type")?.split(";")[0].trim();
  if (!(blob instanceof Blob) || type !== "application/pdf" || blob.size < 8 ||
      blob.size > MAX_MANUAL_FISCAL_PDF_BYTES ||
      !result.response?.headers.get("Cache-Control")?.includes("no-store") ||
      !result.response?.headers.get("Cache-Control")?.includes("private") ||
      await manualPdfHash(blob) !== task.invoice.pdf_sha256) throw new ManualDocumentError("invalid");
  if (signal?.aborted) throw new ManualDocumentError("cancelled");
  return blob;
}

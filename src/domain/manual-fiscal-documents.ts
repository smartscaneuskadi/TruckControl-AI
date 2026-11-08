import { z } from "zod";
import type { ManualSubscriptionTask } from "./manual-subscription-admin";
export const MAX_MANUAL_FISCAL_PDF_BYTES = 10 * 1024 * 1024;
export const manualDocumentCapabilitiesSchema = z.object({
  available: z.boolean(), document_upload_ready: z.boolean(), downloads_ready: z.boolean(),
}).refine((value) => (!value.document_upload_ready && !value.downloads_ready) ||
  (value.available && value.document_upload_ready && value.downloads_ready),
{ message: "No se puede confirmar la disponibilidad del servicio documental." });
export type ManualDocumentCapabilities = z.infer<typeof manualDocumentCapabilitiesSchema>;
export const manualDocumentAckSchema = z.strictObject({
  document: z.strictObject({
    document_id: z.uuid(), task_id: z.uuid(), object_key: z.string().max(250),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size_bytes: z.number().int().min(8).max(MAX_MANUAL_FISCAL_PDF_BYTES),
  }),
  fiscal_validity_verified: z.literal(false),
});
export type ManualDocumentAck = z.infer<typeof manualDocumentAckSchema>;
export function scopedManualDocumentAck(raw: unknown, task: ManualSubscriptionTask, expectedSize?: number) {
  const result = manualDocumentAckSchema.parse(raw);
  const document = result.document;
  const wanted = "subscription-invoices/" + task.buyer_company_id + "/" + task.id + "/" + document.document_id + ".pdf";
  if (document.task_id !== task.id || document.object_key !== wanted ||
      (expectedSize !== undefined && document.size_bytes !== expectedSize)) {
    throw Error("El documento no corresponde a esta solicitud.");
  }
  return result;
}
export function manualInvoiceDocumentId(task: ManualSubscriptionTask) {
  const path = task.invoice?.pdf_object_key;
  if (!path) throw Error("La solicitud todavía no tiene un PDF fiscal registrado.");
  const prefix = "subscription-invoices/" + task.buyer_company_id + "/" + task.id + "/";
  if (!path.startsWith(prefix) || !path.endsWith(".pdf")) throw Error("No se puede comprobar el documento de esta solicitud.");
  return z.uuid().parse(path.slice(prefix.length, -4));
}

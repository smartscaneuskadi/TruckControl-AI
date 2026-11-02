import { detectDocumentType, hash, isUuid } from "../_shared/invoice.ts";
import type { MailAccess, MailGateway } from "./handler.ts";
type Data = Record<string, unknown>;
type Result = { status: number; body: Data };
const result = (error: string, status: number): Result => ({
  status,
  body: { error },
});
import { validInvoiceAiStates } from "../_shared/invoice-ai.ts";
function permitted(a: MailAccess | null, write = false) {
  return Boolean(
    a?.active &&
    a.features.gmail &&
    (!write || (a.can_write && a.features.invoice_ai)),
  );
}
/** First billable reading only. The existing unique invoice reservation prevents retries. */
export async function savedInvoiceAi(
  gateway: MailGateway,
  userId: string,
  body: Data,
): Promise<Result> {
  const org = body.organization_id;
  if (!isUuid(org)) return result("invalid_request", 400);
  const analyzing = body.action === "analyze_invoice";
  const keys = analyzing
    ? ["action", "organization_id", "invoice_id", "confirmed"]
    : ["action", "organization_id", "invoice_ids"];
  if (Object.keys(body).some((k) => !keys.includes(k)))
    return result("invalid_request", 400);
  if (
    analyzing
      ? !isUuid(body.invoice_id) || body.confirmed !== true
      : !Array.isArray(body.invoice_ids) ||
        body.invoice_ids.length < 1 ||
        body.invoice_ids.length > 200 ||
        body.invoice_ids.some((id) => !isUuid(id)) ||
        new Set(body.invoice_ids).size !== body.invoice_ids.length
  )
    return result("invalid_request", 400);
  try {
    if (!permitted(await gateway.access(org, userId), analyzing))
      return result("company_access_denied", 403);
    if (!gateway.invoiceAI) return result("invoice_ai_unavailable", 503);
    const context = { organization_id: org, user_id: userId };
    if (!analyzing) {
      const ids = body.invoice_ids as string[];
      const states = await gateway.invoiceAI("status", {
        ...context,
        invoice_ids: ids,
      });
      if (!validInvoiceAiStates(states, ids))
        return result("invoice_ai_unavailable", 502);
      return {
        status: 200,
        body: { enabled: Boolean(await gateway.aiStatus?.()), states },
      };
    }
    if (!gateway.download || !gateway.analyze || !(await gateway.aiStatus?.()))
      return result("invoice_ai_unavailable", 503);
    const identity = { ...context, invoice_id: body.invoice_id as string };
    const prepared = (await gateway.invoiceAI(
      "prepare",
      identity,
    )) as Data | null;
    if (!prepared) return result("invoice_unavailable", 404);
    if (prepared.state === "approved")
      return result("invoice_already_approved", 409);
    if (prepared.state === "attempted")
      return result("invoice_ai_already_attempted", 409);
    if (prepared.state === "too_large")
      return result("invoice_ai_file_too_large", 413);
    const d = prepared.document as Data | undefined;
    if (
      prepared.state !== "available" ||
      prepared.invoice_id !== body.invoice_id ||
      !d ||
      !isUuid(d.id) ||
      typeof prepared.content_hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(prepared.content_hash) ||
      typeof d.object_path !== "string" ||
      !d.object_path.startsWith(`${org}/${d.id}/`) ||
      !/^[A-Za-z0-9._/-]+$/.test(d.object_path) ||
      d.object_path.split("/").some((p) => !p || p === "." || p === "..") ||
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
        String(d.content_type),
      ) ||
      !Number.isInteger(d.size_bytes) ||
      Number(d.size_bytes) < 1 ||
      Number(d.size_bytes) > 6 * 1024 * 1024
    )
      return result("invoice_document_invalid", 409);
    const bytes = await gateway.download(d.object_path);
    if (
      bytes.length !== d.size_bytes ||
      bytes.length > 6 * 1024 * 1024 ||
      detectDocumentType(bytes) !== d.content_type ||
      (await hash(bytes)) !== prepared.content_hash
    )
      return result("invoice_document_invalid", 409);
    if (!permitted(await gateway.access(org, userId), true))
      return result("company_access_denied", 403);
    const current = (await gateway.invoiceAI(
      "prepare",
      identity,
    )) as Data | null;
    if (
      !current ||
      current.state !== "available" ||
      current.invoice_id !== identity.invoice_id ||
      current.content_hash !== prepared.content_hash ||
      (current.document as Data | undefined)?.object_path !== d.object_path
    )
      return result("invoice_ai_state_changed", 409);
    try {
      const applied = await gateway.analyze(
        org,
        userId,
        identity.invoice_id,
        bytes,
        String(d.content_type),
      );
      return applied
        ? { status: 200, body: { analyzed: true } }
        : result("invoice_ai_not_applied", 409);
    } catch {
      // A timeout may have consumed budget. Never repeat a provider request or echo it.
      return result("invoice_ai_not_completed", 502);
    }
  } catch {
    // Configuration, storage and database failures contain no secrets in this response.
    return result("invoice_ai_unavailable", 503);
  }
}

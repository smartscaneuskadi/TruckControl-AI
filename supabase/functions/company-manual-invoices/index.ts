import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createManualFiscalDocumentHandler, MAX_FISCAL_PDF_BYTES } from "./handler.ts";
import type { FiscalDocumentIdentity, FiscalDocumentTask, FiscalDocumentReservation } from "./handler.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, serviceKey, options);
const bucket = "tc-subscription-fiscal";
function actorClient(token: string) {
  return createClient(url, publicKey, {
    ...options, global: { headers: { Authorization: "Bearer " + token } },
  });
}
async function server(action: string, data: Record<string, unknown>) {
  const result = await service.rpc("tc_manual_subscription_document_server", { p_action: action, p_data: data });
  if (result.error) throw Error("Fiscal document database unavailable");
  return result.data;
}
function scope(actor: FiscalDocumentIdentity, task: FiscalDocumentTask, operation: string) {
  return { actor_id: actor.id, session_id: actor.session_id, task_id: task.id,
    expected_version: task.row_version, operation_id: operation };
}
async function verifiedBucket() {
  const result = await service.storage.getBucket(bucket);
  const info = result.data;
  if (result.error || !info || info.public !== false ||
      typeof info.file_size_limit !== "number" || info.file_size_limit < 8 || info.file_size_limit > MAX_FISCAL_PDF_BYTES ||
      !Array.isArray(info.allowed_mime_types) || info.allowed_mime_types.length !== 1 || info.allowed_mime_types[0] !== "application/pdf") {
    throw Error("Dedicated private document bucket unavailable");
  }
}
Deno.serve(createManualFiscalDocumentHandler({
  async authenticate(token) {
    const verified = await service.auth.getUser(token);
    const user = verified.data.user;
    if (verified.error || !user?.email_confirmed_at) return null;
    try {
      // Claims are decoded only AFTER the Auth server verified this exact token.
      const payload = token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
      const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
      if (claims.sub !== user.id || typeof claims.session_id !== "string") return null;
      const admin = await actorClient(token).rpc("tc_admin_manual_subscription_invoices", {
        p_action: "capabilities", p_task_id: null, p_expected: null, p_request_id: null, p_data: {}, p_after: null,
      });
      if (admin.error || admin.data?.available !== true) return null;
      return { id: user.id, session_id: claims.session_id };
    } catch { return null; }
  },
  async task(token, taskId) {
    const result = await actorClient(token).rpc("tc_admin_manual_subscription_invoices", {
      p_action: "detail", p_task_id: taskId, p_expected: null, p_request_id: null, p_data: {}, p_after: null,
    });
    if (result.error || !Array.isArray(result.data?.items) || result.data.items.length !== 1) return null;
    return result.data.items[0];
  },
  async reserve(actor, task, operation, sha256, size) {
    return server("reserve", { ...scope(actor, task, operation), sha256, size_bytes: size });
  },
  async complete(actor, task, reservation: FiscalDocumentReservation) {
    return server("complete", { ...scope(actor, task, reservation.operation_id),
      nonce: reservation.nonce, document_id: reservation.document_id,
      sha256: reservation.sha256, size_bytes: reservation.size_bytes });
  },
  async document(actor, task, operation, documentId) {
    return server("download", { ...scope(actor, task, operation), document_id: documentId });
  },
  async read(path) {
    await verifiedBucket();
    const result = await service.storage.from(bucket).download(path);
    if (result.error) {
      const problem = result.error as unknown as { statusCode?: string | number; status?: number };
      if (Number(problem.statusCode ?? problem.status) === 404) return null;
      throw Error("Fiscal document read unavailable");
    }
    if (!result.data || result.data.size > MAX_FISCAL_PDF_BYTES) throw Error("Fiscal document read rejected");
    return new Uint8Array(await result.data.arrayBuffer());
  },
  async put(path, bytes) {
    await verifiedBucket();
    const result = await service.storage.from(bucket).upload(path, new Uint8Array(bytes), {
      contentType: "application/pdf", cacheControl: "0", upsert: false,
    });
    if (result.error) throw Error("Fiscal document upload uncertain");
  },
}));

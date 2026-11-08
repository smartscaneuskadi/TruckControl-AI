export type NoticeOutcome = "accepted" | "retry_rate" | "retry_busy" | "failed" | "uncertain";
export type NoticeRuntime = { enabled: boolean; providerEnabled: boolean; apiKey: string };
export type ClaimedNotice = {
  id: string; task_id: string; lease_token: string; row_version: number; attempt: number;
  first_attempt_at: string; lease_until: string; mode: "live"; template_version: 1;
};
export interface NoticeGateway {
  config(): Promise<NoticeRuntime | null>;
  claim(): Promise<unknown>;
  finish(notice: ClaimedNotice, outcome: NoticeOutcome, providerId: string | null): Promise<unknown>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fixedRecipient = "pedidos@smartscaneuskadi.com";
const encoder = new TextEncoder();
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function sameSecret(actual: string, expected: string): boolean {
  const a = encoder.encode(actual), b = encoder.encode(expected);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return mismatch === 0 && b.length >= 32;
}
async function limitedText(body: ReadableStream<Uint8Array> | null, maximum: number): Promise<string> {
  if (!body) throw Error("body_missing");
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength; if (length > maximum) throw Error("body_limit");
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const joined = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}
export function parseNoticeClaim(value: unknown, now: number): ClaimedNotice {
  if (!record(value) || value.contract !== "manual-invoice-notice-claim-v1" || !record(value.notice))
    throw Error("claim_invalid");
  const n = value.notice;
  const keys = ["id","task_id","lease_token","row_version","attempt","first_attempt_at","lease_until","mode","template_version"];
  if (Object.keys(n).length !== keys.length || Object.keys(n).some((key) => !keys.includes(key))
    || ![n.id,n.task_id,n.lease_token].every((v) => typeof v === "string" && uuid.test(v))
    || !Number.isSafeInteger(n.row_version) || Number(n.row_version) < 2
    || !Number.isInteger(n.attempt) || Number(n.attempt) < 1 || Number(n.attempt) > 3
    || n.mode !== "live" || n.template_version !== 1
    || typeof n.first_attempt_at !== "string" || typeof n.lease_until !== "string")
    throw Error("claim_invalid");
  const first = Date.parse(n.first_attempt_at), lease = Date.parse(n.lease_until);
  if (!Number.isFinite(first) || !Number.isFinite(lease) || first > now + 5000
    || first + 23 * 3600000 <= now || lease <= now || lease > now + 65000)
    throw Error("claim_expired");
  return n as unknown as ClaimedNotice;
}
export function noticeEmail(notice: ClaimedNotice) {
  // Template/body do not change between retries: Resend keeps this key 24h.
  return {
    from: "TruckControl AI <no-reply@facturas.truckcontrolai.com>",
    to: [fixedRecipient],
    subject: "TruckControl AI: solicitud de factura del servicio",
    text: "Hay una solicitud de factura del servicio pendiente de revisión administrativa.\n\n"
      + "Referencia interna: " + notice.task_id + "\n"
      + "Accede a https://truckcontrolai.com y abre Administración → Facturas del servicio.\n\n"
      + "Emite y envía la factura fiscal válida mediante el procedimiento aprobado de GDTaller/TicketBAI. "
      + "Objetivo operativo: 24–48 h, sujeto a los plazos legales aplicables.\n"
      + "Este aviso no es una factura ni acredita su emisión o entrega.",
  };
}
export function createManualInvoiceNoticeHandler(
  gateway: NoticeGateway,
  workerAuthorization: string,
  transport: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control":"no-store", "Content-Type":"application/json", "Referrer-Policy":"no-referrer" };
    const response = (status: number, value: object) => Response.json(value, { status, headers });
    if (request.method !== "POST") return response(405, { error:"method_not_allowed" });
    if (request.headers.has("Origin")) return response(403, { error:"server_only" });
    const authorization = request.headers.get("Authorization") ?? "";
    if (workerAuthorization.length < 32 || !sameSecret(authorization, "Bearer " + workerAuthorization))
      return response(401, { error:"authorization_required" });
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json"))
      return response(415, { error:"json_required" });
    try {
      const body: unknown = JSON.parse(await limitedText(request.body, 256));
      if (!record(body) || Object.keys(body).length !== 0) return response(400, { error:"empty_object_required" });
    } catch { return response(400, { error:"invalid_request" }); }
    let claimed: ClaimedNotice | null = null;
    try {
      const config = await gateway.config();
      if (!config?.enabled || !config.providerEnabled || !/^re_[A-Za-z0-9_-]{20,256}$/.test(config.apiKey))
        return response(503, { error:"notices_disabled" });
      const rawClaim = await gateway.claim();
      if (rawClaim === null) return response(200, { processed:0, provider_calls:0 });
      claimed = parseNoticeClaim(rawClaim, now());
      let outcome: NoticeOutcome = "uncertain", providerId: string | null = null;
      try {
        const sent = await transport("https://api.resend.com/emails", {
          method:"POST", redirect:"error", signal:AbortSignal.timeout(12000),
          headers:{ Authorization:"Bearer " + config.apiKey, "Content-Type":"application/json",
            "Idempotency-Key":"truckcontrol-manual-invoice-notice-v1/" + claimed.id },
          body:JSON.stringify(noticeEmail(claimed)),
        });
        let result: unknown;
        try { result = JSON.parse(await limitedText(sent.body, 4096)); } catch { result = null; }
        if (sent.ok && record(result) && typeof result.id === "string" && uuid.test(result.id)) {
          outcome = "accepted"; providerId = result.id;
        } else if (sent.status === 429 && record(result) && result.name === "rate_limit_exceeded") {
          outcome = "retry_rate";
        } else if (sent.status === 409 && record(result) && result.name === "concurrent_idempotent_requests") {
          outcome = "retry_busy";
        } else if ([400,401,403,404,422].includes(sent.status)) {
          outcome = "failed";
        }
      } catch { /* May have been accepted: no automatic resend after uncertainty. */ }
      const ack = await gateway.finish(claimed, outcome, providerId);
      if (!record(ack) || ack.contract !== "manual-invoice-notice-finish-v1" || ack.id !== claimed.id
        || !["accepted","retry_wait","uncertain","failed"].includes(String(ack.status))
        || typeof ack.replayed !== "boolean"
        || (outcome === "accepted" ? ack.status !== "accepted"
          : outcome === "failed" ? ack.status !== "failed"
          : outcome === "uncertain" ? ack.status !== "uncertain"
          : !["retry_wait","failed"].includes(String(ack.status)))) throw Error("finish_unconfirmed");
      // This response never claims delivery and never contains provider data.
      return response(200, { processed:1, outcome:ack.status, delivery_verified:false });
    } catch {
      // If the provider accepted but the DB acknowledgment was lost, keep the
      // lease. Its expiry is terminal uncertainty; never issue a blind retry.
      return response(503, { error:claimed ? "notice_result_unconfirmed" : "notices_unavailable" });
    }
  };
}

import {
  emptyInvoice,
  fromBase64,
  hash,
  isUuid,
  randomToken,
} from "../_shared/invoice.ts";
import {
  cleanMailText,
  documentExtension,
  MailInputError,
  MAX_MAIL_BYTES,
  parseMailFile,
} from "../_shared/mail.ts";

type Data = Record<string, unknown>;
export interface MailAccess {
  active: boolean;
  can_write: boolean;
  can_manage: boolean;
  features: Record<string, boolean>;
}
export interface MailGateway {
  authenticate(token: string): Promise<{ id: string } | null>;
  access(org: string, user: string): Promise<MailAccess | null>;
  server<T>(action: string, data: Data): Promise<T>;
  upload(path: string, bytes: Uint8Array, type: string): Promise<void>;
  remove(path: string): Promise<void>;
  aiStatus?(): Promise<boolean>;
  analyze?(
    organizationId: string,
    userId: string,
    invoiceId: string,
    bytes: Uint8Array,
    type: string,
  ): Promise<boolean>;
}
export interface MailConfig {
  origins: string[];
  ingress?: { enabled: boolean; domain: string; signingKey: string };
  now?: () => number;
}
export class MailActionError extends Error {
  constructor(
    public code: string,
    public status: number,
    public rollbackConfirmed = false,
  ) {
    super(code);
  }
}
const enc = new TextEncoder();
const bodyLimit = Math.ceil((MAX_MAIL_BYTES * 4) / 3) + 128 * 1024;
export function ingressReady(config: MailConfig) {
  const v = config.ingress;
  return Boolean(
    v?.enabled &&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      v.domain,
    ) &&
    v.domain.length <= 253 &&
    v.signingKey.length >= 32 &&
    v.signingKey.length <= 512 &&
    !/\s/.test(v.signingKey),
  );
}
export async function readLimited(request: Request, limit: number) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new MailActionError("request_too_large", 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0,
    timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel();
  }, 30000);
  try {
    while (true) {
      const part = await reader.read();
      if (timedOut) throw new MailActionError("request_timeout", 408);
      if (part.done) break;
      size += part.value.length;
      if (size > limit) {
        await reader.cancel();
        throw new MailActionError("request_too_large", 413);
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let position = 0;
    for (const part of chunks) {
      bytes.set(part, position);
      position += part.length;
    }
    return bytes;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
/** HMAC binds the exact raw bytes, timestamp and endpoint purpose, not parsed JSON. */
export async function verifyMailSignature(
  raw: Uint8Array,
  timestamp: string,
  signature: string,
  key: string,
  now: number,
) {
  if (
    !/^\d{10}$/.test(timestamp) ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  const prefix = enc.encode("truckcontrol-mail-v1:" + timestamp + ".");
  const data = new Uint8Array(prefix.length + raw.length);
  data.set(prefix);
  data.set(raw, prefix.length);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    cryptoKey,
    Uint8Array.from(signature.match(/../g)!, (x) => parseInt(x, 16)),
    data,
  );
}

export function createMailHandler(gateway: MailGateway, config: MailConfig) {
  const origins = new Set(config.origins);
  async function allowed(
    org: string,
    user: string,
    write = false,
    manage = false,
  ) {
    const access = await gateway.access(org, user);
    if (
      !access?.active ||
      !access.features.gmail ||
      (write && !access.can_write) ||
      (manage && !access.can_manage)
    )
      throw new MailActionError("company_access_denied", 403);
    return access;
  }
  async function importFile(
    bytes: Uint8Array,
    name: string,
    org: string,
    user: string,
    delivery?: Data,
  ) {
    const parsed = await parseMailFile(bytes, name);
    let imported = 0,
      skipped = parsed.skipped,
      failures = 0,
      analyzed = 0;
    for (const attachment of parsed.attachments) {
      await allowed(org, user, true);
      const identity = {
        organization_id: org,
        user_id: user,
        content_hash: attachment.contentHash,
      };
      if (await gateway.server<boolean>("exists", identity)) {
        skipped++;
        continue;
      }
      const id = crypto.randomUUID(),
        path =
          org + "/" + id + "/document." + documentExtension(attachment.type);
      let uploaded = false;
      try {
        await gateway.upload(path, attachment.bytes, attachment.type);
        uploaded = true;
        const result = await gateway.server<{
          duplicate?: boolean;
          id?: string;
        }>("record_invoice", {
          ...identity,
          ...delivery,
          ...emptyInvoice(),
          message_id: parsed.messageId,
          attachment_id: attachment.attachmentId,
          import_source: delivery
            ? "forwarded_email"
            : parsed.messageId.startsWith("eml:")
              ? "email_upload"
              : "file_upload",
          document: {
            id,
            name: attachment.name,
            object_path: path,
            content_type: attachment.type,
            size_bytes: attachment.bytes.length,
          },
        });
        if (result.duplicate) {
          await gateway.remove(path);
          skipped++;
        } else {
          imported++;
          if (gateway.analyze && isUuid(result.id)) {
            try {
              if (
                await gateway.analyze(
                  org,
                  user,
                  result.id,
                  attachment.bytes,
                  attachment.type,
                )
              )
                analyzed++;
            } catch {
              // An AI failure never undoes a saved document or books an expense.
            }
          }
        }
      } catch (error) {
        if (
          uploaded &&
          error instanceof MailActionError &&
          error.rollbackConfirmed
        ) {
          try {
            await gateway.remove(path);
          } catch {
            /* Keep any orphan private; report failure rather than a successful import. */
          }
        }
        // A lost RPC response may hide a committed invoice. Keep its file until
        // the database outcome is known; retry is deduplicated by content hash.
        if (
          error instanceof MailActionError &&
          [403, 429].includes(error.status)
        )
          throw error;
        failures++;
      }
    }
    return { imported, skipped, failures, ai_used: analyzed > 0 };
  }
  return async (request: Request) => {
    const origin = request.headers.get("origin");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
    };
    if (origin && origins.has(origin))
      Object.assign(headers, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers":
          "authorization,apikey,content-type,x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      });
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (origin && !origins.has(origin))
      return json({ error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return json({ error: "method_not_allowed" }, 405);
    try {
      if (new URL(request.url).pathname.endsWith("/company-mail/inbound")) {
        if (origin) return json({ error: "server_delivery_required" }, 403);
        if (!ingressReady(config))
          return json({ error: "mail_receiver_not_configured" }, 503);
        const timestamp = request.headers.get("x-truckcontrol-timestamp") ?? "",
          signature = request.headers.get("x-truckcontrol-signature") ?? "";
        if (
          !/^\d{10}$/.test(timestamp) ||
          !/^[a-f0-9]{64}$/i.test(signature) ||
          Math.abs((config.now ?? Date.now)() / 1000 - Number(timestamp)) > 300
        )
          return json({ error: "invalid_delivery_signature" }, 401);
        const raw = await readLimited(request, bodyLimit);
        if (
          !(await verifyMailSignature(
            raw,
            timestamp,
            signature,
            config.ingress!.signingKey,
            (config.now ?? Date.now)(),
          ))
        )
          return json({ error: "invalid_delivery_signature" }, 401);
        let event: Data;
        try {
          event = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(raw),
          );
        } catch {
          return json({ error: "invalid_delivery" }, 400);
        }
        if (
          !event ||
          typeof event !== "object" ||
          event.organization_id !== undefined ||
          typeof event.recipient !== "string" ||
          !new RegExp(
            "^[A-Za-z0-9_-]{32,64}@" +
              config.ingress!.domain.replace(/\./g, "\\.") +
              "$",
          ).test(event.recipient) ||
          typeof event.delivery_id !== "string" ||
          !/^[A-Za-z0-9._:-]{1,160}$/.test(event.delivery_id) ||
          typeof event.message_base64 !== "string" ||
          event.message_base64.length > Math.ceil(MAX_MAIL_BYTES / 3) * 4 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(event.message_base64)
        )
          return json({ error: "invalid_delivery" }, 400);
        const lease = await gateway.server<{
          state: string;
          imported?: number;
          organization_id?: string;
          user_id?: string;
          lease_token?: string;
        }>("delivery_begin", {
          recipient: event.recipient,
          delivery_id: event.delivery_id,
          body_hash: await hash(raw),
        });
        if (lease.state === "complete")
          return json({
            duplicate: true,
            imported: lease.imported ?? 0,
            ai_used: false,
          });
        if (lease.state === "busy")
          return json({ error: "delivery_in_progress" }, 409);
        if (
          lease.state !== "ready" ||
          !isUuid(lease.organization_id) ||
          !isUuid(lease.user_id) ||
          !isUuid(lease.lease_token)
        )
          return json({ error: "delivery_unavailable" }, 503);
        const context = {
          organization_id: lease.organization_id,
          user_id: lease.user_id,
          delivery_id: event.delivery_id,
          lease_token: lease.lease_token,
        };
        let result = { imported: 0, skipped: 0, failures: 0, ai_used: false },
          succeeded = false;
        try {
          result = await importFile(
            fromBase64(event.message_base64),
            "correo.eml",
            lease.organization_id,
            lease.user_id,
            context,
          );
          succeeded = result.failures === 0;
          return json(result, succeeded ? 200 : 502);
        } finally {
          await gateway.server("delivery_finish", {
            ...context,
            succeeded,
            imported: result.imported,
          });
        }
      }
      const token = request.headers
        .get("authorization")
        ?.match(/^Bearer ([^\s]+)$/i)?.[1];
      const user = token ? await gateway.authenticate(token) : null;
      if (!user) return json({ error: "authentication_required" }, 401);
      const contentType = request.headers.get("content-type") ?? "";
      if (contentType.toLowerCase().startsWith("multipart/form-data;")) {
        const raw = await readLimited(request, MAX_MAIL_BYTES + 64 * 1024);
        let form: FormData;
        try {
          form = await new Response(raw as BodyInit, {
            headers: { "Content-Type": contentType },
          }).formData();
        } catch {
          return json({ error: "invalid_upload" }, 400);
        }
        const org = form.get("organization_id"),
          file = form.get("file");
        if (
          !isUuid(org) ||
          !(file instanceof File) ||
          form.getAll("file").length !== 1 ||
          form.getAll("organization_id").length !== 1
        )
          return json({ error: "invalid_upload" }, 400);
        await allowed(org, user.id, true);
        return json(
          await importFile(
            new Uint8Array(await file.arrayBuffer()),
            cleanMailText(file.name),
            org,
            user.id,
          ),
        );
      }
      const raw = await readLimited(request, 8192);
      let body: Data;
      try {
        body = JSON.parse(new TextDecoder().decode(raw));
      } catch {
        return json({ error: "invalid_request" }, 400);
      }
      if (
        !body ||
        !isUuid(body.organization_id) ||
        !["status", "enable_inbox", "disable_inbox"].includes(
          String(body.action),
        )
      )
        return json({ error: "invalid_request" }, 400);
      const org = body.organization_id;
      const access = await allowed(
        org,
        user.id,
        false,
        body.action !== "status",
      );
      const context = { organization_id: org, user_id: user.id };
      if (body.action === "status")
        return json({
          upload_ready: true,
          forwarding_ready: ingressReady(config),
          ai_enabled: Boolean(
            access.features.invoice_ai && (await gateway.aiStatus?.()),
          ),
          inbox: await gateway.server("get_inbox", context),
        });
      if (body.action === "enable_inbox") {
        if (!ingressReady(config))
          return json({ error: "mail_receiver_not_configured" }, 503);
        return json(
          await gateway.server("enable_inbox", {
            ...context,
            domain: config.ingress!.domain,
            recipient: randomToken() + "@" + config.ingress!.domain,
          }),
        );
      }
      return json(await gateway.server("disable_inbox", context));
    } catch (error) {
      if (error instanceof MailInputError)
        return json(
          { error: "invalid_mail_file", message: error.message },
          400,
        );
      if (error instanceof MailActionError)
        return json({ error: error.code }, error.status);
      return json({ error: "mail_operation_unavailable" }, 502);
    }
  };
}

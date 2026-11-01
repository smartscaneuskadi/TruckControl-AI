import { Webhook } from "svix";
import { base64, isUuid } from "../_shared/invoice.ts";
import { MAX_MAIL_BYTES } from "../_shared/mail.ts";
import {
  createMailHandler,
  MailActionError,
  readLimited,
} from "../company-mail/handler.ts";
import type { MailGateway } from "../company-mail/handler.ts";
import { resendReady } from "../_shared/resend-runtime.ts";
import type { ResendConfig } from "../_shared/resend-runtime.ts";
function recipient(value: unknown, domain: string) {
  if (typeof value !== "string" || value.length > 320) return null;
  const i = value.lastIndexOf("@");
  if (
    i < 1 ||
    value.slice(i + 1).toLowerCase() !== domain ||
    !/^[A-Za-z0-9_-]{32,64}$/.test(value.slice(0, i))
  )
    return null;
  return value.slice(0, i) + "@" + domain;
}
async function responseBytes(response: Response, max: number) {
  if (!response.ok || !response.body)
    throw new MailActionError("receiver_download_unavailable", 502);
  // Reuse the same real-byte and time limits as manual imports; never trust the
  // Content-Length supplied by a remote URL.
  return readLimited(
    new Request("https://response.invalid", {
      method: "POST",
      headers: response.headers,
      body: response.body,
      duplex: "half",
    } as RequestInit),
    max,
  );
}
export function safeResendRawUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 8000) return null;
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.hash ||
      (u.port && u.port !== "443") ||
      !(
        u.hostname.endsWith(".cloudfront.net") ||
        u.hostname.endsWith(".resend.com")
      ) ||
      !u.pathname.startsWith("/receiving/raw/")
    )
      return null;
    return u;
  } catch {
    return null;
  }
}
export function createResendHandler(
  gateway: MailGateway,
  config: ResendConfig,
  fetcher: typeof fetch = fetch,
) {
  const importer = createMailHandler(gateway, {
    origins: [],
    ingress: {
      enabled: config.enabled,
      domain: config.domain,
      signingKey: config.signingKey,
    },
  });
  const json = (data: unknown, status = 200) =>
    Response.json(data, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  return async (request: Request): Promise<Response> => {
    if (request.headers.has("origin"))
      return json({ error: "server_delivery_required" }, 403);
    if (request.method !== "POST")
      return json({ error: "method_not_allowed" }, 405);
    if (!resendReady(config))
      return json({ error: "mail_receiver_not_configured" }, 503);
    try {
      const raw = await readLimited(request, 64 * 1024);
      let event: {
        type?: unknown;
        data?: { email_id?: unknown; to?: unknown };
      };
      try {
        const payload = new TextDecoder("utf-8", { fatal: true }).decode(raw);
        new Webhook(config.webhookSecret).verify(payload, {
          "svix-id": request.headers.get("svix-id") ?? "",
          "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
          "svix-signature": request.headers.get("svix-signature") ?? "",
        });
        event = JSON.parse(payload) as typeof event;
      } catch {
        return json({ error: "invalid_delivery_signature" }, 401);
      }
      if (event?.type !== "email.received") return json({ ignored: true });
      if (
        !isUuid(event.data?.email_id) ||
        !Array.isArray(event.data?.to) ||
        event.data.to.length > 50
      )
        return json({ error: "invalid_delivery" }, 400);
      const targets = [
        ...new Set(
          event.data.to
            .map((value) => recipient(value, config.domain))
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      if (targets.length !== 1) return json({ ignored: true });
      const target = targets[0];
      // Resolve only an existing issued address. A signed email may not choose
      // an organization ID, acting user or arbitrary download endpoint.
      try {
        const available = await gateway.server("delivery_check", {
          recipient: target,
        });
        if (available === false) return json({ ignored: true });
        if (available !== true)
          return json({ error: "receiver_authorization_unavailable" }, 503);
      } catch (error) {
        if (error instanceof MailActionError && error.status === 403)
          return json({ ignored: true });
        // A temporary authorization/database outage must be retried by Resend,
        // rather than acknowledged as a successfully ignored email.
        return json({ error: "receiver_authorization_unavailable" }, 503);
      }
      const metadata = await fetcher(
        `https://api.resend.com/emails/receiving/${event.data.email_id}?html_format=cid`,
        {
          headers: { Authorization: `Bearer ${config.apiKey}` },
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        },
      );
      const data = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await responseBytes(metadata, 2 * 1024 * 1024),
        ),
      ) as {
        id?: unknown;
        to?: unknown;
        raw?: { download_url?: unknown; expires_at?: unknown };
      };
      if (
        data.id !== event.data.email_id ||
        !Array.isArray(data.to) ||
        !data.to.some((value) => recipient(value, config.domain) === target)
      )
        return json({ error: "receiver_message_mismatch" }, 502);
      const url = safeResendRawUrl(data.raw?.download_url);
      if (
        !url ||
        typeof data.raw?.expires_at !== "string" ||
        !Number.isFinite(Date.parse(data.raw.expires_at)) ||
        Date.parse(data.raw.expires_at) <= Date.now()
      )
        return json({ error: "receiver_original_unavailable" }, 502);
      const original = await responseBytes(
        await fetcher(url.toString(), {
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        }),
        MAX_MAIL_BYTES,
      );
      const payload = JSON.stringify({
        recipient: target,
        delivery_id: "resend:" + event.data.email_id,
        message_base64: base64(original),
      });
      const stamp = String(Math.floor(Date.now() / 1000));
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(config.signingKey),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = Array.from(
        new Uint8Array(
          await crypto.subtle.sign(
            "HMAC",
            cryptoKey,
            new TextEncoder().encode(
              "truckcontrol-mail-v1:" + stamp + "." + payload,
            ),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      // Adapt the official provider signature to the existing internal intake.
      // This is an in-process request: no key or raw mail is forwarded elsewhere.
      return importer(
        new Request("https://internal.invalid/company-mail/inbound", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-truckcontrol-timestamp": stamp,
            "x-truckcontrol-signature": signature,
          },
          body: payload,
        }),
      );
    } catch (error) {
      if (error instanceof MailActionError)
        return json({ error: error.code }, error.status);
      return json({ error: "receiver_operation_unavailable" }, 502);
    }
  };
}

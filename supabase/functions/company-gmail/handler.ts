import {
  base64url,
  detectDocumentType,
  emptyInvoice,
  extractInvoice,
  fromBase64,
  hash,
  isUuid,
  randomToken,
  seal,
  unseal,
  verifierFor,
} from "../_shared/invoice.ts";
import type { GmailOAuthConfig } from "./config.ts";
import type { AiRuntime } from "../_shared/ai-runtime.ts";

const gmailScope = "https://www.googleapis.com/auth/gmail.readonly";
const bucket = "truckcontrol-documents";
type Data = Record<string, unknown>;
export interface GmailGateway {
  actionAllowed?(
    organizationId: string,
    userId: string,
    action: string,
  ): Promise<boolean>;
  featureAllowed?(
    organizationId: string,
    userId: string,
    feature: string,
  ): Promise<boolean>;
  authenticate(token: string): Promise<{ id: string } | null>;
  owns(organizationId: string, userId: string): Promise<boolean>;
  server<T>(action: string, data: Data): Promise<T>;
  upload(path: string, bytes: Uint8Array, type: string): Promise<void>;
  remove(path: string): Promise<void>;
}
export interface GmailConfig {
  enforceCompanyRoles?: boolean;
  enforceEntitlements?: boolean;
  appOrigin: string;
  additionalOrigins?: string[];
  callbackUrl: string;
  oauth?: GmailOAuthConfig;
  resolveOAuth?: () => Promise<GmailOAuthConfig | undefined>;
  ai?: AiRuntime;
  resolveAI?(
    organizationId: string,
    userId: string,
  ): Promise<AiRuntime | undefined>;
}
interface State {
  organization_id: string;
  user_id: string;
  return_origin?: string;
}
interface Credentials extends State {
  google_subject: string;
  email: string;
  refresh_token_cipher: string;
  page_token?: string | null;
}
interface Part {
  filename?: string;
  mimeType?: string;
  body?: { size?: number; attachmentId?: string; data?: string };
  parts?: Part[];
}
class GmailAuthorizationError extends Error {}
class GoogleRequestError extends Error {
  constructor(readonly status: number) {
    super("Google request unavailable");
  }
}
function parts(part: Part): Part[] {
  return [
    ...(part.filename ? [part] : []),
    ...(part.parts ?? []).flatMap(parts),
  ];
}
function extension(type: string) {
  return (
    {
      "application/pdf": "pdf",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    } as Record<string, string>
  )[type];
}

export function createGmailHandler(
  gateway: GmailGateway,
  config: GmailConfig,
  fetcher: typeof fetch = fetch,
) {
  const origin = new URL(config.appOrigin).origin;
  const getOAuth = async () => config.oauth ?? (await config.resolveOAuth?.());
  const allowedOrigins = new Set([
    origin,
    ...(config.additionalOrigins ?? []).map((value) => new URL(value).origin),
  ]);
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
    Vary: "Origin",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  const redirect = (key: string, value: string, returnOrigin = origin) =>
    new Response(null, {
      status: 303,
      headers: {
        ...headers,
        Location: `${allowedOrigins.has(returnOrigin) ? returnOrigin : origin}/#/invoices?${key}=${encodeURIComponent(value)}`,
      },
    });
  async function googleJson(url: string, options: RequestInit = {}) {
    const response = await fetcher(url, {
      ...options,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      if (response.status === 401) throw new GmailAuthorizationError();
      throw new GoogleRequestError(response.status);
    }
    return (await response.json()) as Data;
  }
  async function tokens(body: URLSearchParams) {
    const response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      if (response.status === 400) throw new GmailAuthorizationError();
      throw new Error("Google token request unavailable");
    }
    return (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      scope?: string;
    };
  }
  async function callback(url: URL) {
    const state = url.searchParams.get("state");
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state))
      return redirect("gmail_error", "invalid_state");
    const stored = await gateway.server<State | null>("state_consume", {
      state_hash: await hash(state),
    });
    if (!stored) return redirect("gmail_error", "expired");
    const destination = stored.return_origin ?? origin;
    try {
      const oauth = await getOAuth();
      if (!oauth) return redirect("gmail_error", "unavailable", destination);
      if (url.searchParams.has("error"))
        return redirect("gmail_error", "declined", destination);
      const code = url.searchParams.get("code");
      if (!code || code.length > 4096)
        return redirect("gmail_error", "invalid_code", destination);
      const token = await tokens(
        new URLSearchParams({
          client_id: oauth.clientId,
          client_secret: oauth.clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: config.callbackUrl,
          code_verifier: await verifierFor(state, oauth.encryptionKey),
        }),
      );
      if (
        !token.access_token ||
        !token.refresh_token ||
        !token.scope?.split(" ").includes(gmailScope)
      )
        return redirect("gmail_error", "permission_required", destination);
      const auth = {
        headers: { Authorization: `Bearer ${token.access_token}` },
      };
      const [identity, profile] = await Promise.all([
        googleJson("https://openidconnect.googleapis.com/v1/userinfo", auth),
        googleJson(
          "https://gmail.googleapis.com/gmail/v1/users/me/profile",
          auth,
        ),
      ]);
      if (
        typeof identity.sub !== "string" ||
        typeof identity.email !== "string" ||
        identity.email_verified !== true ||
        typeof profile.emailAddress !== "string" ||
        identity.email.toLowerCase() !== profile.emailAddress.toLowerCase()
      )
        return redirect("gmail_error", "identity_mismatch", destination);
      const ticket = randomToken();
      const cipher = await seal(
        token.refresh_token,
        oauth.encryptionKey,
        `${stored.organization_id}:${stored.user_id}:${identity.sub}`,
      );
      // Finalize only with the SAME authenticated app user after the redirect.
      // This prevents an attacker from linking a victim's Gmail using their own OAuth start URL.
      await gateway.server("pending_create", {
        ...stored,
        ticket_hash: await hash(ticket),
        google_subject: identity.sub,
        email: identity.email,
        refresh_token_cipher: cipher,
      });
      return redirect("gmail_ticket", ticket, destination);
    } catch {
      return redirect("gmail_error", "authorization_failed", destination);
    }
  }
  async function sync(
    organizationId: string,
    userId: string,
    oauth: GmailOAuthConfig,
  ) {
    const locked = await gateway.server<boolean>("lock_sync", {
      organization_id: organizationId,
    });
    if (!locked) return json({ error: "sync_busy" }, 409);
    let reauthorize = false;
    let imported = 0;
    let skipped = 0;
    let failures = 0;
    let succeeded = false;
    let pageToken = "";
    try {
      const credentials = await gateway.server<Credentials | null>(
        "credentials",
        { organization_id: organizationId },
      );
      if (!credentials) throw new GmailAuthorizationError();
      const refreshToken = await unseal(
        credentials.refresh_token_cipher,
        oauth.encryptionKey,
        `${organizationId}:${credentials.user_id}:${credentials.google_subject}`,
      );
      const token = await tokens(
        new URLSearchParams({
          client_id: oauth.clientId,
          client_secret: oauth.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      );
      if (!token.access_token) throw new GmailAuthorizationError();
      const auth = {
        headers: { Authorization: `Bearer ${token.access_token}` },
      };
      pageToken = credentials.page_token ?? "";
      const deadline = Date.now() + 120000;
      let scanned = 0;
      let cursorRetried = false;
      do {
        const query = new URLSearchParams({
          q: "has:attachment newer_than:30d {factura invoice}",
          maxResults: "10",
          ...(pageToken ? { pageToken } : {}),
        });
        let result: { messages?: { id: string }[]; nextPageToken?: string };
        try {
          result = await googleJson(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`,
            auth,
          );
        } catch (e) {
          if (
            pageToken &&
            !cursorRetried &&
            e instanceof GoogleRequestError &&
            e.status === 400
          ) {
            pageToken = "";
            cursorRetried = true;
            query.delete("pageToken");
            result = await googleJson(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`,
              auth,
            );
          } else throw e;
        }
        let pageComplete = true;
        for (const message of result.messages ?? []) {
          if (imported >= 10 || scanned >= 50 || Date.now() > deadline) {
            pageComplete = false;
            break;
          }
          scanned++;
          const msg = (await googleJson(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}?format=full`,
            auth,
          )) as { payload?: Part };
          const attachments = parts(msg.payload ?? {})
            .filter(
              (p) =>
                p.filename &&
                p.body?.attachmentId &&
                p.body.size &&
                p.body.size <= 10 * 1024 * 1024,
            )
            .slice(0, 5);
          for (const attachment of attachments) {
            if (imported >= 10 || Date.now() > deadline) {
              pageComplete = false;
              break;
            }
            const attachmentId = attachment.body!.attachmentId!;
            const identity = {
              organization_id: organizationId,
              message_id: message.id,
              attachment_id: attachmentId,
            };
            if (await gateway.server<boolean>("exists", identity)) {
              skipped++;
              continue;
            }
            const content = await googleJson(
              `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(attachmentId)}`,
              auth,
            );
            if (
              typeof content.data !== "string" ||
              content.data.length > 14 * 1024 * 1024
            ) {
              skipped++;
              continue;
            }
            const bytes = fromBase64(content.data);
            const type = detectDocumentType(bytes);
            if (!type || bytes.length < 1 || bytes.length > 10 * 1024 * 1024) {
              skipped++;
              continue;
            }
            const contentHash = await hash(bytes);
            if (
              await gateway.server<boolean>("exists", {
                ...identity,
                content_hash: contentHash,
              })
            ) {
              skipped++;
              continue;
            }
            let invoice = emptyInvoice();
            const ai = config.resolveAI
              ? await config.resolveAI(organizationId, userId)
              : config.ai;
            if (
              ai &&
              bytes.length <= 6 * 1024 * 1024 &&
              (!gateway.featureAllowed ||
                (await gateway.featureAllowed(
                  organizationId,
                  userId,
                  "invoice_ai",
                )))
            ) {
              const reserved =
                ai.atomicQuota ||
                (await gateway.server<boolean>("reserve_ai", {
                  organization_id: organizationId,
                }));
              if (reserved)
                try {
                  invoice = await extractInvoice(
                    bytes,
                    type,
                    ai,
                    ai.fetcher ?? fetcher,
                  );
                } catch {
                  invoice.review_note =
                    "No se han podido extraer los datos con seguridad. Revisa el documento y completa los campos manualmente.";
                }
              else
                invoice.review_note =
                  "Se ha alcanzado el límite mensual de lectura IA de esta empresa. Completa los datos manualmente.";
            }
            const documentId = crypto.randomUUID();
            const path = `${organizationId}/${documentId}/document.${extension(type)}`;
            await gateway.upload(path, bytes, type);
            try {
              await gateway.server("record_invoice", {
                ...identity,
                content_hash: contentHash,
                ...invoice,
                document: {
                  id: documentId,
                  name:
                    (attachment.filename ?? "Factura")
                      .replace(/[\u0000-\u001f]/g, "")
                      .slice(0, 160) || "Factura",
                  object_path: path,
                  content_type: type,
                  size_bytes: bytes.length,
                },
              });
              imported++;
            } catch {
              await gateway.remove(path);
              failures++;
            }
          }
        }
        // Retry a partially read page next time; deduplication skips its saved files.
        if (!pageComplete) break;
        pageToken = result.nextPageToken ?? "";
      } while (
        pageToken &&
        imported < 10 &&
        scanned < 50 &&
        Date.now() < deadline
      );
      succeeded = true;
      return json({ imported, skipped, failures, scanned });
    } catch (e) {
      reauthorize = e instanceof GmailAuthorizationError;
      return json(
        {
          error: reauthorize
            ? "gmail_reauthorization_required"
            : "gmail_import_unavailable",
          imported,
        },
        reauthorize ? 409 : 502,
      );
    } finally {
      await gateway.server("finish_sync", {
        organization_id: organizationId,
        reauthorize,
        succeeded,
        page_token: pageToken,
      });
    }
  }
  async function dispatch(request: Request): Promise<Response> {
    const requestOrigin = request.headers.get("origin");
    if (requestOrigin && !allowedOrigins.has(requestOrigin))
      return json({ error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    try {
      const url = new URL(request.url);
      if (request.method === "GET") return await callback(url);
      if (request.method !== "POST")
        return json({ error: "method_not_allowed" }, 405);
      // The branded callback receives a short-lived Google code, never tokens.
      // Its public exchange still requires a valid one-use server-side state;
      // the resulting ticket must be finalized by the original app user/company.
      if (url.pathname.endsWith("/company-gmail/oauth-callback")) {
        const raw = await request.text();
        if (raw.length > 8192) return json({ error: "request_too_large" }, 413);
        let body: Data;
        try {
          body = JSON.parse(raw);
        } catch {
          return json({ error: "invalid_request" }, 400);
        }
        if (
          !body ||
          typeof body.state !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(body.state)
        )
          return json({ error: "invalid_state" }, 400);
        const exchange = new URL(config.callbackUrl);
        exchange.searchParams.set("state", body.state);
        if (typeof body.error === "string" && body.error.length <= 256)
          exchange.searchParams.set("error", body.error);
        else if (typeof body.code === "string" && body.code.length <= 4096)
          exchange.searchParams.set("code", body.code);
        else return json({ error: "invalid_request" }, 400);
        const result = await callback(exchange);
        return json({ url: result.headers.get("Location") });
      }
      const token = request.headers
        .get("authorization")
        ?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!token) return json({ error: "authentication_required" }, 401);
      const user = await gateway.authenticate(token);
      if (!user) return json({ error: "authentication_required" }, 401);
      const raw = await request.text();
      if (raw.length > 8192) return json({ error: "request_too_large" }, 413);
      let body: Data;
      try {
        body = JSON.parse(raw);
      } catch {
        return json({ error: "invalid_request" }, 400);
      }
      if (!body || typeof body !== "object" || !isUuid(body.organization_id))
        return json({ error: "invalid_request" }, 400);
      const organizationId = body.organization_id;
      if (!(await gateway.owns(organizationId, user.id)))
        return json({ error: "organization_unavailable" }, 403);
      if (config.enforceCompanyRoles && !gateway.actionAllowed)
        return json({ error: "authorization_not_configured" }, 503);
      if (
        gateway.actionAllowed &&
        !(await gateway.actionAllowed(
          organizationId,
          user.id,
          String(body.action),
        ))
      )
        return json({ error: "role_not_allowed" }, 403);
      if (config.enforceEntitlements && !gateway.featureAllowed)
        return json({ error: "authorization_not_configured" }, 503);
      const gmailAllowed =
        !gateway.featureAllowed ||
        (await gateway.featureAllowed(organizationId, user.id, "gmail"));
      if (
        ["start", "complete", "sync"].includes(String(body.action)) &&
        !gmailAllowed
      )
        return json({ error: "module_not_available" }, 403);
      const oauth = await getOAuth();
      if (body.action === "status") {
        const ai = config.resolveAI
          ? await config.resolveAI(organizationId, user.id)
          : config.ai;
        return json({
          oauth_ready: Boolean(oauth),
          ai_enabled:
            gmailAllowed &&
            Boolean(ai) &&
            (!gateway.featureAllowed ||
              (await gateway.featureAllowed(
                organizationId,
                user.id,
                "invoice_ai",
              ))),
        });
      }
      if (!oauth) return json({ error: "gmail_not_configured" }, 503);
      if (body.action === "start") {
        const state = randomToken();
        await gateway.server("state_create", {
          organization_id: organizationId,
          user_id: user.id,
          state_hash: await hash(state),
          return_origin: requestOrigin || origin,
        });
        const verifier = await verifierFor(state, oauth.encryptionKey);
        const challenge = base64url(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(verifier),
            ),
          ),
        );
        const params = new URLSearchParams({
          client_id: oauth.clientId,
          redirect_uri: config.callbackUrl,
          response_type: "code",
          access_type: "offline",
          prompt: "consent",
          scope: `openid email ${gmailScope}`,
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
        });
        return json({
          url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
        });
      }
      if (body.action === "complete") {
        if (
          typeof body.ticket !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(body.ticket)
        )
          return json({ error: "invalid_ticket" }, 400);
        const pending = await gateway.server<Credentials | null>(
          "pending_consume",
          {
            organization_id: organizationId,
            user_id: user.id,
            ticket_hash: await hash(body.ticket),
          },
        );
        if (!pending) return json({ error: "expired_or_wrong_account" }, 403);
        await gateway.server("connect", {
          ...pending,
          organization_id: organizationId,
          user_id: user.id,
        });
        return json({ connected: true });
      }
      if (body.action === "disconnect") {
        const credentials = await gateway.server<Credentials | null>(
          "credentials",
          {
            organization_id: organizationId,
            purpose: "disconnect",
          },
        );
        if (credentials) {
          const refreshToken = await unseal(
            credentials.refresh_token_cipher,
            oauth.encryptionKey,
            `${organizationId}:${credentials.user_id}:${credentials.google_subject}`,
          );
          const revoked = await fetcher(
            "https://oauth2.googleapis.com/revoke",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ token: refreshToken }),
              signal: AbortSignal.timeout(20000),
            },
          );
          const alreadyRevoked =
            revoked.status === 400 &&
            (await revoked.json().catch(() => ({})))?.error === "invalid_token";
          if (!revoked.ok && !alreadyRevoked)
            return json({ error: "gmail_revocation_unavailable" }, 502);
        }
        await gateway.server("disconnect", { organization_id: organizationId });
        return json({ disconnected: true });
      }
      if (body.action === "sync")
        return await sync(organizationId, user.id, oauth);
      return json({ error: "unsupported_action" }, 400);
    } catch {
      return request.method === "GET"
        ? redirect("gmail_error", "authorization_failed")
        : json({ error: "integration_unavailable" }, 502);
    }
  }
  return async function handle(request: Request): Promise<Response> {
    const response = await dispatch(request);
    const requested = request.headers.get("origin");
    const outgoing = new Headers(response.headers);
    outgoing.set(
      "Access-Control-Allow-Origin",
      requested && allowedOrigins.has(requested) ? requested : origin,
    );
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outgoing,
    });
  };
}
export { bucket };

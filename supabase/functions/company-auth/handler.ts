/** Native Supabase verification, delivered by the separately authorized Resend account. */
export type AuthMailRuntime = {
  enabled: boolean;
  api_key: string;
  signing_key: string;
  owner_email: string;
  registration_open: boolean;
  legal_version: string;
  acceptance_enabled: boolean;
};
export interface AuthMailGateway {
  config(): Promise<AuthMailRuntime | null>;
  reserve(data: {
    request_id: string;
    email_hash: string;
    ip_hash: string;
    action: string;
    legal_version: string | null;
  }): Promise<string | null>;
  generate(
    type: "invite" | "recovery",
    email: string,
    metadata?: Record<string, unknown>,
  ): Promise<string | null>;
}
const origins = new Set([
  "https://truckcontrolai.com",
  "https://www.truckcontrolai.com",
]);
const encoder = new TextEncoder();
export function validAuthEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,187}[A-Za-z0-9])?\.[A-Za-z]{2,24}$/.test(
      value,
    ) &&
    !value.includes("..")
  );
}
export async function authHmac(key: string, value: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", k, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function authEmailLink(type: "invite" | "recovery", token: string) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token))
    throw Error("Invalid native token");
  // Fragment never reaches HTTP access logs or referrers. The user confirms before consuming it.
  return `https://truckcontrolai.com/#tc-auth=${type}&token_hash=${token}`;
}
function registration(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>,
    result: Record<string, string> = {};
  for (const [name, min, max] of [
    ["contact_name", 2, 100],
    ["company_name", 2, 100],
    ["tax_id", 3, 30],
    ["address", 5, 240],
  ] as const) {
    const field = data[name];
    if (
      typeof field !== "string" ||
      field.trim().length < min ||
      field.trim().length > max ||
      /[\x00-\x1f\x7f]/.test(field)
    )
      return null;
    result[name] = field.trim();
  }
  if (
    typeof data.phone !== "string" ||
    !/^\+[1-9][0-9]{7,14}$/.test(data.phone) ||
    !["limited", "full"].includes(String(data.requested_plan))
  )
    return null;
  result.phone = data.phone;
  result.requested_plan = String(data.requested_plan);
  return result;
}
async function readBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw Error("Body missing");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) throw Error("Body limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
async function signedOperations(request: Request, body: string, key: string) {
  const timestamp = request.headers.get("x-truckcontrol-timestamp") ?? "";
  const signature = request.headers.get("x-truckcontrol-signature") ?? "";
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
    !/^[0-9a-f]{64}$/.test(signature)
  )
    return false;
  const k = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.match(/../g)!, (x) =>
    parseInt(x, 16),
  );
  return crypto.subtle.verify(
    "HMAC",
    k,
    bytes,
    encoder.encode(`truckcontrol-auth-ops-v1:${timestamp}.${body}`),
  );
}
export function createAuthMailHandler(
  gateway: AuthMailGateway,
  transport: typeof fetch = fetch,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("Origin");
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "Referrer-Policy": "no-referrer",
      Vary: "Origin",
    };
    if (origin && origins.has(origin))
      Object.assign(headers, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers":
          "apikey,authorization,content-type,x-client-info",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      });
    const response = (status: number, data: object) =>
      Response.json(data, { status, headers });
    if (origin && !origins.has(origin))
      return response(403, { error: "origin_denied" });
    if (request.method === "OPTIONS") return response(origin ? 200 : 403, {});
    try {
      const runtime = await gateway.config();
      const configured = Boolean(
        runtime &&
        /^re_[A-Za-z0-9_-]{20,256}$/.test(runtime.api_key) &&
        runtime.signing_key.length >= 32,
      );
      if (
        request.method === "GET" &&
        new URL(request.url).pathname.endsWith("/health")
      )
        return response(200, {
          configured,
          enabled: configured && runtime!.enabled,
        });
      if (request.method !== "POST")
        return response(405, { error: "method_not_allowed" });
      if (!configured || !runtime!.enabled)
        return response(503, { error: "auth_mail_unavailable" });
      if (
        !request.headers
          .get("Content-Type")
          ?.toLowerCase()
          .startsWith("application/json")
      )
        return response(415, { error: "json_required" });
      let raw: string, body: Record<string, unknown>;
      try {
        raw = await readBody(request);
        body = JSON.parse(raw);
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw Error();
      } catch {
        return response(400, { error: "invalid_request" });
      }
      const action = body.action;
      if (
        !["signup", "recovery", "owner_invite", "acceptance"].includes(
          String(action),
        )
      )
        return response(400, { error: "invalid_action" });
      const internal = action === "owner_invite" || action === "acceptance";
      if (
        internal
          ? Boolean(origin) ||
            !(await signedOperations(request, raw, runtime!.signing_key))
          : !origin
      )
        return response(403, { error: "authorization_required" });
      const inputEmail =
        action === "owner_invite" ? runtime!.owner_email : body.email;
      if (!validAuthEmail(inputEmail))
        return response(400, { error: "invalid_email" });
      const email = inputEmail.toLowerCase();
      if (
        action === "acceptance" &&
        (!runtime!.acceptance_enabled ||
          !/^acceptance-[0-9a-f-]{36}@facturas\.truckcontrolai\.com$/.test(
            email,
          ))
      )
        return response(403, { error: "acceptance_denied" });
      let metadata: Record<string, unknown> | undefined;
      if (action === "signup") {
        if (!runtime!.registration_open)
          return response(403, { error: "registration_closed" });
        const profile = registration(body.registration);
        if (
          !profile ||
          body.terms_accepted !== true ||
          body.terms_version !== runtime!.legal_version
        )
          return response(400, { error: "registration_invalid" });
        metadata = {
          truckcontrol_registration: profile,
          truckcontrol_legal: {
            version: runtime!.legal_version,
            accepted_at: new Date().toISOString(),
          },
        };
      }
      // No password is accepted or generated during signup. Only the email holder chooses one after verification.
      if ("password" in body)
        return response(400, { error: "password_not_accepted_here" });
      const requestId = internal ? body.request_id : crypto.randomUUID();
      if (
        typeof requestId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          requestId,
        )
      )
        return response(400, { error: "request_identity_invalid" });
      // Platform proxy address is used only for a salted limiter, never stored as cleartext.
      const ip = (
        request.headers.get("cf-connecting-ip") ??
        request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ??
        "unknown"
      ).slice(0, 100);
      const reserved = await gateway.reserve({
        request_id: requestId,
        email_hash: await authHmac(
          runtime!.signing_key,
          `auth-email-v1:${email}`,
        ),
        ip_hash: await authHmac(runtime!.signing_key, `auth-ip-v1:${ip}`),
        action: String(action),
        legal_version: action === "signup" ? runtime!.legal_version : null,
      });
      // Uniform acknowledgement for nonexistent/existing accounts, exhausted quotas and provider errors.
      const accepted = () => response(202, { accepted: true });
      if (!reserved) return accepted();
      const type =
        action === "recovery" ||
        (action === "acceptance" && body.recovery === true)
          ? "recovery"
          : "invite";
      const token = await gateway.generate(type, email, metadata);
      if (!token) return accepted();
      const link = authEmailLink(type, token);
      const title =
        type === "recovery"
          ? "Recupera tu acceso a TruckControl AI"
          : "Confirma tu acceso a TruckControl AI";
      const description =
        type === "recovery"
          ? "Abre el enlace y elige una nueva contraseña."
          : "Confirma tu correo y elige tu contraseña para entrar.";
      try {
        const sent = await transport("https://api.resend.com/emails", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(12000),
          headers: {
            Authorization: `Bearer ${runtime!.api_key}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `truckcontrol-auth-${reserved}`,
          },
          body: JSON.stringify({
            from: "TruckControl AI <no-reply@facturas.truckcontrolai.com>",
            to: [email],
            subject: title,
            text: `${title}\n\n${description}\n${link}\n\nEl enlace es personal y de un solo uso. Si no has solicitado este acceso, ignora este correo.\nELEVADANCOR S.L. · pedidos@smartscaneuskadi.com`,
            html: `<h1>${title}</h1><p>${description}</p><p><a href="${link}">Continuar en TruckControl AI</a></p><p>El enlace es personal y de un solo uso. Si no has solicitado este acceso, ignora este correo.</p><p>ELEVADANCOR S.L. · pedidos@smartscaneuskadi.com</p>`,
          }),
        });
        await sent.body?.cancel();
      } catch {
        /* No blind retry, raw provider error or verification token in responses/logs. */
      }
      return accepted();
    } catch {
      return response(503, { error: "auth_mail_unavailable" });
    }
  };
}

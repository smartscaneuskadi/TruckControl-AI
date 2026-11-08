import { connectionConfig, ConnectionError } from "./contract.ts";
import type { MailConnection } from "./contract.ts";
export interface MailGateway {
  authorize(token: string, organization: string): Promise<boolean>;
  operate(
    config: MailConnection,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  probe(provider: string): Promise<unknown>;
}
export function createPersonalMailHandler(
  gateway: MailGateway,
  origins: readonly string[],
) {
  const budgets = new Map<string, { time: number; count: number }>();
  const probes = new Map<string, { until: number; result: unknown }>();
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("Origin") ?? "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    };
    if (origins.includes(origin))
      Object.assign(headers, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers":
          "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      });
    const reply = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (!origins.includes(origin)) return reply({ error: "denied" }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path.endsWith("/health"))
      return reply({
        transport: "imap-smtp",
        imap_port: 993,
        smtp_port: 465,
        credentials_stored: false,
        authenticated: false,
      });
    if (request.method === "GET" && path.endsWith("/transport-check")) {
      const provider = new URL(request.url).searchParams.get("provider") ?? "";
      if (!["porkbun", "yahoo"].includes(provider))
        return reply({ error: "invalid" }, 400);
      const cached = probes.get(provider);
      if (cached && cached.until > Date.now()) return reply(cached.result);
      try {
        const result = await gateway.probe(provider);
        probes.set(provider, { until: Date.now() + 60000, result });
        return reply(result);
      } catch {
        return reply({ error: "unavailable" }, 503);
      }
    }
    if (request.method !== "POST") return reply({ error: "invalid" }, 405);
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer ([A-Za-z0-9_.-]{1,16384})$/)?.[1];
    if (!token) return reply({ error: "expired" }, 401);
    try {
      if (Number(request.headers.get("Content-Length")) > 800000)
        throw new ConnectionError("too_large");
      const reader = request.body?.getReader();
      if (!reader) throw new ConnectionError("invalid");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 800000) {
            await reader.cancel();
            throw new ConnectionError("too_large");
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of chunks) {
        bytes.set(part, offset);
        offset += part.length;
      }
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (
        !body ||
        typeof body !== "object" ||
        !/^[0-9a-f-]{36}$/i.test(body.organization_id) ||
        !["verify", "list", "read", "change", "send"].includes(body.action)
      )
        throw new ConnectionError("invalid");
      if (!(await gateway.authorize(token, body.organization_id)))
        return reply({ error: "expired" }, 401);
      const now = Date.now();
      // The budget key is a digest, never a bearer token, password or email address.
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token),
      );
      const key = Array.from(new Uint8Array(digest))
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      for (const [key, budget] of budgets)
        if (now - budget.time > 60000) budgets.delete(key);
      const budget = budgets.get(key) ?? { time: now, count: 0 };
      if (budget.count >= 60) return reply({ error: "unavailable" }, 429);
      budget.count++;
      budgets.set(key, budget);
      const config = connectionConfig(body.connection);
      const result = await gateway.operate(
        config,
        body.action,
        body.data ?? {},
      );
      return reply(result);
    } catch (error) {
      const code =
        error instanceof ConnectionError ? error.code : "unavailable";
      return reply(
        { error: code },
        code === "invalid"
          ? 400
          : code === "too_large"
            ? 413
            : code === "denied"
              ? 403
              : 502,
      );
    }
  };
}

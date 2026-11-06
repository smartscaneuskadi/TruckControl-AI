import { isUuid } from "../_shared/invoice.ts";
import type { AiRuntime } from "../_shared/ai-runtime.ts";
import {
  actionCatalog,
  copilotInstructions,
  parseCopilotReply,
  replyFormat,
} from "./contract.ts";
export interface CopilotIdentity {
  userId: string;
  control(
    org: string,
    action: string,
    data?: Record<string, unknown>,
  ): Promise<unknown>;
}
export interface CopilotGateway {
  authenticate(token: string): Promise<CopilotIdentity | null>;
  server(
    org: string,
    user: string,
    action: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
}
export interface CopilotConfig {
  origins: readonly string[];
  resolveAI(org: string, user: string): Promise<AiRuntime | undefined>;
}
export function createCopilotHandler(
  gateway: CopilotGateway,
  config: CopilotConfig,
  fetcher: typeof fetch = fetch,
) {
  const origins = new Set(config.origins);
  return async (request: Request) => {
    const origin = request.headers.get("origin"),
      headers = {
        "Access-Control-Allow-Origin":
          origin && origins.has(origin) ? origin : config.origins[0],
        "Access-Control-Allow-Headers":
          "authorization,apikey,content-type,x-client-info",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Cache-Control": "no-store",
        Vary: "Origin",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      };
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    if (origin && !origins.has(origin))
      return json({ error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return json({ error: "method_not_allowed" }, 405);
    let identity: CopilotIdentity | null = null,
      org = "",
      requestId = "",
      started = false;
    try {
      const token = request.headers
        .get("authorization")
        ?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!token || !(identity = await gateway.authenticate(token)))
        return json({ error: "authentication_required" }, 401);
      if (Number(request.headers.get("content-length")) > 32768)
        return json({ error: "request_too_large" }, 413);
      const reader = request.body?.getReader();
      if (!reader) return json({ error: "invalid_request" }, 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 32768) {
          await reader.cancel();
          return json({ error: "request_too_large" }, 413);
        }
        chunks.push(value);
      }
      const joined = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        joined.set(c, offset);
        offset += c.length;
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(new TextDecoder().decode(joined));
      } catch {
        return json({ error: "invalid_request" }, 400);
      }
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        !isUuid(body.organization_id)
      )
        return json({ error: "invalid_request" }, 400);
      org = body.organization_id;
      const status = (await identity.control(org, "status")) as {
        schema_version?: number;
        organization_id?: string;
        allowed?: boolean;
        can_write?: boolean;
      };
      if (
        !status ||
        status.schema_version !== 1 ||
        status.organization_id !== org
      )
        return json({ error: "organization_unavailable" }, 403);
      if (body.action === "status") {
        if (
          Object.keys(body).some(
            (k) => !["action", "organization_id"].includes(k),
          )
        )
          return json({ error: "invalid_request" }, 400);
        const ai = await config.resolveAI(org, identity.userId);
        return json({ ...status, configured: Boolean(ai) });
      }
      if (status.allowed !== true)
        return json({ error: "ai_permission_required" }, 403);
      if (
        body.action !== "chat" ||
        Object.keys(body).some(
          (k) =>
            !["action", "organization_id", "request_id", "messages"].includes(
              k,
            ),
        ) ||
        !isUuid(body.request_id) ||
        !Array.isArray(body.messages) ||
        !body.messages.length ||
        body.messages.length > 20 ||
        !body.messages.every(
          (m) =>
            m &&
            typeof m === "object" &&
            !Array.isArray(m) &&
            Object.keys(m).length === 2 &&
            ["user", "assistant"].includes(m.role) &&
            typeof m.content === "string" &&
            m.content.trim().length > 0 &&
            m.content.length <= 2000,
        ) ||
        body.messages.at(-1)?.role !== "user"
      )
        return json({ error: "invalid_request" }, 400);
      requestId = body.request_id;
      const ai = await config.resolveAI(org, identity.userId);
      if (!ai?.atomicQuota)
        return json({ error: "copilot_not_configured" }, 503);
      const turn = (await gateway.server(org, identity.userId, "begin", {
        request_id: requestId,
      })) as { started?: boolean; state?: string };
      if (turn?.started !== true)
        return json(turn, turn?.state === "pending" ? 202 : 200);
      started = true;
      const context = await identity.control(org, "context", {
        query: body.messages.at(-1).content,
      });
      const serialized = JSON.stringify(context);
      if (serialized.length > 220000) throw Error("Context limit exceeded");
      const response = await (ai.fetcher ?? fetcher)(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${ai.key}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(45000),
          body: JSON.stringify({
            model: ai.model,
            store: false,
            max_output_tokens: 1200,
            instructions: copilotInstructions,
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: JSON.stringify({
                      conversation: body.messages,
                      authorized_company: context,
                      action_catalog: actionCatalog,
                    }),
                  },
                ],
              },
            ],
            text: { format: replyFormat },
          }),
        },
      );
      if (!response.ok) throw Error("Model unavailable");
      const result = (await response.json()) as {
        status?: string;
        output?: {
          type?: string;
          content?: { type?: string; text?: string }[];
        }[];
      };
      if (result.status === "incomplete" || result.status === "failed")
        throw Error("Incomplete response");
      const texts =
        result.output
          ?.flatMap((x) => x.content ?? [])
          .filter((x) => x.type === "output_text")
          .map((x) => x.text ?? "") ?? [];
      if (texts.length !== 1 || texts[0].length > 30000)
        throw Error("Invalid response");
      const answer = parseCopilotReply(JSON.parse(texts[0]));
      // No execution path exists here. Saving drafts is atomic and rechecks roles.
      const saved = await gateway.server(org, identity.userId, "finish", {
        request_id: requestId,
        ...answer,
      });
      return json(saved);
    } catch (e) {
      if (started && identity) {
        try {
          await gateway.server(org, identity.userId, "fail", {
            request_id: requestId,
          });
        } catch {
          /* Preserve unknown state, never retry a billable call. */
        }
      }
      const code =
        e && typeof e === "object" && "code" in e ? String(e.code) : "";
      return json(
        {
          error:
            code === "42501"
              ? "permission_changed"
              : code === "40001"
                ? "record_changed"
                : code === "23514"
                  ? "proposal_invalid"
                  : code === "54000"
                    ? "rate_limited"
                    : "copilot_unavailable",
          ...(requestId ? { request_id: requestId } : {}),
        },
        code === "42501"
          ? 403
          : code === "40001"
            ? 409
            : code === "23514"
              ? 422
              : code === "54000"
                ? 429
                : 503,
      );
    }
  };
}

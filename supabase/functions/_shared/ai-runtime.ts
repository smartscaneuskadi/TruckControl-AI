import { isUuid } from "./invoice.ts";

export interface AiRuntime {
  key: string;
  model: string;
  atomicQuota?: boolean;
  fetcher?: typeof fetch;
}
export interface AiContext {
  organization_id: string;
  user_id: string;
  kind: "document" | "invoice";
  invoice_id?: string;
}
export interface AiRuntimeGateway {
  config(): Promise<Record<string, unknown> | null>;
  budget(action: string, data: Record<string, unknown>): Promise<unknown>;
}
export function usableApiKey(value: unknown): value is string {
  return typeof value === "string" && /^sk-[A-Za-z0-9_-]{30,}$/.test(value);
}
export function createAiRuntimeResolver(
  gateway: AiRuntimeGateway,
  environmentKey?: string | readonly (string | undefined)[],
  transport: typeof fetch = fetch,
) {
  async function read() {
    const policy = await gateway.config();
    const stored =
      typeof policy?.api_key === "string" ? policy.api_key.trim() : "";
    const candidates =
      typeof environmentKey === "string" || environmentKey === undefined
        ? [environmentKey]
        : environmentKey;
    const key = usableApiKey(stored)
      ? stored
      : candidates.map((value) => value?.trim()).find(usableApiKey);
    return { policy, key: usableApiKey(key) ? key : undefined };
  }
  return {
    async health() {
      try {
        const { policy, key } = await read();
        return {
          configured: Boolean(key),
          enabled: Boolean(
            key &&
            policy?.enabled === true &&
            Number(policy.monthly_budget_cents) >= 100,
          ),
        };
      } catch {
        return { configured: false, enabled: false };
      }
    },
    async resolve(context: AiContext): Promise<AiRuntime | undefined> {
      const { policy, key } = await read();
      if (
        !key ||
        policy?.enabled !== true ||
        policy.model !== "gpt-6-luna" ||
        !Number.isInteger(policy.monthly_budget_cents) ||
        Number(policy.monthly_budget_cents) < 100
      )
        return undefined;
      const model = policy.model;
      const budgeted: typeof fetch = async (input, init) => {
        if (
          typeof input !== "string" ||
          input !== "https://api.openai.com/v1/responses" ||
          init?.method !== "POST" ||
          typeof init.body !== "string"
        )
          throw Error("Unsupported AI request");
        const body = JSON.parse(init.body);
        if (
          body.model !== model ||
          body.store !== false ||
          !Number.isInteger(body.max_output_tokens) ||
          body.max_output_tokens < 1 ||
          body.max_output_tokens > 1200 ||
          body.tools !== undefined ||
          body.background === true ||
          body.stream === true
        )
          throw Error("Unsupported AI request");
        // The project default must not silently select a more expensive tier.
        body.service_tier = "default";
        body.reasoning = { effort: "none" };
        const reservation = (await gateway.budget("reserve", {
          ...context,
          model,
        })) as { id?: unknown } | null;
        if (!reservation || !isUuid(reservation.id))
          throw Error("AI budget or permission unavailable");
        const response = await transport(input, {
          ...init,
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(body),
        });
        try {
          const data = (await response.clone().json()) as {
            usage?: { input_tokens?: unknown; output_tokens?: unknown };
          };
          const usage = data.usage;
          if (
            Number.isInteger(usage?.input_tokens) &&
            Number(usage?.input_tokens) >= 0 &&
            Number(usage?.input_tokens) <= 1050000 &&
            Number.isInteger(usage?.output_tokens) &&
            Number(usage?.output_tokens) >= 0 &&
            Number(usage?.output_tokens) <= 1200
          ) {
            await gateway.budget("settle", {
              id: reservation.id,
              input_tokens: usage!.input_tokens,
              output_tokens: usage!.output_tokens,
            });
          }
        } catch {
          // Unknown usage/response/settlement keeps the whole reservation. Never
          // retry a billable call or release an amount that may have been used.
        }
        return response;
      };
      return { key, model, atomicQuota: true, fetcher: budgeted };
    },
  };
}

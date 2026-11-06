import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createAiRuntimeResolver } from "../_shared/ai-runtime.ts";
import { productionAppOrigins } from "../_shared/app-origins.ts";
import { createCopilotHandler } from "./handler.ts";
import type { CopilotGateway } from "./handler.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const gateway: CopilotGateway = {
  async authenticate(token) {
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return {
      userId: data.user.id,
      async control(org, action, input = {}) {
        const { data, error } = await client.rpc("tc_company_copilot", {
          p_org: org,
          p_action: action,
          p_data: input,
        });
        if (error) throw error;
        return data;
      },
    };
  },
  async server(org, user, action, input) {
    const { data, error } = await service.rpc("company_copilot_server", {
      p_org: org,
      p_user: user,
      p_action: action,
      p_data: input,
    });
    if (error) throw error;
    return data;
  },
};
const runtime = createAiRuntimeResolver(
  {
    async config() {
      const { data, error } = await service.rpc(
        "company_provider_runtime_config",
        { p_scope: "ai" },
      );
      if (error) throw error;
      return data;
    },
    async budget(action, input) {
      const { data, error } = await service.rpc("company_ai_budget_server", {
        p_action: action,
        p_data: input,
      });
      if (error) throw error;
      return data;
    },
  },
  [Deno.env.get("OPENAI_API_KEY"), Deno.env.get("truckcontrol_openai_api_key")],
);
const handler = createCopilotHandler(gateway, {
  origins: productionAppOrigins,
  resolveAI: (organization_id, user_id) =>
    runtime.resolve({ organization_id, user_id, kind: "document" }),
});
Deno.serve(async (request: Request) =>
  request.method === "GET" &&
  new URL(request.url).pathname.endsWith("/company-copilot/health")
    ? Response.json(
        {
          schema_version: 1,
          service: "company-copilot",
          human_confirmation: true,
          voice: "browser-dictation",
          ...(await runtime.health()),
        },
        {
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      )
    : handler(request),
);

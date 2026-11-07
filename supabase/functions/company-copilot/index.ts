import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createAiRuntimeResolver } from "../_shared/ai-runtime.ts";
import { productionAppOrigins } from "../_shared/app-origins.ts";
import { createCopilotHandler } from "./handler.ts";
import type { CopilotGateway, CopilotIdentity } from "./handler.ts";
import { createSpecialistHandler } from "./specialist-handler.ts";
import type { SpecialistGateway } from "./specialist-handler.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const specialistStagingOrigin =
  "https://truckcontrol-ai-specialists-staging.earlymug513.chatgpt.site";
const copilotOrigins = [...productionAppOrigins, specialistStagingOrigin];
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
  origins: copilotOrigins,
  resolveAI: (organization_id, user_id) =>
    runtime.resolve({ organization_id, user_id, kind: "document" }),
});
const specialistGateway: SpecialistGateway = {
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
        const { data, error } = await client.rpc("tc_company_specialists", {
          p_org: org,
          p_action: action,
          p_data: input,
        });
        if (error) throw error;
        return data;
      },
      async document(org, id) {
        const { data, error } = await client.rpc("get_company_document", {
          p_organization_id: org,
          p_document_id: id,
        });
        return error ? null : (data?.[0] ?? null);
      },
      async download(path) {
        const { data, error } = await client.storage
          .from("truckcontrol-documents")
          .download(path);
        if (error || !data) throw Error("Document unavailable");
        return new Uint8Array(await data.arrayBuffer());
      },
    };
  },
  async server(org, user, action, input) {
    const { data, error } = await service.rpc("company_specialists_server", {
      p_org: org,
      p_user: user,
      p_action: action,
      p_data: input,
    });
    if (error) throw error;
    return data;
  },
};
const specialists = createSpecialistHandler(specialistGateway, {
  origins: copilotOrigins,
  resolveAI: (organization_id, user_id) =>
    runtime.resolve({ organization_id, user_id, kind: "document" }),
});
function requireSyntheticStaging<T extends CopilotIdentity>(
  identity: T | null,
  token: string,
): T | null {
  if (!identity) return null;
  const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    ...identity,
    async control(
      org: string,
      action: string,
      input: Record<string, unknown> = {},
    ) {
      const { data, error } = await client.rpc("tc_company_specialists", {
        p_org: org,
        p_action: "stage_access",
        p_data: {},
      });
      if (error || data?.organization_id !== org || data.allowed !== true)
        throw Object.assign(Error("Staging access denied"), { code: "42501" });
      return identity.control(org, action, input);
    },
  };
}
const stagingHandler = createCopilotHandler(
  {
    ...gateway,
    authenticate: async (token) =>
      requireSyntheticStaging(await gateway.authenticate(token), token),
  },
  {
    origins: copilotOrigins,
    resolveAI: (organization_id, user_id) =>
      runtime.resolve({ organization_id, user_id, kind: "document" }),
  },
);
const stagingSpecialists = createSpecialistHandler(
  {
    ...specialistGateway,
    authenticate: async (token) =>
      requireSyntheticStaging(
        await specialistGateway.authenticate(token),
        token,
      ),
  },
  {
    origins: copilotOrigins,
    resolveAI: (organization_id, user_id) =>
      runtime.resolve({ organization_id, user_id, kind: "document" }),
  },
);
async function specialistHealth() {
  const [readiness, metadata] = await Promise.all([
    runtime.health(),
    service.rpc("company_specialists_health"),
  ]);
  return Response.json(
    {
      schema_version: 2,
      service: "company-copilot-specialists",
      ...readiness,
      ...(metadata.error ? { profiles: [] } : metadata.data),
    },
    {
      status: metadata.error ? 503 : 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
Deno.serve(async (request: Request) =>
  request.method === "GET" &&
  new URL(request.url).pathname.endsWith("/company-copilot/specialists/health")
    ? specialistHealth()
    : request.method === "GET" &&
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
      : new URL(request.url).pathname.endsWith("/company-copilot/specialists")
        ? (request.headers.get("origin") === specialistStagingOrigin
            ? stagingSpecialists
            : specialists)(request)
        : (request.headers.get("origin") === specialistStagingOrigin
            ? stagingHandler
            : handler)(request),
);

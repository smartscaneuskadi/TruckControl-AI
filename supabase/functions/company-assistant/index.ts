import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createAssistantHandler } from "./handler.ts";
import type { AssistantGateway } from "./handler.ts";
import { createAiRuntimeResolver } from "../_shared/ai-runtime.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const gateway: AssistantGateway = {
  async authenticate(token) {
    const client = createClient(url, publicKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return {
      userId: data.user.id,
      async access(organizationId) {
        const { data, error } = await client.rpc("tc_organization_access", {
          p_org: organizationId,
        });
        if (error) throw Error("Authorization unavailable");
        return data;
      },
      async document(organizationId, documentId) {
        const { data, error } = await client.rpc("get_company_document", {
          p_organization_id: organizationId,
          p_document_id: documentId,
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
  async consume(organizationId, userId) {
    const { data, error } = await service.rpc("tc_consume_document_ai", {
      p_org: organizationId,
      p_user: userId,
    });
    return !error && data === true;
  },
};
const runtime = createAiRuntimeResolver(
  {
    async config() {
      const { data, error } = await service.rpc(
        "company_provider_runtime_config",
        { p_scope: "ai" },
      );
      return error ? null : data;
    },
    async budget(action, data) {
      const { data: result, error } = await service.rpc(
        "company_ai_budget_server",
        { p_action: action, p_data: data },
      );
      if (error) throw Error("AI budget unavailable");
      return result;
    },
  },
  [Deno.env.get("OPENAI_API_KEY"), Deno.env.get("truckcontrol_openai_api_key")],
);
const handler = createAssistantHandler(gateway, {
  appOrigin: "https://truckcontrolai.com",
  additionalOrigins: [
    "https://www.truckcontrolai.com",
    "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site",
  ],
  resolveAI: (organization_id, user_id) =>
    runtime.resolve({ organization_id, user_id, kind: "document" }),
});
Deno.serve(async (request: Request) => {
  // Public readiness exposes two booleans only. All document/AI actions still
  // require verified user authentication, tenant permissions and a budget lease.
  if (
    request.method === "GET" &&
    new URL(request.url).pathname.endsWith("/company-assistant/health")
  )
    return Response.json(await runtime.health(), {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  return handler(request);
});

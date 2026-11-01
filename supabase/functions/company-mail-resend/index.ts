import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createMailGateway } from "../company-mail/gateway.ts";
import { createResendHandler } from "./handler.ts";
import { resendConfig } from "../_shared/resend-runtime.ts";
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const gateway = createMailGateway(client, [
  Deno.env.get("OPENAI_API_KEY"),
  Deno.env.get("truckcontrol_openai_api_key"),
]);
Deno.serve(async (request: Request) => {
  const { data, error } = await client.rpc("company_provider_runtime_config", {
    p_scope: "mail",
  });
  const policy = error ? null : data;
  return createResendHandler(gateway, resendConfig(policy))(request);
});

import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createMailHandler } from "./handler.ts";
import { createMailGateway } from "./gateway.ts";
import { resendConfig, resendReady } from "../_shared/resend-runtime.ts";

const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const environmentKey = [
  Deno.env.get("OPENAI_API_KEY"),
  Deno.env.get("truckcontrol_openai_api_key"),
];
const gateway = createMailGateway(client, environmentKey);
Deno.serve(async (request: Request) => {
  const { data, error } = await client.rpc("company_provider_runtime_config", {
    p_scope: "mail",
  });
  const policy = error ? null : data;
  const receiver = resendConfig(policy);
  return createMailHandler(gateway, {
    origins: [
      "https://truckcontrolai.com",
      "https://www.truckcontrolai.com",
      "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site",
    ],
    ingress:
      Deno.env.get("COMPANY_MAIL_INGRESS_ENABLED") === "true"
        ? {
            enabled: true,
            domain: Deno.env.get("COMPANY_MAIL_INGRESS_DOMAIN") ?? "",
            signingKey: Deno.env.get("COMPANY_MAIL_INGRESS_SIGNING_KEY") ?? "",
          }
        : {
            enabled: resendReady(receiver),
            domain: receiver.domain,
            signingKey: receiver.signingKey,
          },
  })(request);
});

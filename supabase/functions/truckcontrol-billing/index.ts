import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createBillingHandler } from "./handler.ts";
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve(
  createBillingHandler(
    {
      async authenticate(token) {
        const { data, error } = await client.auth.getUser(token);
        return error ? null : data.user;
      },
      async server<T>(
        action: string,
        data: Record<string, unknown>,
      ): Promise<T> {
        const result = await client.rpc("tc_platform_server", {
          p_action: action,
          p_data: data,
        });
        if (result.error) throw new Error("Billing database operation failed");
        return result.data as T;
      },
    },
    {
      appOrigin:
        Deno.env.get("TRUCKCONTROL_APP_ORIGIN") ??
        "https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site",
      stripeKey: Deno.env.get("STRIPE_SECRET_KEY"),
      webhookSecret: Deno.env.get("STRIPE_WEBHOOK_SECRET"),
    },
  ),
);

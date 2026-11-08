import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createManualStripeWebhookHandler } from "./handler.ts";
import { persistManualStripePayment } from "../_shared/subscription-stripe-persistence.ts";

const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } });
const mode = Deno.env.get("TRUCKCONTROL_MANUAL_STRIPE_MODE");
Deno.serve(createManualStripeWebhookHandler({
  async applyPayment(payment) {
    await persistManualStripePayment((name, parameters) => client.rpc(name, parameters), payment);
  },
}, {
  // Separate switches: deploying code alone never enables even the sandbox pipeline.
  enabled: Deno.env.get("TRUCKCONTROL_MANUAL_STRIPE_PIPELINE_ENABLED") === "true",
  schemaAccepted: Deno.env.get("TRUCKCONTROL_MANUAL_STRIPE_SCHEMA_ACCEPTED") === "true",
  mode: mode === "live" ? "live" : "test",
  stripeKey: Deno.env.get("STRIPE_SECRET_KEY") ?? "",
  webhookSecret: Deno.env.get("STRIPE_MANUAL_FISCAL_WEBHOOK_SECRET") ?? "",
  expectedAccountId: Deno.env.get("TRUCKCONTROL_MANUAL_STRIPE_ACCOUNT_ID") ?? "",
}));

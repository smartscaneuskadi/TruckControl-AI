import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createManualStripeWebhookHandler } from "./handler.ts";
import { persistManualStripePayment } from "../_shared/subscription-stripe-persistence.ts";
import { lookupKnownStripePayment } from "../_shared/subscription-financial-persistence.ts";
import { manualStripeRuntimeAllowed } from "../_shared/subscription-stripe-runtime.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const client = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } });
const mode = Deno.env.get("TRUCKCONTROL_MANUAL_STRIPE_MODE");
Deno.serve(createManualStripeWebhookHandler({
  async applyPayment(payment) {
    await persistManualStripePayment((name, parameters) => client.rpc(name, parameters), payment);
  },
  knownPaymentEvent: (account, paymentMode, event) =>
    lookupKnownStripePayment((name, parameters) => client.rpc(name, parameters), account, paymentMode, event),
}, {
  knownPaymentEvents: Deno.env.get("TRUCKCONTROL_STRIPE_INCIDENTS_SCHEMA_ACCEPTED") === "true",
  // Separate switches: deploying code alone never enables even the sandbox pipeline.
  enabled: Deno.env.get("TRUCKCONTROL_MANUAL_STRIPE_PIPELINE_ENABLED") === "true" &&
    manualStripeRuntimeAllowed(supabaseUrl, mode, Deno.env.get("TRUCKCONTROL_MANUAL_STRIPE_TEST_PROJECT_REF")),
  schemaAccepted: Deno.env.get("TRUCKCONTROL_MANUAL_STRIPE_SCHEMA_ACCEPTED") === "true",
  mode: mode === "live" ? "live" : "test",
  stripeKey: Deno.env.get("STRIPE_SECRET_KEY") ?? "",
  webhookSecret: Deno.env.get("STRIPE_MANUAL_FISCAL_WEBHOOK_SECRET") ?? "",
  expectedAccountId: Deno.env.get("TRUCKCONTROL_MANUAL_STRIPE_ACCOUNT_ID") ?? "",
}));

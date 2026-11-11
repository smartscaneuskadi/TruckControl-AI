import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createStripeIncidentHandler } from "./handler.ts";
import { persistStripeFinancialIncident } from "../_shared/subscription-financial-persistence.ts";
import { manualStripeRuntimeAllowed } from "../_shared/subscription-stripe-runtime.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const client = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } });
const mode = Deno.env.get("TRUCKCONTROL_MANUAL_STRIPE_MODE");
Deno.serve(createStripeIncidentHandler({
  record: (account, paymentMode, data) =>
    persistStripeFinancialIncident((name, parameters) => client.rpc(name, parameters), account, paymentMode, data),
}, {
  enabled: Deno.env.get("TRUCKCONTROL_STRIPE_INCIDENTS_ENABLED") === "true" &&
    manualStripeRuntimeAllowed(url, mode, Deno.env.get("TRUCKCONTROL_MANUAL_STRIPE_TEST_PROJECT_REF")),
  schemaAccepted: Deno.env.get("TRUCKCONTROL_STRIPE_INCIDENTS_SCHEMA_ACCEPTED") === "true",
  mode: mode === "live" ? "live" : "test",
  stripeKey: Deno.env.get("STRIPE_SECRET_KEY") ?? "",
  webhookSecret: Deno.env.get("STRIPE_FINANCIAL_INCIDENTS_WEBHOOK_SECRET") ?? "",
  expectedAccountId: Deno.env.get("TRUCKCONTROL_MANUAL_STRIPE_ACCOUNT_ID") ?? "",
}));

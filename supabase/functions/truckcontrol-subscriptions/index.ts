import { getSessionVerifiedUser } from "../_shared/auth-session.ts";
import { createLegacyStripeServer } from "../_shared/subscription-legacy-payment-gate.ts";
import { subscriptionFiscalCheckoutAllowed } from "../_shared/subscription-fiscal-gate.ts";
import { manualCheckoutReadiness } from "../_shared/manual-checkout-readiness.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createRecurringHandler } from "./handler.ts";
import {
  productionBillingOrigin,
  productionBillingOrigins,
} from "../_shared/billing-origins.ts";
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
Deno.serve(
  createRecurringHandler(
    {
      manualCheckoutReady: manualCheckoutReadiness(key => Deno.env.get(key),
        async account => await client.rpc("tc_manual_stripe_checkout_ready", { p_account: account }), "recurring"),
      async authenticate(token) {
        return getSessionVerifiedUser(client, token);
      },
      server: createLegacyStripeServer("recurring", async (action, data) => {
        const result = await client.rpc("tc_recurring_billing", {
          p_action: action,
          p_data: data,
        });
        if (result.error) throw new Error("Billing operation unavailable");
        return result.data;
      }),
    },
    {
      appOrigin: productionBillingOrigin(
        Deno.env.get("TRUCKCONTROL_APP_ORIGIN"),
      ),
      allowedOrigins: productionBillingOrigins,
      enabled: Deno.env.get("BILLING_RECURRING_ENABLED") === "true",
      stripeKey: Deno.env.get("STRIPE_SECRET_KEY"),
      webhookSecret: Deno.env.get("STRIPE_RECURRING_WEBHOOK_SECRET"),
      termsVersion: Deno.env.get("BILLING_TERMS_VERSION"),
      termsUrl: Deno.env.get("BILLING_TERMS_URL"),
      invoicingVerified: subscriptionFiscalCheckoutAllowed(Deno.env.get("BILLING_INVOICING_VERIFIED")),
    },
  ),
);
